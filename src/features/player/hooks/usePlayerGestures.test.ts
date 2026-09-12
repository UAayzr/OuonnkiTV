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
  toggle: ReturnType<typeof vi.fn>
  emit: (name: string, payload?: unknown) => void
}

const createFakeArt = (): FakeArt => {
  const $player = document.createElement('div')
  const video = document.createElement('video')
  $player.appendChild(video)
  document.body.appendChild($player)

  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  const toggle = vi.fn()

  const art = {
    template: { $player },
    video,
    currentTime: 0,
    duration: 120,
    playing: false,
    playbackRate: 1,
    fullscreen: false,
    fullscreenWeb: false,
    isLock: false,
    seek: 0,
    toggle,
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
    toggle,
    emit: (name, payload) => listeners.get(name)?.forEach(handler => handler(payload)),
  }
}

const renderGestures = (options: {
  art: Artplayer
  onSurfaceTap?: () => void
  swipeGestureEnabled?: boolean
}) => {
  return renderHook(() =>
    usePlayerGestures({
      art: options.art,
      swipeGestureEnabled: options.swipeGestureEnabled ?? false,
      longPressPlaybackRate: 2,
      onSurfaceTap: options.onSurfaceTap,
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

  it('画面单击立即触发 onSurfaceTap（不等双击窗口，保证显隐手感）', () => {
    const { art, video } = createFakeArt()
    const onSurfaceTap = vi.fn()
    renderGestures({ art, onSurfaceTap })

    act(() => {
      video.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
    })

    expect(onSurfaceTap).toHaveBeenCalledTimes(1)
  })

  it('双击触发播放/暂停，且只切换一次', () => {
    const { art, video, toggle } = createFakeArt()
    renderGestures({ art })

    act(() => {
      video.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
      video.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
      video.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 10, clientY: 10 }))
    })

    // 第二次 click 判定为双击 → toggle；随后的 dblclick 被抑制，不重复触发
    expect(toggle).toHaveBeenCalledTimes(1)
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
    const { art, $player, toggle } = createFakeArt()
    renderGestures({ art })

    act(() => {
      const touch = { clientX: 50, clientY: 50, identifier: 1 }
      $player.dispatchEvent(makeTouchEvent('touchstart', [touch]))
      $player.dispatchEvent(makeTouchEvent('touchend', [touch]))
      $player.dispatchEvent(makeTouchEvent('touchstart', [touch]))
      $player.dispatchEvent(makeTouchEvent('touchend', [touch]))
    })

    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it('触屏单次轻点立即触发 onSurfaceTap', () => {
    const { art, $player } = createFakeArt()
    const onSurfaceTap = vi.fn()
    renderGestures({ art, onSurfaceTap })

    act(() => {
      const touch = { clientX: 50, clientY: 50, identifier: 1 }
      $player.dispatchEvent(makeTouchEvent('touchstart', [touch]))
      $player.dispatchEvent(makeTouchEvent('touchend', [touch]))
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
})
