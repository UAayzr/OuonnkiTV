import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type Artplayer from 'artplayer'
import { useMobilePlayerGestures } from './useMobilePlayerGestures'

interface UsePlayerGestureOverlaysParams {
  art: Artplayer | null
  enabled: boolean
  longPressPlaybackRate: number
}

export function usePlayerGestureOverlays({
  art,
  enabled,
  longPressPlaybackRate,
}: UsePlayerGestureOverlaysParams) {
  const gestureVolumeTimerRef = useRef<number | null>(null)
  const [gestureVolumeLevel, setGestureVolumeLevel] = useState<number | null>(null)
  const [gestureSeekPreviewTime, setGestureSeekPreviewTime] = useState<number | null>(null)

  useEffect(() => {
    return () => {
      if (gestureVolumeTimerRef.current) {
        window.clearTimeout(gestureVolumeTimerRef.current)
      }
    }
  }, [])

  const handleVolumeGestureChange = useCallback((volume: number) => {
    if (gestureVolumeTimerRef.current) {
      window.clearTimeout(gestureVolumeTimerRef.current)
      gestureVolumeTimerRef.current = null
    }
    setGestureVolumeLevel(volume)
  }, [])

  const handleVolumeGestureEnd = useCallback(() => {
    if (gestureVolumeTimerRef.current) {
      window.clearTimeout(gestureVolumeTimerRef.current)
    }
    gestureVolumeTimerRef.current = window.setTimeout(() => {
      setGestureVolumeLevel(null)
      gestureVolumeTimerRef.current = null
    }, 360)
  }, [])

  const handleSeekGesturePreviewChange = useCallback((previewTime: number) => {
    setGestureSeekPreviewTime(previewTime)
  }, [])

  const handleSeekGesturePreviewEnd = useCallback(() => {
    setGestureSeekPreviewTime(null)
  }, [])

  const mobileGestureConfig = useMemo(
    () => ({
      longPressPlaybackRate: Math.max(1, Math.min(5, longPressPlaybackRate)),
    }),
    [longPressPlaybackRate],
  )

  useMobilePlayerGestures({
    art,
    enabled,
    config: mobileGestureConfig,
    onVolumeGestureChange: handleVolumeGestureChange,
    onVolumeGestureEnd: handleVolumeGestureEnd,
    onSeekGesturePreviewChange: handleSeekGesturePreviewChange,
    onSeekGesturePreviewEnd: handleSeekGesturePreviewEnd,
  })

  return {
    gestureVolumeLevel,
    gestureSeekPreviewTime,
  }
}
