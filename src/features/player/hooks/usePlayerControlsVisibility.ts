import { useCallback, useEffect, useRef, useState } from 'react'
import type Artplayer from 'artplayer'

/** 无操作后自动隐藏控制条的延时（毫秒） */
const CONTROL_HIDE_DELAY_MS = 2500

/**
 * 自绘控制条显隐时钟。
 *
 * 从 PlayerControls 中抽出，使"画面单击切换显隐"与自动隐藏共用同一份状态，
 * 避免手势层与组件各管一套导致状态打架。
 */
export function usePlayerControlsVisibility(art: Artplayer | null) {
  const [visible, setVisible] = useState(true)
  const visibleRef = useRef(true)
  const hideTimerRef = useRef<number | null>(null)
  /** 用户正在操作控制条（拖拽进度条 / 展开面板）时不自动隐藏 */
  const interactingRef = useRef(false)

  useEffect(() => {
    visibleRef.current = visible
  }, [visible])

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      // 暂停中或用户正在操作控制条时保持显示
      if (!art?.playing) return
      if (interactingRef.current) return
      setVisible(false)
    }, CONTROL_HIDE_DELAY_MS)
  }, [art, clearHideTimer])

  /** 显示控制条并重新计时（鼠标移动、触摸、播放状态变化时调用） */
  const showControls = useCallback(() => {
    setVisible(true)
    // Artplayer 的内置控件在隐藏时会往播放器上挂 cursor:none，
    // 自绘层不接管该逻辑，全屏下会导致鼠标光标一起消失，这里在唤出控制条时清掉。
    art?.template?.$player?.classList.remove('art-hide-cursor')
    scheduleHide()
  }, [art, scheduleHide])

  /** 画面单击：显示 ↔ 隐藏 切换 */
  const toggleControls = useCallback(() => {
    if (visibleRef.current) {
      clearHideTimer()
      setVisible(false)
      return
    }
    showControls()
  }, [clearHideTimer, showControls])

  /**
   * 交互状态：拖拽进度条、展开设置/音量面板期间冻结自动隐藏。
   * 否则用户按住滑块微调时，控制条会因为"鼠标没动"到点淡出，连面板一起消失。
   */
  const setInteracting = useCallback(
    (interacting: boolean) => {
      interactingRef.current = interacting
      if (interacting) {
        clearHideTimer()
        setVisible(true)
        return
      }
      scheduleHide()
    },
    [clearHideTimer, scheduleHide],
  )

  useEffect(() => {
    if (!art) return
    const $player = art.template?.$player
    if (!$player) return

    const onPlay = () => scheduleHide()
    const onPause = () => {
      clearHideTimer()
      setVisible(true)
    }

    /*
     * 桌面用 document 级监听 + 矩形命中判断，而不是直接绑在 $player 上：
     * 全屏切换时 Artplayer 会搬动播放器节点，且其自带的光标隐藏逻辑会干扰节点上的
     * 鼠标事件，直接绑定会出现"移动鼠标唤不出控制条、只有暂停才显示"的问题。
     * 触屏不在此重置——触屏单击的语义是"切换控制条显隐"，按下瞬间强制显示会与之抵消。
     */
    const onDocumentMouseMove = (event: MouseEvent) => {
      const rect = $player.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const insidePlayer =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      if (insidePlayer) {
        showControls()
      }
    }

    document.addEventListener('mousemove', onDocumentMouseMove, { passive: true })

    art.on('video:play', onPlay)
    art.on('video:pause', onPause)

    showControls()

    return () => {
      clearHideTimer()
      document.removeEventListener('mousemove', onDocumentMouseMove)
      art.off('video:play', onPlay)
      art.off('video:pause', onPause)
    }
  }, [art, clearHideTimer, scheduleHide, showControls])

  return { visible, showControls, toggleControls, setInteracting }
}
