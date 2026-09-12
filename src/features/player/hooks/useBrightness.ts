import { useCallback, useEffect, useState } from 'react'
import type Artplayer from 'artplayer'
import { BRIGHTNESS } from '@/features/player/lib/playerGestures'
import { clampValue } from '@/features/player/lib/playerUtils'

/**
 * 亮度控制：通过 CSS filter: brightness() 作用于视频元素。
 * 亮度为播放器会话级临时状态，默认 1（原始画面），退出播放器自动还原。
 */
export function useBrightness(art: Artplayer | null) {
  const [brightness, setBrightness] = useState<number>(BRIGHTNESS.default)

  useEffect(() => {
    const video = art?.video as HTMLVideoElement | undefined
    if (!video) return

    video.style.filter =
      brightness === BRIGHTNESS.default ? '' : `brightness(${brightness.toFixed(2)})`

    return () => {
      video.style.filter = ''
    }
  }, [art, brightness])

  const applyBrightness = useCallback((value: number) => {
    setBrightness(clampValue(value, BRIGHTNESS.min, BRIGHTNESS.max))
  }, [])

  const resetBrightness = useCallback(() => {
    setBrightness(BRIGHTNESS.default)
  }, [])

  return { brightness, applyBrightness, resetBrightness }
}
