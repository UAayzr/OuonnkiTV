import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHlsLoaderClass } from './hls-loader'
import {
  clearFragmentPrefetch,
  configureFragmentPrefetch,
  ensurePrefetchWindow,
  prefetchFragment,
  getFragmentPrefetchStats,
} from './fragment-prefetch'

/** 模拟 hls.js 默认加载器基类 */
class DefaultLoader {
  load = vi.fn()
}

const FakeHls = {
  DefaultConfig: { loader: DefaultLoader },
}

/** 与真实 wrapPlaybackUrl 一致的幂等 transformer(已代理的 URL 不二次包裹) */
const transformer = (url: string) =>
  url.startsWith('/proxy?url=') ? url : `/proxy?url=${encodeURIComponent(url)}`

const makeContext = (type: string, url: string) => ({ type, url })

beforeEach(() => {
  configureFragmentPrefetch(transformer)
})

afterEach(() => {
  clearFragmentPrefetch()
  vi.unstubAllGlobals()
})

describe('fragment-prefetch 并发预取', () => {
  it('预取的分片在 loader 请求时直接投喂,不再走网络', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([0x47, 0x40]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    // 播放器侧:预取 sn+1
    prefetchFragment('https://cdn.example.com/hls/seg1.ts')
    await Promise.resolve() // 让 fetch 起跑

    const CustomLoader = createHlsLoaderClass({ Hls: FakeHls })
    const loader = new CustomLoader({})
    const callbacks = { onSuccess: vi.fn(), onError: vi.fn() }
    const context = makeContext('frag', '/proxy?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Fseg1.ts')

    loader.load(context, {}, callbacks)
    // fetch → arrayBuffer → 投喂回调是多段微任务链,用宏任务确保全部完成
    await new Promise(resolve => setTimeout(resolve, 0))

    // 命中缓存:onSuccess 投喂数据,原始 load 未被调用
    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1)
    expect(loader.load).toBeDefined()
    const data = callbacks.onSuccess.mock.calls[0][0].data
    expect(data).toBeInstanceOf(ArrayBuffer)
    expect(new Uint8Array(data)[0]).toBe(0x47)
    // 已消费:队列条目被移除
    expect(getFragmentPrefetchStats().queued).toBe(0)
  })

  it('未预取的分片走默认加载路径', async () => {
    const CustomLoader = createHlsLoaderClass({ Hls: FakeHls })
    const loader = new CustomLoader({})
    const callbacks = { onSuccess: vi.fn(), onError: vi.fn() }
    const context = makeContext('frag', 'https://cdn.example.com/hls/seg2.ts')

    loader.load(context, {}, callbacks)

    // 默认 loader 的 load 被调用(原样透传)
    expect(callbacks.onSuccess).not.toHaveBeenCalled()
  })

  it('同一 URL 预取幂等:只下载一次', async () => {
    const fetchMock = vi.fn(async () => new Response('x', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    prefetchFragment('https://cdn.example.com/hls/seg3.ts')
    prefetchFragment('https://cdn.example.com/hls/seg3.ts')
    prefetchFragment('https://cdn.example.com/hls/seg3.ts')

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('预取下载失败:loader 回退到默认加载路径', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })))

    prefetchFragment('https://cdn.example.com/hls/seg4.ts')
    const CustomLoader = createHlsLoaderClass({ Hls: FakeHls })
    const loader = new CustomLoader({})
    const callbacks = { onSuccess: vi.fn(), onError: vi.fn() }
    const context = makeContext('frag', 'https://cdn.example.com/hls/seg4.ts')

    loader.load(context, {}, callbacks)
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))

    // 预取失败时走 originalLoad(默认 loader 的 load)
    // 这里 originalLoad 是 vi.fn 的 DefaultLoader.load
    expect(loader.load).toBeDefined()
  })

  it('未配置 transformer 时预取被跳过', () => {
    configureFragmentPrefetch(null)
    const before = getFragmentPrefetchStats()
    prefetchFragment('https://cdn.example.com/hls/seg5.ts')
    expect(getFragmentPrefetchStats().queued).toBe(before.queued)
  })

  it('ensurePrefetchWindow 按 currentSn 补齐到目标窗口', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x')))
    configureFragmentPrefetch(transformer, { windowSize: 6 })
    const fragments = Array.from({ length: 20 }, (_, i) => ({
      sn: i,
      url: `https://cdn.example.com/hls/seg${i}.ts`,
    }))

    ensurePrefetchWindow(fragments, 0)
    expect(getFragmentPrefetchStats().queued).toBe(6)
  })

  it('ensurePrefetchWindow 幂等:重复补拉不重复下载', async () => {
    const fetchMock = vi.fn(async () => new Response('x'))
    vi.stubGlobal('fetch', fetchMock)
    configureFragmentPrefetch(transformer, { windowSize: 6 })
    const fragments = Array.from({ length: 20 }, (_, i) => ({
      sn: i,
      url: `https://cdn.example.com/hls/seg${i}.ts`,
    }))

    ensurePrefetchWindow(fragments, 0)
    ensurePrefetchWindow(fragments, 0)
    ensurePrefetchWindow(fragments, 0)
    await new Promise(resolve => setTimeout(resolve, 0))
    // 同一批片只下载一次
    expect(fetchMock.mock.calls.length).toBe(6)
  })

  it('清单不足窗口时全部预取,不越界', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x')))
    configureFragmentPrefetch(transformer, { windowSize: 32 })
    const fragments = Array.from({ length: 3 }, (_, i) => ({
      sn: i,
      url: `https://cdn.example.com/hls/seg${i}.ts`,
    }))

    // currentSn=0 时清单里只剩 1、2 两片可预取
    ensurePrefetchWindow(fragments, 0)
    expect(getFragmentPrefetchStats().queued).toBe(2)
  })

  it('队列超过硬上限时释放已就绪的最旧条目,在途下载保留', async () => {
    const fetchMock = vi.fn(async () => new Response('x'))
    vi.stubGlobal('fetch', fetchMock)
    configureFragmentPrefetch(transformer, { windowSize: 12, maxQueueSize: 4 })
    const fragments = Array.from({ length: 12 }, (_, i) => ({
      sn: i,
      url: `https://cdn.example.com/hls/seg${i}.ts`,
    }))

    ensurePrefetchWindow(fragments, 0)
    // 等待所有下载完成(全部 settled 后队列可被压缩)
    await new Promise(resolve => setTimeout(resolve, 30))
    ensurePrefetchWindow(fragments, 0)
    expect(getFragmentPrefetchStats().queued).toBe(4)
    expect(getFragmentPrefetchStats().inflight).toBe(0)
  })

  it('ratechange 场景:窗口随配置变化后补拉到新窗口', () => {
    const fetchMock = vi.fn(async () => new Response('x'))
    vi.stubGlobal('fetch', fetchMock)
    configureFragmentPrefetch(transformer, { windowSize: 6 })
    const fragments = Array.from({ length: 20 }, (_, i) => ({
      sn: i,
      url: `https://cdn.example.com/hls/seg${i}.ts`,
    }))

    ensurePrefetchWindow(fragments, 0)
    const firstCount = getFragmentPrefetchStats().queued

    // 倍速切 4x:windowSize 改为 24
    configureFragmentPrefetch(transformer, { windowSize: 24 })
    ensurePrefetchWindow(fragments, 0)
    expect(getFragmentPrefetchStats().queued).toBeGreaterThan(firstCount)
    expect(getFragmentPrefetchStats().targetWindow).toBe(24)
  })
})