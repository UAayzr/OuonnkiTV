import { useCallback, useEffect, useRef, useState } from 'react'
import type Artplayer from 'artplayer'
import { usePlayerGestures } from './usePlayerGestures'
import { useBrightness } from './useBrightness'

/** 手势叠加层（音量/亮度条）结束后延迟淡出的时间 */
const OVERLAY_FADE_DELAY_MS = 360

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
 */
export function usePlayerGestureOverlays({
  art,
  enabled,
  longPressPlaybackRate,
  onSurfaceTap,
}: UsePlayerGestureOverlaysParams) {
  const volumeTimerRef = useRef<number | null>(null)
  const brightnessTimerRef = useRef<number | null>(null)
  const [gestureVolumeLevel, setGestureVolumeLevel] = useState<number | null>(null)
  const [gestureBrightnessLevel, setGestureBrightnessLevel] = useState<number | null>(null)
  const [gestureSeekPreviewTime, setGestureSeekPreviewTime] = useState<number | null>(null)

  const { applyBrightness, resetBrightness } = useBrightness(art)

  useEffect(() => {
    return () => {
      if (volumeTimerRef.current) {
        window.clearTimeout(volumeTimerRef.current)
      }
      if (brightnessTimerRef.current) {
        window.clearTimeout(brightnessTimerRef.current)
      }
    }
  }, [])

  const handleVolumeGestureChange = useCallback((volume: number) => {
    if (volumeTimerRef.current) {
      window.clearTimeout(volumeTimerRef.current)
      volumeTimerRef.current = null
    }
    setGestureVolumeLevel(volume)
  }, [])

  const handleVolumeGestureEnd = useCallback(() => {
    if (volumeTimerRef.current) {
      window.clearTimeout(volumeTimerRef.current)
    }
    volumeTimerRef.current = window.setTimeout(() => {
      setGestureVolumeLevel(null)
      volumeTimerRef.current = null
    }, OVERLAY_FADE_DELAY_MS)
  }, [])

  const handleBrightnessGestureChange = useCallback(
    (brightness: number) => {
      applyBrightness(brightness)
      if (brightnessTimerRef.current) {
        window.clearTimeout(brightnessTimerRef.current)
        brightnessTimerRef.current = null
      }
      setGestureBrightnessLevel(brightness)
    },
    [applyBrightness],
  )

  const handleBrightnessGestureEnd = useCallback(() => {
    if (brightnessTimerRef.current) {
      window.clearTimeout(brightnessTimerRef.current)
    }
    brightnessTimerRef.current = window.setTimeout(() => {
      setGestureBrightnessLevel(null)
      brightnessTimerRef.current = null
    }, OVERLAY_FADE_DELAY_MS)
  }, [])

  const handleSeekGesturePreviewChange = useCallback((previewTime: number) => {
    setGestureSeekPreviewTime(previewTime)
  }, [])

  const handleSeekGesturePreviewEnd = useCallback(() => {
    setGestureSeekPreviewTime(null)
  }, [])

  usePlayerGestures({
    art,
    swipeGestureEnabled: enabled,
    longPressPlaybackRate,
    onSurfaceTap,
    onVolumeGestureChange: handleVolumeGestureChange,
    onVolumeGestureEnd: handleVolumeGestureEnd,
    onBrightnessGestureChange: handleBrightnessGestureChange,
    onBrightnessGestureEnd: handleBrightnessGestureEnd,
    onSeekGesturePreviewChange: handleSeekGesturePreviewChange,
    onSeekGesturePreviewEnd: handleSeekGesturePreviewEnd,
  })

  return {
    gestureVolumeLevel,
    gestureBrightnessLevel,
    gestureSeekPreviewTime,
    resetBrightness,
  }
}
