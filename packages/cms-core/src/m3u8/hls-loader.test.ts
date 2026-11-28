import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHlsLoaderClass } from './hls-loader'
import {
  clearFragmentPrefetch,
  configureFragmentPrefetch,
  getFragmentPrefetchStats,
  prefetchFragment,
} from './fragment-prefetch'

/** 模拟 hls.js 默认加载器基类 */
const baseLoad = vi.fn()
class DefaultLoader {
  load = baseLoad
  stats = {
    aborted: false,
    loaded: 0,
    retry: 0,
    total: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, first: 0, end: 0 },
  }
  abort = vi.fn()
  destroy = vi.fn()
}

const FakeHls = {
  DefaultConfig: { loader: DefaultLoader },
}

const fakeProcessor = {
  process: vi.fn((text: string) => `filtered:${text}`),
}

function createLoader(
  overrides: { m3u8Processor?: unknown; urlTransformer?: (url: string) => string } = {},
) {
  const CustomLoader = createHlsLoaderClass({
    m3u8Processor: overrides.m3u8Processor === undefined ? fakeProcessor : (overrides.m3u8Processor as never),
    ...(overrides.urlTransformer ? { urlTransformer: overrides.urlTransformer } : {}),
    Hls: FakeHls,
  })
  const instance = new CustomLoader({})
  const callbacks = { onSuccess: vi.fn() }
  return { instance, callbacks }
}

/** 真实 hls.js 的分片 context:没有 type 字段,靠 frag 标识(1.6.x FragmentLoaderContext) */
const fragContext = (url: string) => ({ frag: {}, url })

/** 清单/档位 context 才带 type */
const playlistContext = (type: 'manifest' | 'level', url: string) => ({ type, url })

afterEach(() => {
  baseLoad.mockClear()
  fakeProcessor.process.mockClear()
  clearFragmentPrefetch()
  vi.unstubAllGlobals()
})

