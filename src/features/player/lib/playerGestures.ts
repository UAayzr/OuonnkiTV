import { clampValue } from './playerUtils'

/** 手势方向：水平（seek）、垂直（亮度/音量）、null（未确定） */
export type GestureAxis = 'horizontal' | 'vertical' | null

export const GESTURE_CONFIG = {
  /** 手势激活所需的最小滑动距离（像素） */
  axisLockThresholdPx: 12,
  /** 双击判定时间窗口（毫秒） */
  doubleTapWindowMs: 320,
  /** 双击判定位移容差（像素） */
  doubleTapMoveTolerancePx: 12,
  /** 音量/亮度全程滑动占屏幕高度的比例 */
  fullRangeSwipeRatio: 0.9,
} as const

/** 亮度取值范围（默认 1 = 原始画面） */
export const BRIGHTNESS = {
  min: 0.25,
  max: 1.75,
  default: 1,
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

/** 是否落在播放器左半屏（用于亮度区） */
export const isLeftHalf = (x: number, width: number): boolean => {
  if (width <= 0) return true
  return x < width / 2
}

/**
 * 精确 seek：水平滑动距离占画面宽度的比例映射到时间。
 * 相比旧的"每 100px = N 秒"增量，滑动到底即覆盖全片长，方向更可控。
 * 直播等时长未知场景直接返回起点（不可 seek）。
 */
export const computeSeekTarget = (
  startTime: number,
  deltaX: number,
  width: number,
  duration: number,
): number => {
  if (!Number.isFinite(duration) || duration <= 0) return startTime
  const safeWidth = width > 0 ? width : 1
  const offset = (deltaX / safeWidth) * duration
  return clampValue(startTime + offset, 0, duration)
}

/** 精确音量：垂直滑动距离占屏高比例映射到 0~1 */
export const computeVolumeTarget = (
  startVolume: number,
  deltaY: number,
  height: number,
): number => {
  const effectiveHeight = Math.max(1, height * GESTURE_CONFIG.fullRangeSwipeRatio)
  const offset = -deltaY / effectiveHeight
  return clampValue(startVolume + offset, 0, 1)
}

/** 精确亮度：垂直滑动距离占屏高比例映射到 [min, max] */
export const computeBrightnessTarget = (
  startBrightness: number,
  deltaY: number,
  height: number,
): number => {
  const effectiveHeight = Math.max(1, height * GESTURE_CONFIG.fullRangeSwipeRatio)
  const range = BRIGHTNESS.max - BRIGHTNESS.min
  const offset = (-deltaY / effectiveHeight) * range
  return clampValue(startBrightness + offset, BRIGHTNESS.min, BRIGHTNESS.max)
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
