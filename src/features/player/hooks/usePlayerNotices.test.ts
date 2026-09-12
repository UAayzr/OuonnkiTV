import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerNotices } from './usePlayerNotices'

describe('usePlayerNotices', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('showPlayerNotice 添加一条从 100% 开始的通知', () => {
    const { result } = renderHook(() => usePlayerNotices())

    act(() => {
      result.current.showPlayerNotice('测试提示')
    })

    expect(result.current.transientNotices).toHaveLength(1)
    expect(result.current.transientNotices[0].message).toBe('测试提示')
    expect(result.current.transientNotices[0].progress).toBe(100)
    expect(result.current.transientNotices[0].createdAt).toBeGreaterThan(0)
  })

  it('进度在下一帧后归零（驱动进度条收缩动画）', () => {
    const { result } = renderHook(() => usePlayerNotices())

    act(() => {
      result.current.showPlayerNotice('A')
    })
    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(result.current.transientNotices[0].progress).toBe(0)
  })

  it('通知在 duration 后被移除', () => {
    const { result } = renderHook(() => usePlayerNotices())

    act(() => {
      result.current.showPlayerNotice('A', 2000)
    })
    expect(result.current.transientNotices).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(result.current.transientNotices).toHaveLength(0)
  })

  it('多条通知按各自 duration 独立移除', () => {
    const { result } = renderHook(() => usePlayerNotices())

    act(() => {
      result.current.showPlayerNotice('短', 1000)
    })
    act(() => {
      result.current.showPlayerNotice('长', 3000)
    })
    expect(result.current.transientNotices).toHaveLength(2)

    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(result.current.transientNotices).toHaveLength(1)
    expect(result.current.transientNotices[0].message).toBe('长')

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.transientNotices).toHaveLength(0)
  })

  it('主移除定时器丢失时，兜底巡检仍会清掉超期通知', () => {
    const timeoutSpy = vi.spyOn(window, 'setTimeout')
    const { result } = renderHook(() => usePlayerNotices())

    act(() => {
      result.current.showPlayerNotice('会卡住的通知', 2000)
    })
    expect(result.current.transientNotices).toHaveLength(1)

    // 模拟"移除定时器被意外取消"（组件重挂且 state 被保留 / HMR 热替换）：
    // 找到 delay 等于 duration 的那个定时器并清掉它，这条通知就只能靠巡检清除了。
    const removalIndex = timeoutSpy.mock.calls.findIndex(([, delay]) => delay === 2000)
    expect(removalIndex).toBeGreaterThanOrEqual(0)
    const removalId = timeoutSpy.mock.results[removalIndex]?.value as number | undefined
    expect(removalId).toBeDefined()
    window.clearTimeout(removalId as number)

    // 推进到 duration + 宽限之后：正常路径已失效，只有巡检能救场
    act(() => {
      vi.advanceTimersByTime(4000)
    })

    expect(result.current.transientNotices).toHaveLength(0)
  })
})
