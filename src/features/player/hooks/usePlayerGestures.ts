import { useEffect, useRef } from 'react'
import type Artplayer from 'artplayer'
import { isPlayerControlTarget } from '@/features/player/lib/playerCore'
import { clampValue } from '@/features/player/lib/playerUtils'
import {
  computeSeekTarget,
  GESTURE_CONFIG,
  isDoubleTap,
  resolveGestureAxis,
  type GestureAxis,
  type TapRecord,
} from '@/features/player/lib/playerGestures'

/** 触摸抬手后抑制浏览器合成 click 的时间窗（毫秒） */
const SYNTHETIC_CLICK_SUPPRESS_MS = 400
/** 长按加速触发时长（毫秒） */
const LONG_PRESS_DURATION_MS = 380
const LONG_PRESS_RATE_MIN = 1
const LONG_PRESS_RATE_MAX = 5

interface GestureSession {
  touchId: number
  startX: number
  startY: number
  startTime: number
  playerWidth: number
  axis: GestureAxis
  /** 水平滑动待 seek 的目标时间 */
  pendingSeekTime: number | null
  longPressTriggered: boolean
}

interface UsePlayerGesturesParams {
  art: Artplayer | null
  /** 是否启用触屏滑动/长按手势（需全屏；单击与双击始终生效） */
  swipeGestureEnabled: boolean
  longPressPlaybackRate: number
  /** 画面单击（非双击）：用于切换控制条显隐 */
  onSurfaceTap?: () => void
  /** 长按加速中上报当前倍率，抬手恢复后传 null */
  onLongPressRateChange?: (rate: number | null) => void
  onSeekGesturePreviewChange?: (previewTime: number) => void
  onSeekGesturePreviewEnd?: () => void
}

const isFullscreenActive = (art: Artplayer): boolean => {
  const doc = document as Document & { webkitFullscreenElement?: Element | null }
  const video = art.video as HTMLVideoElement & {
    webkitDisplayingFullscreen?: boolean
    webkitPresentationMode?: string
  }

  return Boolean(
    art.fullscreenWeb ||
      art.fullscreen ||
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      video?.webkitDisplayingFullscreen ||
      video?.webkitPresentationMode === 'fullscreen',
  )
}

/**
 * 统一的画面交互接管层（Artplayer 只当解码内核）。
 *
 * 桌面与触屏共用同一套仲裁逻辑：
 * - 单击 → onSurfaceTap（切换控制条显隐），经双击窗口延迟确认
 * - 双击 → 播放/暂停
 * - 右键 → 完全禁用
 * - 触屏全屏下：水平滑 seek、长按加速
 *
 * 上下滑动不接管：亮度/音量手势已移除，纵向滑动一律交还浏览器。
 *
 * 全部监听注册在捕获阶段，先于 Artplayer 内核（冒泡阶段）的事件代理执行，
 * 因此能彻底覆盖其"单击 toggle / 双击全屏 / 右键菜单"的默认行为。
 */
