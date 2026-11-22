import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHlsLoaderClass } from './hls-loader'
import {
  clearFragmentPrefetch,
  configureFragmentPrefetch,
  prefetchFragment,
} from './fragment-prefetch'

/** 模拟 hls.js 默认加载器基类 */
const baseLoad = vi.fn()
class DefaultLoader {
  load = baseLoad
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
    expect(callbacks.onSuccess.mock.calls[0][0].data).toBeInstanceOf(ArrayBuffer)
    // 已由队列投喂,默认加载路径不应再发请求
    expect(baseLoad).not.toHaveBeenCalled()
  })
})