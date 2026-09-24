import { describe, expect, it } from 'vitest'
import {
  accumulateSeekOffset,
  isDoubleTap,
  resolveGestureAxis,
  resolveSeekSpeedMultiplier,
  type TapRecord,
} from './playerGestures'

describe('playerGestures', () => {
  it('达到阈值后可判定水平或垂直手势方向', () => {
    expect(resolveGestureAxis(4, 5, 12)).toBeNull()
    expect(resolveGestureAxis(24, 8, 12)).toBe('horizontal')
    expect(resolveGestureAxis(7, 30, 12)).toBe('vertical')
  })

  it('横向滑动按增量累加 seek 偏移（滑满整屏 45 秒）', () => {
    // 慢滑滑满整屏 → 累加 45 秒
    expect(accumulateSeekOffset(0, 360, 360, 1)).toBe(45)
    // 半屏 → 22.5 秒
    expect(accumulateSeekOffset(0, 180, 360, 1)).toBe(22.5)
    // 增量叠加：已积累的偏移不会被后续步骤重算
    expect(accumulateSeekOffset(45, 180, 360, 1)).toBe(67.5)
    // 反向滑动等量抵消
    expect(accumulateSeekOffset(45, -360, 360, 1)).toBe(0)
    // 速度加成：同样的位移，快滑按倍数放大（上限 4 → 满屏 180 秒）
    expect(accumulateSeekOffset(0, 360, 360, 4)).toBe(180)
  })

  it('由快转慢时偏移不回退（增量累加，不随倍率缩水）', () => {
    // 快滑两步（顶格倍率 4）
    let offset = 0
    offset = accumulateSeekOffset(offset, 100, 360, 4)
    offset = accumulateSeekOffset(offset, 100, 360, 4)
    const afterFast = offset
    // 减速后手指继续前进（倍率降到 1）：偏移只能增加，不能因为倍率变小而缩水
    offset = accumulateSeekOffset(offset, 100, 360, 1)
    expect(offset).toBeGreaterThan(afterFast)
  })

  it('速度加成倍率：慢滑为 1 倍，快滑封顶在上限', () => {
    expect(resolveSeekSpeedMultiplier(0)).toBe(1)
    // 基准速度（0.4 px/ms）以下一律不加成
    expect(resolveSeekSpeedMultiplier(0.4)).toBe(1)
    expect(resolveSeekSpeedMultiplier(0.8)).toBe(2)
    // 超过上限后不再增长，防止"甩一下跳过好几分钟"
    expect(resolveSeekSpeedMultiplier(2)).toBe(4)
    expect(resolveSeekSpeedMultiplier(10)).toBe(4)
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
