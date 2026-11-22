import type Artplayer from 'artplayer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearFragmentPrefetch, getFragmentPrefetchStats } from '@ouonnki/cms-core/m3u8'
import { attachHlsPlayback } from './hlsPlayback'
import { wrapPlaybackUrl } from '@/shared/lib/playbackUrl'

// Mock hls.js light 模块(hlsPlayback 动态 import)
class FakeDefaultLoader {
  load = vi.fn()
}

const fakeHlsInstances: {
  config: Record<string, unknown>
  loadSource: ReturnType<typeof vi.fn>
  attachMedia: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}[] = []

vi.mock('hls.js/dist/hls.light.mjs', () => ({
  default: class FakeHls {
    static isSupported = () => true
    static DefaultConfig = { loader: FakeDefaultLoader }
    static Events = { LEVEL_LOADED: 'LEVEL_LOADED', FRAG_LOADING: 'FRAG_LOADING', FRAG_LOADED: 'FRAG_LOADED' }
    loadSource = vi.fn()
    attachMedia = vi.fn()
    destroy = vi.fn()
    on = vi.fn()
    constructor(config: Record<string, unknown>) {
      fakeHlsInstances.push({
        config,
        loadSource: this.loadSource,
        attachMedia: this.attachMedia,
        destroy: this.destroy,
        on: this.on,
      })
    }
  },
}))

const PROXY = '/proxy?url='

function createFakeArt() {
  return {
    on: vi.fn(),
    notice: { show: '' },
  }
}

