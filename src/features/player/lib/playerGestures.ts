import { clampValue } from './playerUtils'

/**
 * 手势方向：水平（seek）、垂直（不接管）、null（未确定）。
 * 垂直只作为"这不是横向手势"的判据，亮度/音量滑动已移除。
 */
export type GestureAxis = 'horizontal' | 'vertical' | null

export const GESTURE_CONFIG = {
  /** 手势激活所需的最小滑动距离（像素） */
  axisLockThresholdPx: 12,
  /** 双击判定时间窗口（毫秒） */
  doubleTapWindowMs: 320,
  /** 双击判定位移容差（像素） */
  doubleTapMoveTolerancePx: 12,
  /**
   * 横滑滑满整屏宽度对应的 seek 秒数（慢滑基准）。
   * 固定值，不随视频时长缩放——按比例映射时长会让长片"轻划一下就跳几十秒"，
   * 无法微调；大跨度跳转交给进度条拖拽。
   *
   * 取值要按"一次自然横滑"校准，而不是按满屏：拇指在手机屏上通常只滑得动
   * 100~150px（约屏宽的 1/4 ~ 1/3），45 秒/屏换算下来一次滑动约 17 秒。
   * 早先取 15 秒/屏就是只算了满屏，落到手指上只剩 5 秒，滑起来像推不动。
   */
  seekSecondsPerScreenWidth: 45,
  /**
   * 速度加成的基准速度（px/ms）：低于它不加成，高于它按比例放大，上限见下。
   * 0.4 px/ms ≈ 400 px/s，大致是"慢慢拖"的速度，手机快滑通常有它的数倍。
   */
  seekSpeedBasePxPerMs: 0.4,
  /** 速度加成上限：快滑最多把基础幅度放大到几倍（4 倍 = 滑满屏约 3 分钟） */
  seekSpeedMaxMultiplier: 4,
} as const

/** 达到阈值后判定手势方向；未达到返回 null（继续等待） */
export const resolveGestureAxis = (
  deltaX: number,
  deltaY: number,
  threshold: number,
): GestureAxis => {
  const absX = Math.abs(deltaX)
  const absY = Math.abs(deltaY)
  if (absX < threshold && absY < threshold) return null
  return absX >= absY ? 'horizontal' : 'vertical'
}

/**
 * 横向滑动的速度加成倍率：慢滑为 1 倍，越快越接近上限。
 * 上限的意义是防止"甩一下手指就跳过好几分钟"。
 */
export const resolveSeekSpeedMultiplier = (speedPxPerMs: number): number =>
  clampValue(
    speedPxPerMs / GESTURE_CONFIG.seekSpeedBasePxPerMs,
    1,
    GESTURE_CONFIG.seekSpeedMaxMultiplier,
  )

/**
 * 横向滑动的增量步进：把这一步的位移换算成秒数，累加到当前偏移上。
 *
 * 必须逐帧累加，不能"净位移 × 当前倍率"整体相乘：倍率随滑动速度浮动，
 * 手指由快转慢时位移还在增加、倍率却在下降，两者相乘会让目标时间倒退——
 * 表现为"手指一直往前滑，跳转量反而变少"。
 * 增量一旦累加就固定，总偏移只随手指前进单调增加，也不会因速度衰减而缩水。
 */
export const accumulateSeekOffset = (
  currentOffset: number,
  stepPx: number,
  width: number,
  speedMultiplier: number,
): number => {
  const safeWidth = width > 0 ? width : 1
  return (
    currentOffset +
    (stepPx / safeWidth) * GESTURE_CONFIG.seekSecondsPerScreenWidth * speedMultiplier
  )
}

export interface TapRecord {
  x: number
  y: number
  timestamp: number
}

/** 双击判定：时间窗内且两次点按位移在容差内 */
export const isDoubleTap = (
  first: TapRecord | null,
  secondX: number,
  secondY: number,
  now: number,
  windowMs: number = GESTURE_CONFIG.doubleTapWindowMs,
  moveTolerance: number = GESTURE_CONFIG.doubleTapMoveTolerancePx,
): boolean => {
  if (!first) return false
  if (now - first.timestamp > windowMs) return false
  if (Math.abs(secondX - first.x) > moveTolerance) return false
  if (Math.abs(secondY - first.y) > moveTolerance) return false
  return true
}
