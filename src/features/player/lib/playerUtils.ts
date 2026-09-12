/**
 * 播放器内共用的零散工具。
 *
 * 这些函数此前在 SeekBar / PlayerControls / UnifiedPlayer / playerGestures /
 * playerMiniLayout 里各有一份逐字相同的实现，统一收到这里，避免改了其中一处、
 * 另一处照旧。
 */

/** 将数值限制在 [min, max] 区间内 */
export const clampValue = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/**
 * 播放时间格式化（分:秒）。
 * 非有限值（NaN / Infinity，如直播未就绪时的 duration）按 0 处理，
 * 避免界面出现 "NaN:NaN"。
 */
export const formatPlaybackTime = (seconds: number): string => {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** 触摸设备判定：无 hover 能力或支持多点触控 */
export const isTouchDevice = (): boolean =>
  window.matchMedia('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 0
