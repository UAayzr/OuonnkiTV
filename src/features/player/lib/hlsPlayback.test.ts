import type Artplayer from 'artplayer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('attachHlsPlayback', () => {
  it('默认配置:裸 URL 加载,hls 创建成功', async () => {
    await attachHlsPlayback(defaultArgs())
    await flushAsync()

    expect(fakeHlsInstances).toHaveLength(1)
    expect(fakeHlsInstances[0].loadSource).toHaveBeenCalledWith(
      'https://vip.dytt-network.com/20261101/41978_249e668a/index.m3u8',
    )
    expect(fakeHlsInstances[0].config.loader).toBeUndefined()
  })

  it('adFilteringEnabled=true:注入处理广告的 loader,URL 不重写', async () => {
    await attachHlsPlayback({ ...defaultArgs(), adFilteringEnabled: true })
    await flushAsync()

    expect(fakeHlsInstances[0].config.loader).toBeDefined()
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
      type: 'frag',
    }
    ;(loaderInstance as { load: (c: unknown, l: unknown, cb: unknown) => void }).load(
      context,
      {},
      { onSuccess: () => {} },
    )
    expect(context.url).toBe(`/proxy?url=${encodeURIComponent('https://vip.dytt-network.com/20261101/41978_249e668a/3000k/hls/a.ts')}`)

    // 已含代理前缀的 URL 不重复包裹
    const proxiedContext = { url: context.url, type: 'frag' }
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
    const context = { url: 'https://cdn.example.com/x.ts', type: 'frag' }
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
})