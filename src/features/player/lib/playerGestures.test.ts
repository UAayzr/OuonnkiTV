import { describe, expect, it } from 'vitest'
import {
  BRIGHTNESS,
  computeBrightnessTarget,
  computeSeekTarget,
  computeVolumeTarget,
  isDoubleTap,
  isLeftHalf,
  resolveGestureAxis,
  type TapRecord,
} from './playerGestures'

describe('playerGestures', () => {
  it('达到阈值后可判定水平或垂直手势方向', () => {
    expect(resolveGestureAxis(4, 5, 12)).toBeNull()
    expect(resolveGestureAxis(24, 8, 12)).toBe('horizontal')
    expect(resolveGestureAxis(7, 30, 12)).toBe('vertical')
  })

  it('左右半屏分区判定正确', () => {
    expect(isLeftHalf(100, 360)).toBe(true)
    expect(isLeftHalf(179, 360)).toBe(true)
    expect(isLeftHalf(180, 360)).toBe(false)
    expect(isLeftHalf(0, 0)).toBe(true)
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

  it('垂直滑动按屏高比例精确映射音量并钳制 0~1', () => {
    // 滑满 90% 屏高 → 全范围
    expect(computeVolumeTarget(0.5, -324, 360)).toBeCloseTo(1, 6)
    expect(computeVolumeTarget(0.5, 324, 360)).toBeCloseTo(0, 6)
    expect(computeVolumeTarget(0.05, 1000, 360)).toBe(0)
    expect(computeVolumeTarget(0.95, -1000, 360)).toBe(1)
  })

  it('垂直滑动按屏高比例精确映射亮度并钳制范围', () => {
    const range = BRIGHTNESS.max - BRIGHTNESS.min
    const fullSwipe = 360 * 0.9

    // 从默认值向上滑满 → 上限
    expect(computeBrightnessTarget(BRIGHTNESS.default, -fullSwipe, 360)).toBe(BRIGHTNESS.max)
    // 从默认值向下滑满 → 下限
    expect(computeBrightnessTarget(BRIGHTNESS.default, fullSwipe, 360)).toBe(BRIGHTNESS.min)
    // 钳制
    expect(computeBrightnessTarget(BRIGHTNESS.default, 10000, 360)).toBe(BRIGHTNESS.min)
    expect(computeBrightnessTarget(BRIGHTNESS.default, -10000, 360)).toBe(BRIGHTNESS.max)
    // 中间值
    const half = computeBrightnessTarget(BRIGHTNESS.default, -fullSwipe / 2, 360)
    expect(half).toBeCloseTo(BRIGHTNESS.default + range / 2, 6)
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