describe('createHlsLoaderClass', () => {
  it('urlTransformer 对 manifest/level/frag 全部生效', () => {
    const transformer = vi.fn((url: string) => `proxy:${url}`)
    const { instance } = createLoader({ urlTransformer: transformer })

    for (const type of ['manifest', 'level'] as const) {
      const context = playlistContext(type, `https://cdn.example.com/${type}.m3u8`)
      instance.load(context, {}, {})
      expect(transformer).toHaveBeenCalledWith(`https://cdn.example.com/${type}.m3u8`)
      expect(context.url).toBe(`proxy:https://cdn.example.com/${type}.m3u8`)
    }

    const frag = fragContext('https://cdn.example.com/a.ts')
    instance.load(frag, {}, {})
    expect(transformer).toHaveBeenCalledWith('https://cdn.example.com/a.ts')
    expect(frag.url).toBe('proxy:https://cdn.example.com/a.ts')
  })

  it('未提供 urlTransformer 时 URL 原样', () => {
    const { instance, callbacks } = createLoader()
    const context = fragContext('https://cdn.example.com/a.ts')
    instance.load(context, {}, callbacks)
    expect(context.url).toBe('https://cdn.example.com/a.ts')
  })

  it('m3u8 文本处理仅当 processor 存在且类型为 manifest/level', () => {
    const { instance } = createLoader()

    // manifest: 处理
    const manifestContext = playlistContext('manifest', 'https://cdn.example.com/index.m3u8')
    const manifestCallbacks = { onSuccess: vi.fn() }
    instance.load(manifestContext, {}, manifestCallbacks)
    const manifestResponse = { data: '#EXTM3U\n' }
    manifestCallbacks.onSuccess(manifestResponse, {}, manifestContext, null)
    expect(manifestResponse.data).toBe('filtered:#EXTM3U\n')

    // level: 处理
    const levelContext = playlistContext('level', 'https://cdn.example.com/mixed.m3u8')
    const levelCallbacks = { onSuccess: vi.fn() }
    instance.load(levelContext, {}, levelCallbacks)
    const levelResponse = { data: '#EXTM3U\n#EXTINF:10,' }
    levelCallbacks.onSuccess(levelResponse, {}, levelContext, null)
    expect(levelResponse.data).toBe('filtered:#EXTM3U\n#EXTINF:10,')

    // frag: 不处理文本
    const frag = fragContext('https://cdn.example.com/a.ts')
    const fragCallbacks = { onSuccess: vi.fn() }
    instance.load(frag, {}, fragCallbacks)
    const fragResponse = { data: 'ts-bytes' }
    fragCallbacks.onSuccess(fragResponse, {}, frag, null)
    expect(fragResponse.data).toBe('ts-bytes')
  })

  it('未传入 m3u8Processor 时不做文本处理,URL 重写仍生效', () => {
    const transformer = (url: string) => `proxy:${url}`
    const { instance, callbacks } = createLoader({ m3u8Processor: null, urlTransformer: transformer })

    const context = playlistContext('manifest', 'https://cdn.example.com/index.m3u8')
    instance.load(context, {}, callbacks)
    expect(context.url).toBe('proxy:https://cdn.example.com/index.m3u8')
    expect(callbacks.onSuccess).not.toHaveBeenCalled()
  })

  it('无 onSuccess 回调时 URL 重写仍执行且不报错', () => {
    const { instance } = createLoader({ urlTransformer: url => `proxy:${url}` })
    const context = fragContext('https://cdn.example.com/a.ts')
    expect(() => instance.load(context, {}, {})).not.toThrow()
    expect(context.url).toBe('proxy:https://cdn.example.com/a.ts')
  })

  it('真实分片 context(无 type,含 frag)命中预取队列:直接投喂,不走网络', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([0x47, 0x40]), { status: 200 })))
    configureFragmentPrefetch(url => url)

    const url = 'https://cdn.example.com/prefetched.ts'
    prefetchFragment(url)
    await Promise.resolve()

    const { instance, callbacks } = createLoader({ m3u8Processor: null })
    instance.load(fragContext(url), {}, callbacks)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1)
    const response = callbacks.onSuccess.mock.calls[0][0]
    expect(response.data).toBeInstanceOf(ArrayBuffer)
    // 已由队列投喂,默认加载路径不应再发请求
    expect(baseLoad).not.toHaveBeenCalled()

    // 必须给 hls.js 的 ABR 提供真实统计（frag.stats === loader.stats）
    const stats = callbacks.onSuccess.mock.calls[0][1]
    expect(stats.aborted).toBe(false)
    expect(stats.loaded).toBe(2)
    expect(stats.total).toBe(2)
    expect(stats.loading.start).toBeGreaterThan(0)
    expect(stats.loading.first).toBeGreaterThanOrEqual(stats.loading.start)
    expect(stats.loading.end).toBeGreaterThanOrEqual(stats.loading.first)
  })

  it('预取命中后 abort 取消下载并回调 onAbort,不再回调 onSuccess', async () => {
    let aborted = false
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              aborted = true
              reject(new Error('aborted'))
            })
          }),
      ),
    )
    configureFragmentPrefetch(url => url)
    const url = 'https://cdn.example.com/abort.ts'
    prefetchFragment(url)

    const { instance } = createLoader({ m3u8Processor: null })
    const callbacks = { onSuccess: vi.fn(), onAbort: vi.fn() }
    instance.load(
      fragContext(url),
      { loadPolicy: { maxTimeToFirstByteMs: 10_000, maxLoadTimeMs: 120_000 } },
      callbacks,
    )

    instance.abort()
    expect(callbacks.onAbort).toHaveBeenCalledTimes(1)
    expect(aborted).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(callbacks.onSuccess).not.toHaveBeenCalled()
  })

  it('预取首字节超时触发 onTimeout,不 fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      ),
    )
    configureFragmentPrefetch(url => url)
    const url = 'https://cdn.example.com/timeout.ts'
    prefetchFragment(url)

    const { instance } = createLoader({ m3u8Processor: null })
    const callbacks = { onSuccess: vi.fn(), onTimeout: vi.fn(), onAbort: vi.fn() }
    instance.load(
      fragContext(url),
      { loadPolicy: { maxTimeToFirstByteMs: 5, maxLoadTimeMs: 50 } },
      callbacks,
    )

    await new Promise(resolve => setTimeout(resolve, 25))
    expect(callbacks.onTimeout).toHaveBeenCalledTimes(1)
    expect(callbacks.onSuccess).not.toHaveBeenCalled()
    expect(baseLoad).not.toHaveBeenCalled()
  })

  it('预取失败 fallback 前复位统计,不触发 Loader can only be used once', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })))
    configureFragmentPrefetch(url => url)
    const url = 'https://cdn.example.com/fallback.ts'
    prefetchFragment(url)

    baseLoad.mockImplementationOnce(function (this: { stats: { loading: { start: number } } }) {
      if (this.stats.loading.start) throw new Error('Loader can only be used once.')
    })
    const { instance } = createLoader({ m3u8Processor: null })
    const callbacks = { onSuccess: vi.fn(), onError: vi.fn() }
    instance.load(fragContext(url), {}, callbacks)

    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(baseLoad).toHaveBeenCalledTimes(1)
    baseLoad.mockReset()
  })

  it('未命中预取的分片加载期间占用前台预算,完成后释放', () => {
    const { instance } = createLoader({ m3u8Processor: null })
    const callbacks = { onSuccess: vi.fn() }
    instance.load(fragContext('https://cdn.example.com/plain.ts'), {}, callbacks)

    expect(getFragmentPrefetchStats().foreground).toBe(1)
    const wrapped = (baseLoad.mock.calls[0] as unknown[])[2] as {
      onSuccess: (...args: unknown[]) => void
    }
    wrapped.onSuccess({}, {}, {}, null)
    expect(getFragmentPrefetchStats().foreground).toBe(0)
    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1)
  })

  it('非预取分片 abort 后也释放前台预算', () => {
    const { instance } = createLoader({ m3u8Processor: null })
    instance.load(fragContext('https://cdn.example.com/plain-abort.ts'), {}, { onSuccess: vi.fn() })

    expect(getFragmentPrefetchStats().foreground).toBe(1)
    instance.abort()
    expect(getFragmentPrefetchStats().foreground).toBe(0)
  })

  it('destroy 中止预取且不回调', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      ),
    )
    configureFragmentPrefetch(url => url)
    const url = 'https://cdn.example.com/destroy.ts'
    prefetchFragment(url)

    const { instance } = createLoader({ m3u8Processor: null })
    const callbacks = { onSuccess: vi.fn(), onAbort: vi.fn() }
    instance.load(
      fragContext(url),
      { loadPolicy: { maxTimeToFirstByteMs: 10_000, maxLoadTimeMs: 120_000 } },
      callbacks,
    )

    instance.destroy()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(callbacks.onSuccess).not.toHaveBeenCalled()
    expect(callbacks.onAbort).not.toHaveBeenCalled()
  })
})