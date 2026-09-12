import { describe, expect, it } from 'vitest'
import {
  computeSeekTarget,
  isDoubleTap,
  resolveGestureAxis,
  type TapRecord,
} from './playerGestures'

describe('playerGestures', () => {
  it('达到阈值后可判定水平或垂直手势方向', () => {
    expect(resolveGestureAxis(4, 5, 12)).toBeNull()
    expect(resolveGestureAxis(24, 8, 12)).toBe('horizontal')
    expect(resolveGestureAxis(7, 30, 12)).toBe('vertical')
  })

  it('水平滑动按画面宽度比例精确映射 seek 并钳制边界', () => {
    // 从 0 滑过整屏宽度 → 覆盖全片长
    expect(computeSeekTarget(0, 360, 360, 240)).toBe(240)
    // 反向滑满 → 回到 0
    expect(computeSeekTarget(100, -360, 360, 240)).toBe(0)
    // 半屏 → 一半时长
    expect(computeSeekTarget(50, 180, 360, 240)).toBe(170)
    // 非有限时长（直播）时只做增量预览
    expect(computeSeekTarget(100, 180, 360, Number.NaN)).toBe(100)
  })

  it('双击判定：时间窗与位移容差内才算双击', () => {
    const now = 1000
    const first: TapRecord = { x: 50, y: 60, timestamp: now - 100 }

    expect(isDoubleTap(first, 55, 60, now)).toBe(true)
    expect(isDoubleTap(first, 80, 60, now)).toBe(false) // 位移过大
    expect(isDoubleTap(first, 55, 60, now + 400)).toBe(false) // 超出时间窗
    expect(isDoubleTap(null, 55, 60, now)).toBe(false) // 无前一次点按
  })
})
