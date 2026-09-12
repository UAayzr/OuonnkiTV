import { useCallback, useState } from 'react'
import type Artplayer from 'artplayer'
import { usePlayerGestures } from './usePlayerGestures'

interface UsePlayerGestureOverlaysParams {
  art: Artplayer | null
  /** 是否启用触屏滑动/长按手势（全屏下生效） */
  enabled: boolean
  longPressPlaybackRate: number
  /** 画面单击（非双击）：用于切换控制条显隐 */
  onSurfaceTap?: () => void
}

/**
 * 画面手势 + 叠加层状态：
 * 手势判定交给 usePlayerGestures，这里只负责把结果转成叠加层可见状态。
 *
 * 目前只剩滑动 seek 的预览时间——亮度/音量滑动已移除，因此不再持有
 * 对应的叠加层状态与淡出计时器。
 */
export function usePlayerGestureOverlays({
  art,
  enabled,
  longPressPlaybackRate,
  onSurfaceTap,
}: UsePlayerGestureOverlaysParams) {
  const [gestureSeekPreviewTime, setGestureSeekPreviewTime] = useState<number | null>(null)
  /** 长按加速中的倍率；null = 未处于长按加速状态 */
  const [gestureLongPressRate, setGestureLongPressRate] = useState<number | null>(null)

  const handleSeekGesturePreviewChange = useCallback((previewTime: number) => {
    setGestureSeekPreviewTime(previewTime)
  }, [])

  const handleSeekGesturePreviewEnd = useCallback(() => {
    setGestureSeekPreviewTime(null)
  }, [])

  const handleLongPressRateChange = useCallback((rate: number | null) => {
    setGestureLongPressRate(rate)
  }, [])

  usePlayerGestures({
    art,
    swipeGestureEnabled: enabled,
    longPressPlaybackRate,
    onSurfaceTap,
    onLongPressRateChange: handleLongPressRateChange,
    onSeekGesturePreviewChange: handleSeekGesturePreviewChange,
    onSeekGesturePreviewEnd: handleSeekGesturePreviewEnd,
  })

  return { gestureSeekPreviewTime, gestureLongPressRate }
}
