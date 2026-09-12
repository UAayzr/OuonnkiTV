import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock hls.js light 模块（framePreviewer 动态 import）
const fakeHlsInstances: { loadSource: ReturnType<typeof vi.fn>; attachMedia: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[] = []

vi.mock('hls.js/dist/hls.light.mjs', () => ({
  default: class FakeHls {
    static isSupported = () => true
    loadSource = vi.fn()
    attachMedia = vi.fn()
    destroy = vi.fn()
    constructor() {
      fakeHlsInstances.push(this)
    }
  },
}))

/** 注入可控行为后的真实 jsdom video 元素 */
type MockVideo = Omit<
  HTMLVideoElement,
  'readyState' | 'videoWidth' | 'videoHeight' | 'load' | 'remove'
> & {
  readyState: number
  videoWidth: number
  videoHeight: number
  load: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

let createdVideo: MockVideo | null = null

import { createFramePreviewer } from './framePreviewer'

describe('framePreviewer', () => {
  beforeEach(() => {
    createdVideo = null
    fakeHlsInstances.length = 0
    // restoreMocks: true 会在测试前恢复 spy，故每个测试前重新建立
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(tag => {
      if (tag === 'video') {
        const video = originalCreateElement('video')
        // 覆盖只读媒体属性为可写，以便测试注入状态
        Object.defineProperty(video, 'readyState', { value: 0, writable: true, configurable: true })
        Object.defineProperty(video, 'videoWidth', { value: 0, writable: true, configurable: true })
        Object.defineProperty(video, 'videoHeight', { value: 0, writable: true, configurable: true })
        // seek 完成时触发 seeked，模拟真实 seek 异步行为
        let currentTimeValue = 0
        Object.defineProperty(video, 'currentTime', {
          get: () => currentTimeValue,
          set: (value: number) => {
            currentTimeValue = value
            video.dispatchEvent(new Event('seeked'))
          },
          configurable: true,
        })
        video.load = vi.fn()
        video.remove = vi.fn()
        createdVideo = video as MockVideo
        return video
      }
      if (tag === 'canvas') {
        return originalCreateElement('canvas')
      }
      return originalCreateElement(tag)
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('原生 URL 用 video.src 加载', async () => {
    const previewer = await createFramePreviewer('https://cdn.example.com/video.mp4')
    expect(createdVideo).not.toBeNull()
    expect(createdVideo!.src).toBe('https://cdn.example.com/video.mp4')
    expect(createdVideo!.crossOrigin).toBe('anonymous')
    expect(fakeHlsInstances).toHaveLength(0)

    previewer.destroy()
    expect(createdVideo!.remove).toHaveBeenCalled()
  })

  it('m3u8 URL 走 hls.js 实例', async () => {
    const previewer = await createFramePreviewer('https://cdn.example.com/stream/index.m3u8')
    expect(fakeHlsInstances).toHaveLength(1)
    expect(fakeHlsInstances[0].loadSource).toHaveBeenCalledWith(
      'https://cdn.example.com/stream/index.m3u8',
    )
    expect(fakeHlsInstances[0].attachMedia).toHaveBeenCalledWith(createdVideo)

    previewer.destroy()
    expect(fakeHlsInstances[0].destroy).toHaveBeenCalled()
  })

  it('就绪且有画面尺寸时 capture 返回一帧', async () => {
    const previewer = await createFramePreviewer('https://cdn.example.com/video.mp4')
    createdVideo!.readyState = 2
    createdVideo!.videoWidth = 1920
    createdVideo!.videoHeight = 1080

    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D)

    const frame = await previewer.capture(10)

    expect(frame).not.toBeNull()
    expect(frame).toBeInstanceOf(HTMLCanvasElement)
    expect(drawImage).toHaveBeenCalled()

    previewer.destroy()
  })

  it('无画面尺寸时 capture 返回 null（回退封面）', async () => {
    const previewer = await createFramePreviewer('https://cdn.example.com/video.mp4')
    createdVideo!.readyState = 2
    createdVideo!.videoWidth = 0
    createdVideo!.videoHeight = 0

    const frame = await previewer.capture(10)
    expect(frame).toBeNull()

    previewer.destroy()
  })
})