export function usePlayerGestures({
  art,
  swipeGestureEnabled,
  longPressPlaybackRate,
  onSurfaceTap,
  onLongPressRateChange,
  onSeekGesturePreviewChange,
  onSeekGesturePreviewEnd,
}: UsePlayerGesturesParams) {
  const callbacksRef = useRef({
    onSurfaceTap,
    onLongPressRateChange,
    onSeekGesturePreviewChange,
    onSeekGesturePreviewEnd,
  })
  callbacksRef.current = {
    onSurfaceTap,
    onLongPressRateChange,
    onSeekGesturePreviewChange,
    onSeekGesturePreviewEnd,
  }

  useEffect(() => {
    if (!art) return

    const $player = art.template?.$player
    if (!$player) return

    const sessionRef: { current: GestureSession | null } = { current: null }
    let longPressTimer: number | null = null
    let lastTap: TapRecord | null = null
    let suppressClickUntil = 0
    let playbackRateBeforeLongPress = 1
    let locked = false

    const clearLongPressTimer = () => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer)
        longPressTimer = null
      }
    }

    const restorePlaybackRate = () => {
      const session = sessionRef.current
      if (!session?.longPressTriggered) return
      art.playbackRate = clampValue(playbackRateBeforeLongPress, 0.1, 16)
      session.longPressTriggered = false
      callbacksRef.current.onLongPressRateChange?.(null)
    }

    const suppressFollowupClicks = (durationMs: number) => {
      suppressClickUntil = Date.now() + durationMs
    }

    /**
     * 切换播放/暂停。
     *
     * 不用 `art.toggle()`：它内部以 `art.playing` 判定，而 `art.playing` 带一个
     * `currentTime > 0` 条件，起播瞬间（已在播放但 currentTime 仍为 0）会误判成
     * 未播放，于是"暂停"变成再调一次 play()，这一下就被吞掉。以 video.paused 为准。
     */
    const togglePlayback = () => {
      const video = art.video as HTMLVideoElement
      if (video.paused) {
        art.play().catch(() => {
          // 起播被后续操作打断时 play() 会以 AbortError 拒绝，属预期情况
        })
        return
      }
      art.pause()
    }

    const resetSession = () => {
      if (sessionRef.current?.axis === 'horizontal') {
        callbacksRef.current.onSeekGesturePreviewEnd?.()
      }
      clearLongPressTimer()
      restorePlaybackRate()
      sessionRef.current = null
    }

    const canSwipe = () =>
      swipeGestureEnabled && isFullscreenActive(art) && !locked && !art.isLock

    const toLocal = (clientX: number, clientY: number) => {
      const rect = $player.getBoundingClientRect()
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
        width: rect.width,
      }
    }

    /**
     * 单击/双击仲裁（桌面 click 与触屏 touchend 共用）。
     *
     * 单击**立即生效**：控制条显隐是高频操作，若等双击窗口结束才执行会明显迟钝。
     * 双击时即便单击已切换过控制条也无副作用——暂停事件本身会让控制条回到显示态。
     */
    const handleTap = (x: number, y: number) => {
      const now = Date.now()

      if (
        isDoubleTap(
          lastTap,
          x,
          y,
          now,
          GESTURE_CONFIG.doubleTapWindowMs,
          GESTURE_CONFIG.doubleTapMoveTolerancePx,
        )
      ) {
        lastTap = null
        suppressFollowupClicks(SYNTHETIC_CLICK_SUPPRESS_MS)
        togglePlayback()
        return
      }

      lastTap = { x, y, timestamp: now }
      callbacksRef.current.onSurfaceTap?.()
    }

    // ---------- 鼠标 / 通用点击 ----------

    const onClickCapture = (event: MouseEvent) => {
      if (isPlayerControlTarget(event.target)) return
      event.preventDefault()
      event.stopPropagation()

      // 触屏抬手已自行处理（含合成 click），此处仅抑制
      if (Date.now() <= suppressClickUntil) return

      const { x, y } = toLocal(event.clientX, event.clientY)
      handleTap(x, y)
    }

    const onDblClickCapture = (event: MouseEvent) => {
      if (isPlayerControlTarget(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      if (Date.now() <= suppressClickUntil) return
      lastTap = null
      suppressFollowupClicks(SYNTHETIC_CLICK_SUPPRESS_MS)
      togglePlayback()
    }

    const onContextMenuCapture = (event: MouseEvent) => {
      // Artplayer 内置右键菜单整体禁用
      event.preventDefault()
      event.stopPropagation()
    }

    // ---------- 触屏手势 ----------

    const findTrackedTouch = (event: TouchEvent): Touch | null => {
      const session = sessionRef.current
      if (!session) return null
      for (let index = 0; index < event.changedTouches.length; index += 1) {
        const touch = event.changedTouches.item(index)
        if (touch?.identifier === session.touchId) return touch
      }
      return null
    }

    const onTouchStart = (event: TouchEvent) => {
      if (sessionRef.current) return
      if (isPlayerControlTarget(event.target)) return
      // 多指（缩放等）不参与手势
      if (event.touches.length > 1) return

      const touch = event.changedTouches.item(0)
      if (!touch) return

      const { x, y, width } = toLocal(touch.clientX, touch.clientY)

      sessionRef.current = {
        touchId: touch.identifier,
        startX: x,
        startY: y,
        startTime: art.currentTime || 0,
        playerWidth: width,
        axis: null,
        pendingSeekTime: null,
        longPressTriggered: false,
      }

      if (!canSwipe()) return

      playbackRateBeforeLongPress = art.playbackRate || 1
      clearLongPressTimer()
      longPressTimer = window.setTimeout(() => {
        const session = sessionRef.current
        if (!session || session.touchId !== touch.identifier) return
        if (session.axis !== null) return
        if (!canSwipe()) return

        session.longPressTriggered = true
        const rate = clampValue(
          longPressPlaybackRate,
          LONG_PRESS_RATE_MIN,
          LONG_PRESS_RATE_MAX,
        )
        art.playbackRate = rate
        callbacksRef.current.onLongPressRateChange?.(rate)
      }, LONG_PRESS_DURATION_MS)
    }

    const onTouchMove = (event: TouchEvent) => {
      const session = sessionRef.current
      if (!session) return

      const touch = findTrackedTouch(event)
      if (!touch) return

      const { x, y } = toLocal(touch.clientX, touch.clientY)
      const deltaX = x - session.startX
      const deltaY = y - session.startY

      if (session.axis === null) {
        const axis = resolveGestureAxis(deltaX, deltaY, GESTURE_CONFIG.axisLockThresholdPx)
        if (!axis) return

        // 已确认是滑动，抑制浏览器随后可能补发的合成 click
        suppressFollowupClicks(SYNTHETIC_CLICK_SUPPRESS_MS)

        // 纵向滑动不接管（亮度/音量手势已移除），非全屏时同样交还浏览器：
        // 两者都结束本次会话，后续 move 直接忽略，也不会被误判成轻点。
        if (axis !== 'horizontal' || !canSwipe()) {
          resetSession()
          return
        }

        session.axis = axis
        clearLongPressTimer()
      }

      if (session.axis === 'horizontal') {
        const previewTime = computeSeekTarget(
          session.startTime,
          deltaX,
          session.playerWidth,
          art.duration,
        )
        session.pendingSeekTime = previewTime
        callbacksRef.current.onSeekGesturePreviewChange?.(previewTime)
        if (event.cancelable) event.preventDefault()
      }
    }

    const onTouchEnd = (event: TouchEvent) => {
      const session = sessionRef.current
      if (!session) return

      const touch = findTrackedTouch(event)
      if (!touch) return

      clearLongPressTimer()

      /*
       * 横向分支必须排在长按分支之前。
       *
       * 长按触发后用户仍可能继续横向拖动（axis 会在长按之后才锁成 horizontal），
       * 此时预览已经显示了目标时间。若让长按分支先 return：
       *   1. 这一下 seek 被丢掉——预览显示了目标时间却什么也没发生；
       *   2. onSeekGesturePreviewEnd 不会被调用，预览会永远停在屏幕中央。
       * 统一走 resetSession 收尾：清预览、恢复长按倍速、清会话。
       */
      if (session.axis === 'horizontal') {
        if (session.pendingSeekTime !== null) {
          art.seek = session.pendingSeekTime
        }
        suppressFollowupClicks(SYNTHETIC_CLICK_SUPPRESS_MS)
        resetSession()
        return
      }

      // 纯长按（未滑动）：恢复倍速即可
      if (session.longPressTriggered) {
        suppressFollowupClicks(SYNTHETIC_CLICK_SUPPRESS_MS)
        resetSession()
        return
      }

      // 无滑动 → 轻点/双击（自行判定，不依赖浏览器合成 dblclick）
      const { x, y } = toLocal(touch.clientX, touch.clientY)
      const insideDoubleTapZone =
        Math.abs(x - session.startX) <= GESTURE_CONFIG.doubleTapMoveTolerancePx &&
        Math.abs(y - session.startY) <= GESTURE_CONFIG.doubleTapMoveTolerancePx

      sessionRef.current = null
      if (!insideDoubleTapZone) return

      if (event.cancelable) event.preventDefault()
      // 抬手后浏览器仍会补发合成 click，必须抑制，否则会清掉待定的单击
      suppressFollowupClicks(SYNTHETIC_CLICK_SUPPRESS_MS)
      handleTap(x, y)
    }

    const onTouchCancel = () => {
      resetSession()
    }

    const onLockChange = (state: boolean) => {
      locked = state
      if (state) resetSession()
    }

    $player.addEventListener('click', onClickCapture, true)
    $player.addEventListener('dblclick', onDblClickCapture, true)
    $player.addEventListener('contextmenu', onContextMenuCapture, true)
    $player.addEventListener('touchstart', onTouchStart, { passive: true })
    $player.addEventListener('touchmove', onTouchMove, { passive: false })
    $player.addEventListener('touchend', onTouchEnd)
    $player.addEventListener('touchcancel', onTouchCancel)
    art.on('lock', onLockChange)

    return () => {
      resetSession()
      $player.removeEventListener('click', onClickCapture, true)
      $player.removeEventListener('dblclick', onDblClickCapture, true)
      $player.removeEventListener('contextmenu', onContextMenuCapture, true)
      $player.removeEventListener('touchstart', onTouchStart)
      $player.removeEventListener('touchmove', onTouchMove)
      $player.removeEventListener('touchend', onTouchEnd)
      $player.removeEventListener('touchcancel', onTouchCancel)
      art.off('lock', onLockChange)
    }
  }, [art, swipeGestureEnabled, longPressPlaybackRate])
}
