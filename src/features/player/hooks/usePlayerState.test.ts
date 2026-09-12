import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type Artplayer from 'artplayer'
import { usePlayerState } from './usePlayerState'

interface FakeArt {
  art: Artplayer
  video: HTMLVideoElement
  setPaused: (paused: boolean) => void
  emit: (name: string, payload?: unknown) => void
}

/**
 * 假 art 刻意让 `playing` 复刻 Artplayer 的真实实现（带 `currentTime > 0` 条件），
 * 这样一旦实现回退成读 art.playing，下面的用例就会失败。
 */
const createFakeArt = (): FakeArt => {
  const video = document.createElement('video')
  document.body.appendChild(video)

  let paused = true
  Object.defineProperty(video, 'paused', { get: () => paused, configurable: true })

  const listeners = new Map<string, Set<(payload: unknown) => void>>()

  const art = {
    video,
    currentTime: 0,
    duration: 120,
    playbackRate: 1,
    fullscreen: false,
    fullscreenWeb: false,
    mini: false,
    pip: false,
    get playing() {
      // Artplayer 5 的原始判定
      return video.currentTime > 0 && !paused && !video.ended && video.readyState > 2
    },
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
    video,
    setPaused: (value: boolean) => {
      paused = value
    },
    emit: (name, payload) => listeners.get(name)?.forEach(handler => handler(payload)),
  }
}

describe('usePlayerState', () => {
  it('video:play 时即使 currentTime 仍为 0，playing 也应为 true', () => {
    const { art, setPaused, emit } = createFakeArt()
    const { result } = renderHook(() => usePlayerState(art))

    act(() => {
      // 起播瞬间：video 已在播放，但 currentTime 还没走够一帧
      setPaused(false)
      emit('video:play')
    })

    expect(result.current.playing).toBe(true)
  })

  it('订阅 video:playing，缓冲结束后把状态兜回来', () => {
    const { art, setPaused, emit } = createFakeArt()
    const { result } = renderHook(() => usePlayerState(art))

    act(() => {
      setPaused(false)
      emit('video:play')
    })
    act(() => {
      setPaused(true)
      emit('video:pause')
    })
    expect(result.current.playing).toBe(false)

    act(() => {
      setPaused(false)
      emit('video:playing')
    })
    expect(result.current.playing).toBe(true)
  })

  it('视频播完（ended）后 playing 回到 false', () => {
    const { art, setPaused, emit } = createFakeArt()
    const { result } = renderHook(() => usePlayerState(art))

    act(() => {
      setPaused(false)
      emit('video:play')
    })
    expect(result.current.playing).toBe(true)

    act(() => {
      setPaused(true)
      emit('video:ended')
    })
    expect(result.current.playing).toBe(false)
  })

  it('卸载后移除监听', () => {
    const { art, setPaused, emit } = createFakeArt()
    const { result, unmount } = renderHook(() => usePlayerState(art))

    unmount()

    act(() => {
      setPaused(false)
      emit('video:play')
    })

    expect(result.current.playing).toBe(false)
  })
})