function createVideo() {
  return {
    canPlayType: vi.fn(() => ''),
    src: '',
    currentTime: 0,
    playbackRate: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLMediaElement
}

const flushAsync = () => new Promise(resolve => setTimeout(resolve, 0))

const defaultArgs = (): Parameters<typeof attachHlsPlayback>[0] => ({
  video: createVideo(),
  url: 'https://vip.dytt-network.com/20261101/41978_249e668a/index.m3u8',
  art: createFakeArt() as unknown as Artplayer,
  isCurrentPlayer: () => true,
  adFilteringEnabled: false,
})

beforeEach(() => {
  fakeHlsInstances.length = 0
})

afterEach(() => {
  clearFragmentPrefetch()
  vi.unstubAllGlobals()
})

describe('attachHlsPlayback', () => {
  it('默认配置:裸 URL 加载,hls 创建成功', async () => {
    await attachHlsPlayback(defaultArgs())
    await flushAsync()

    expect(fakeHlsInstances).toHaveLength(1)
    expect(fakeHlsInstances[0].loadSource).toHaveBeenCalledWith(
      'https://vip.dytt-network.com/20261101/41978_249e668a/index.m3u8',
    )
    expect(fakeHlsInstances[0].config.loader).toBeUndefined()
    // 未注入 loader:分片预取不启动,避免预取队列无人消费造成重复下载
    expect(fakeHlsInstances[0].on).not.toHaveBeenCalled()
  })

  it('adFilteringEnabled=true:注入处理广告的 loader,URL 不重写', async () => {
    await attachHlsPlayback({ ...defaultArgs(), adFilteringEnabled: true })
    await flushAsync()

    expect(fakeHlsInstances[0].config.loader).toBeDefined()
    // 注入了 loader → 分片预取随之启用(LEVEL_LOADED 监听已挂)
    expect(fakeHlsInstances[0].on).toHaveBeenCalledWith('LEVEL_LOADED', expect.any(Function))
    const loaderInstance = new (fakeHlsInstances[0].config.loader as unknown as new () => { load: (c: unknown, l: unknown, cb: unknown) => void })()
    const context = {
      url: 'https://vip.dytt-network.com/20261101/41978_249e668a/index.m3u8',
      type: 'manifest',
    }
    ;(loaderInstance as { load: (c: unknown, l: unknown, cb: unknown) => void }).load(
      context,
      {},
      { onSuccess: () => {} },
    )
    expect(context.url).toBe('https://vip.dytt-network.com/20261101/41978_249e668a/index.m3u8')
  })

  it('playbackProxyUrl:分片/清单 URL 被重写为代理前缀,防重复包裹', async () => {
    await attachHlsPlayback({ ...defaultArgs(), playbackProxyUrl: PROXY })
    await flushAsync()

    const loaderInstance = new (fakeHlsInstances[0].config.loader as unknown as new () => { load: (c: unknown, l: unknown, cb: unknown) => void })()
    const context = {
      url: 'https://vip.dytt-network.com/20261101/41978_249e668a/3000k/hls/a.ts',
      frag: {},
    }
    ;(loaderInstance as { load: (c: unknown, l: unknown, cb: unknown) => void }).load(
      context,
      {},
      { onSuccess: () => {} },
    )
    expect(context.url).toBe(`/proxy?url=${encodeURIComponent('https://vip.dytt-network.com/20261101/41978_249e668a/3000k/hls/a.ts')}`)

    // 已含代理前缀的 URL 不重复包裹
    const proxiedContext = { url: context.url, frag: {} }
    ;(loaderInstance as { load: (c: unknown, l: unknown, cb: unknown) => void }).load(
      proxiedContext,
      {},
      { onSuccess: () => {} },
    )
    expect(proxiedContext.url).toBe(context.url)
  })

  it('playbackProxyUrl + adFilteringEnabled 同时生效(loader 注入且重写)', async () => {
    await attachHlsPlayback({ ...defaultArgs(), adFilteringEnabled: true, playbackProxyUrl: PROXY })
    await flushAsync()

    expect(fakeHlsInstances[0].config.loader).toBeDefined()
    const loaderInstance = new (fakeHlsInstances[0].config.loader as unknown as new () => { load: (c: unknown, l: unknown, cb: unknown) => void })()
    const context = { url: 'https://cdn.example.com/x.ts', frag: {} }
    ;(loaderInstance as { load: (c: unknown, l: unknown, cb: unknown) => void }).load(
      context,
      {},
      { onSuccess: () => {} },
    )
    expect(context.url).toBe(
      `/proxy?url=${encodeURIComponent('https://cdn.example.com/x.ts')}`,
    )
  })

  it('播放器被替换(竞态)时不加载', async () => {
    await attachHlsPlayback({ ...defaultArgs(), isCurrentPlayer: () => false })
    await flushAsync()

    expect(fakeHlsInstances).toHaveLength(0)
  })

  it('Safari 原生回退:有代理时 video.src 用代理 URL,无代理时用裸 URL', async () => {
    const isSupported = vi
      .spyOn(await import('hls.js/dist/hls.light.mjs').then(m => m.default), 'isSupported')
      .mockReturnValue(false)
    const canPlayType = vi.fn(() => 'maybe')

    // 无代理:Safari 原生直连
    const video1 = createVideo()
    Object.defineProperty(video1, 'canPlayType', { value: canPlayType })
    await attachHlsPlayback({ ...defaultArgs(), video: video1 })
    await flushAsync()
    expect(video1.src).toBe('https://vip.dytt-network.com/20261101/41978_249e668a/index.m3u8')

    // 有代理:原生链路也走 /proxy(服务端 m3u8 重写让子请求进缓存)
    const video2 = createVideo()
    Object.defineProperty(video2, 'canPlayType', { value: canPlayType })
    await attachHlsPlayback({ ...defaultArgs(), video: video2, playbackProxyUrl: PROXY })
    await flushAsync()
    expect(video2.src).toBe(
      wrapPlaybackUrl('https://vip.dytt-network.com/20261101/41978_249e668a/index.m3u8', PROXY),
    )

    isSupported.mockRestore()
  })

  const makeFragments = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      sn: i,
      url: `https://cdn.example.com/f${i}.ts`,
      start: i * 4,
      duration: 4,
    }))

  const getHlsHandler = (event: string) => {
    const call = fakeHlsInstances[0].on.mock.calls.find(entry => entry[0] === event)
    return call?.[1] as (event: unknown, data: unknown) => void
  }

  const getVideoHandler = (video: HTMLMediaElement, event: string) => {
    const call = (video.addEventListener as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      entry => entry[0] === event,
    )
    return call?.[1] as () => void
  }

  it('首个分片加载完成后预取其后的窗口,续播不从文件开头补拉', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => new Response(new Uint8Array([0x47]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const video = createVideo()
    video.currentTime = 400 // 第 100 片(每片 4s)

    await attachHlsPlayback({ ...defaultArgs(), video, adFilteringEnabled: true })
    await flushAsync()
    getHlsHandler('LEVEL_LOADED')({}, { level: 0, details: { fragments: makeFragments(1000) } })
    // 首个分片加载完成前不预取,避免和它抢带宽
    expect(fetchMock).not.toHaveBeenCalled()

    getHlsHandler('FRAG_LOADED')({}, { frag: { sn: 100 } })
    await flushAsync()

    const urls = fetchMock.mock.calls.map(call => call[0] as string)
    // 只预取刚加载完的分片之后的内容,当前分片不重复下载
    expect(urls[0]).toBe('https://cdn.example.com/f101.ts')
    expect(urls).not.toContain('https://cdn.example.com/f0.ts')
    expect(urls).not.toContain('https://cdn.example.com/f100.ts')
  })

  it('seek 清空旧窗口,目标分片由 hls.js 下载,后续分片并发预取', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => new Response(new Uint8Array([0x47]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const video = createVideo()

    await attachHlsPlayback({ ...defaultArgs(), video, adFilteringEnabled: true })
    await flushAsync()
    getHlsHandler('LEVEL_LOADED')({}, { level: 0, details: { fragments: makeFragments(1000) } })
    getHlsHandler('FRAG_LOADED')({}, { frag: { sn: 0 } })
    await flushAsync()
    // 初始窗口 6 片(1..6,当前分片 0 不被预取)
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(getFragmentPrefetchStats().queued).toBe(6)

    fetchMock.mockClear()
    video.currentTime = 800 // 第 200 片
    getVideoHandler(video, 'seeking')()

    // seek 只清空旧窗口,不预取目标分片本身
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getFragmentPrefetchStats().queued).toBe(0)

    // 目标分片加载完成后,立即并发预取其后的 seek 窗口
    getHlsHandler('FRAG_LOADED')({}, { frag: { sn: 200 } })
    const urls = fetchMock.mock.calls.map(call => call[0] as string)
    expect(urls[0]).toBe('https://cdn.example.com/f201.ts')
    expect(urls.length).toBe(12)
    expect(getFragmentPrefetchStats().queued).toBe(12)

    // hls.js 对齐播放头时的相邻分片微调,不重复清空刚拉起的窗口
    fetchMock.mockClear()
    video.currentTime = 804 // 第 201 片,与上次 seek 仅相邻
    getVideoHandler(video, 'seeking')()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getFragmentPrefetchStats().queued).toBe(12)
  })
})