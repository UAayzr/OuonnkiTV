import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Artplayer from 'artplayer'
import { usePlayerGestures } from './usePlayerGestures'

interface FakeTouch {
  clientX: number
  clientY: number
  identifier: number
}

const makeTouchList = (touches: FakeTouch[]) =>
  ({
    length: touches.length,
    item: (index: number) => touches[index] ?? null,
  }) as unknown as TouchList

const makeTouchEvent = (type: string, touches: FakeTouch[]) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'changedTouches', { value: makeTouchList(touches) })
  Object.defineProperty(event, 'touches', { value: makeTouchList(touches) })
  return event
}

interface FakeArt {
  art: Artplayer
  $player: HTMLDivElement
  video: HTMLVideoElement
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  /** 直接摆布 video.paused（jsdom 里是原型 getter，需自行接管） */
  setPaused: (paused: boolean) => void
  emit: (name: string, payload?: unknown) => void
}

const createFakeArt = (options: { fullscreen?: boolean } = {}): FakeArt => {
  const $player = document.createElement('div')
  const video = document.createElement('video')
  $player.appendChild(video)
  document.body.appendChild($player)

  /*
   * jsdom 不做布局，getBoundingClientRect 恒为全 0。补一个确定尺寸，
   * 否则手势换算里的 playerWidth 会退化成 0（safeWidth 兜底为 1），
   * 每步位移被放大成离谱的秒数、一路撞在 duration 的钳制边界上，测不出真实行为。
   */
  $player.getBoundingClientRect = () =>
    ({
      width: 360,
      height: 200,
      top: 0,
      left: 0,
      right: 360,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect

  let paused = true
  Object.defineProperty(video, 'paused', { get: () => paused, configurable: true })

  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  const play = vi.fn(() => {
    paused = false
    return Promise.resolve()
  })
  const pause = vi.fn(() => {
    paused = true
  })

  const art = {
    template: { $player },
    video,
    currentTime: 0,
    duration: 600,
    playbackRate: 1,
    fullscreen: options.fullscreen ?? false,
    fullscreenWeb: false,
    isLock: false,
    seek: 0,
    play,
    pause,
    on: (name: string, handler: (payload: unknown) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name)?.add(handler)
    },
    off: (name: string, handler: (payload: unknown) => void) => {
      listeners.get(name)?.delete(handler)
    },
  } as unknown as Artplayer

  return {
    art,
    $player,
    video,
    play,
    pause,
    setPaused: (value: boolean) => {
      paused = value
    },
    emit: (name, payload) => listeners.get(name)?.forEach(handler => handler(payload)),
  }
}

const renderGestures = (options: {
  art: Artplayer
  onSurfaceTap?: () => void
  onSeekGesturePreviewChange?: (time: number) => void
  onSeekGesturePreviewEnd?: () => void
  onLongPressRateChange?: (rate: number | null) => void
  swipeGestureEnabled?: boolean
}) => {
  return renderHook(() =>
    usePlayerGestures({
      art: options.art,
      swipeGestureEnabled: options.swipeGestureEnabled ?? false,
      longPressPlaybackRate: 2,
      onSurfaceTap: options.onSurfaceTap,
      onSeekGesturePreviewChange: options.onSeekGesturePreviewChange,
      onSeekGesturePreviewEnd: options.onSeekGesturePreviewEnd,
      onLongPressRateChange: options.onLongPressRateChange,
    }),
  )
}

describe('usePlayerGestures', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('画面单击在双击窗口结束后才触发 onSurfaceTap（避免双击时误切控制条）', () => {
    const { art, video } = createFakeArt()
    const onSurfaceTap = vi.fn()
    renderGestures({ art, onSurfaceTap })

    act(() => {
      video.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
    })

    // 窗口期内不触发：这段时间正用来区分单击与双击
    expect(onSurfaceTap).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(onSurfaceTap).toHaveBeenCalledTimes(1)
  })

  it('双击触发播放/暂停，且不切换控制条', () => {
    const { art, video, play } = createFakeArt()
    const onSurfaceTap = vi.fn()
    renderGestures({ art, onSurfaceTap })

    act(() => {
      video.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
      video.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
      video.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 10, clientY: 10 }))
      vi.advanceTimersByTime(400)
    })

    // 第二次 click 判定为双击 → 播放；随后的 dblclick 被抑制，不重复触发
    expect(play).toHaveBeenCalledTimes(1)
    // 第一次点击排队的控制条切换被撤销：双击只做播放/暂停
    expect(onSurfaceTap).not.toHaveBeenCalled()
  })

  it('已在播放时双击走暂停（不依赖 art.playing 的 currentTime>0 判定）', () => {
    const { art, video, play, pause, setPaused } = createFakeArt()
    setPaused(false) // 已在播放，但 currentTime 仍为 0——正是起播瞬间的形态
    renderGestures({ art })

    act(() => {
      video.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
      video.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
    })

    expect(pause).toHaveBeenCalledTimes(1)
    expect(play).not.toHaveBeenCalled()
  })

  it('控制条区域内的点击不被画面手势接管', () => {
    const { art, $player } = createFakeArt()
    const controls = document.createElement('div')
    controls.className = 'oki-player-controls'
    const button = document.createElement('button')
    controls.appendChild(button)
    $player.appendChild(controls)

    const onSurfaceTap = vi.fn()
    renderGestures({ art, onSurfaceTap })

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSurfaceTap).not.toHaveBeenCalled()
  })

  it('右键菜单被阻止（禁用 Artplayer 内置菜单）', () => {
    const { art, video } = createFakeArt()
    renderGestures({ art })

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    act(() => {
      video.dispatchEvent(event)
    })

    expect(event.defaultPrevented).toBe(true)
  })

  it('触屏轻点两次触发播放/暂停（自行仲裁，不依赖浏览器 dblclick）', () => {
    const { art, $player, play } = createFakeArt()
    const onSurfaceTap = vi.fn()
    renderGestures({ art, onSurfaceTap })

    act(() => {
      const touch = { clientX: 50, clientY: 50, identifier: 1 }
      $player.dispatchEvent(makeTouchEvent('touchstart', [touch]))
      $player.dispatchEvent(makeTouchEvent('touchend', [touch]))
      $player.dispatchEvent(makeTouchEvent('touchstart', [touch]))
      $player.dispatchEvent(makeTouchEvent('touchend', [touch]))
      vi.advanceTimersByTime(400)
    })

    expect(play).toHaveBeenCalledTimes(1)
    // 双击只做播放/暂停，控制条不被切走
    expect(onSurfaceTap).not.toHaveBeenCalled()
  })

  it('触屏单次轻点在双击窗口结束后触发 onSurfaceTap', () => {
    const { art, $player } = createFakeArt()
    const onSurfaceTap = vi.fn()
    renderGestures({ art, onSurfaceTap })

    act(() => {
      const touch = { clientX: 50, clientY: 50, identifier: 1 }
      $player.dispatchEvent(makeTouchEvent('touchstart', [touch]))
      $player.dispatchEvent(makeTouchEvent('touchend', [touch]))
    })

    expect(onSurfaceTap).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(onSurfaceTap).toHaveBeenCalledTimes(1)
  })

  it('卸载后移除监听，画面点击不再响应', () => {
    const { art, video } = createFakeArt()
    const onSurfaceTap = vi.fn()
    const { unmount } = renderGestures({ art, onSurfaceTap })

    unmount()

    act(() => {
      video.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
    })

    expect(onSurfaceTap).not.toHaveBeenCalled()
  })

  it('全屏下横向滑动触发 seek 预览', () => {
    const { art, $player } = createFakeArt({ fullscreen: true })
    const onSeekGesturePreviewChange = vi.fn()
    renderGestures({ art, swipeGestureEnabled: true, onSeekGesturePreviewChange })

    act(() => {
      const start = { clientX: 50, clientY: 80, identifier: 1 }
      const moved = { clientX: 160, clientY: 82, identifier: 1 }
      $player.dispatchEvent(makeTouchEvent('touchstart', [start]))
      $player.dispatchEvent(makeTouchEvent('touchmove', [moved]))
      $player.dispatchEvent(makeTouchEvent('touchend', [moved]))
    })

    expect(onSeekGesturePreviewChange).toHaveBeenCalled()
  })

  it('由快转慢时 seek 目标不回退（手指一直前进，目标只能单调不减）', () => {
    const { art, $player } = createFakeArt({ fullscreen: true })
    const targets: number[] = []
    const onSeekGesturePreviewChange = vi.fn((time: number) => targets.push(time))
    renderGestures({ art, swipeGestureEnabled: true, onSeekGesturePreviewChange })

    act(() => {
      const touch = { clientX: 40, clientY: 100, identifier: 1 }
      $player.dispatchEvent(makeTouchEvent('touchstart', [touch]))

      // 前半段：快滑，每帧 40px / 10ms
      let x = 40
      for (let i = 0; i < 4; i += 1) {
        x += 40
        vi.advanceTimersByTime(10)
        $player.dispatchEvent(makeTouchEvent('touchmove', [{ ...touch, clientX: x }]))
      }
      // 后半段：减速，手指仍在前进，但每帧只走 5px / 120ms
      for (let i = 0; i < 4; i += 1) {
        x += 5
        vi.advanceTimersByTime(120)
        $player.dispatchEvent(makeTouchEvent('touchmove', [{ ...touch, clientX: x }]))
      }

      $player.dispatchEvent(makeTouchEvent('touchend', [{ ...touch, clientX: x }]))
    })

    expect(targets.length).toBe(8)
    // 手指始终在前进：若拿"净位移 × 当前倍率"整体相乘，减速后倍率骤降会让目标倒退
    for (let i = 1; i < targets.length; i += 1) {
      expect(targets[i]).toBeGreaterThanOrEqual(targets[i - 1])
    }
  })

  it('纵向滑动不接管：不触发 seek 预览，也不会被误判成轻点', () => {
    const { art, $player } = createFakeArt({ fullscreen: true })
    const onSurfaceTap = vi.fn()
    const onSeekGesturePreviewChange = vi.fn()
    renderGestures({
      art,
      swipeGestureEnabled: true,
      onSurfaceTap,
      onSeekGesturePreviewChange,
    })

    act(() => {
      const start = { clientX: 50, clientY: 40, identifier: 1 }
      const moved = { clientX: 52, clientY: 190, identifier: 1 }
      $player.dispatchEvent(makeTouchEvent('touchstart', [start]))
      $player.dispatchEvent(makeTouchEvent('touchmove', [moved]))
      $player.dispatchEvent(makeTouchEvent('touchend', [moved]))
    })

    expect(onSeekGesturePreviewChange).not.toHaveBeenCalled()
    expect(onSurfaceTap).not.toHaveBeenCalled()
  })

  it('长按触发加速时上报倍率，抬手恢复后清空', () => {
    const { art, $player } = createFakeArt({ fullscreen: true })
    const onLongPressRateChange = vi.fn()
    renderGestures({ art, swipeGestureEnabled: true, onLongPressRateChange })

    act(() => {
      const touch = { clientX: 50, clientY: 50, identifier: 1 }
      $player.dispatchEvent(makeTouchEvent('touchstart', [touch]))
      vi.advanceTimersByTime(500)
      expect(art.playbackRate).toBe(2)
      $player.dispatchEvent(makeTouchEvent('touchend', [touch]))
    })

    expect(onLongPressRateChange).toHaveBeenNthCalledWith(1, 2)
    expect(onLongPressRateChange).toHaveBeenLastCalledWith(null)
    expect(art.playbackRate).toBe(1)
  })

  it('长按加速期间横滑不接管：不跳时长、预览不出现，抬手才恢复倍速', () => {
    const { art, $player } = createFakeArt({ fullscreen: true })
    const onSeekGesturePreviewChange = vi.fn()
    const onSeekGesturePreviewEnd = vi.fn()
    const onLongPressRateChange = vi.fn()
    renderGestures({
      art,
      swipeGestureEnabled: true,
      onSeekGesturePreviewChange,
      onSeekGesturePreviewEnd,
      onLongPressRateChange,
    })

    act(() => {
      const start = { clientX: 50, clientY: 50, identifier: 1 }
      $player.dispatchEvent(makeTouchEvent('touchstart', [start]))

      // 先长按到触发 2 倍速，此时 axis 仍是 null
      vi.advanceTimersByTime(500)
      expect(art.playbackRate).toBe(2)
      expect(onLongPressRateChange).toHaveBeenLastCalledWith(2)

      // 加速期间横向拖动：本次会话不再接管横滑，
      // 倍率保持不变、不跳时长、预览也不出现（否则两个浮层会一起抢画面中轴）
      const moved = { clientX: 190, clientY: 52, identifier: 1 }
      $player.dispatchEvent(makeTouchEvent('touchmove', [moved]))
      expect(art.playbackRate).toBe(2)
      expect(art.seek).toBe(0)
      expect(onSeekGesturePreviewChange).not.toHaveBeenCalled()
      expect(onSeekGesturePreviewEnd).not.toHaveBeenCalled()

      // 抬手才结束加速
      $player.dispatchEvent(makeTouchEvent('touchend', [moved]))
    })

    expect(art.playbackRate).toBe(1)
    expect(onLongPressRateChange).toHaveBeenLastCalledWith(null)
  })
})
