import { useCallback, useEffect, useRef, useState } from 'react'
import { createFramePreviewer, type FramePreviewer } from '@/features/player/lib/framePreviewer'
import { clampValue } from '@/features/player/lib/playerGestures'
import type { BufferedRange } from '@/features/player/hooks/usePlayerState'
import { cn } from '@/shared/lib/utils'

interface SeekBarProps {
  currentTime: number
  duration: number
  /** 真实缓冲区间（来自 video.buffered），避免 seek 后缓冲条"倒退" */
  bufferedRanges: BufferedRange[]
  /** 播放 URL；提供时启用真帧预览（懒创建抓帧器） */
  src?: string
  /** 抓帧失败时的回退封面 */
  coverUrl?: string
  onSeek: (time: number) => void
  /** 拖拽中上报预览时间（供外部暂停自动隐藏），松手/取消传 null */
  onScrubChange?: (time: number | null) => void
  disabled?: boolean
}

/** 与当前播放位置差距小于该值的跳转视为误触，不执行 seek */
const SEEK_DEAD_ZONE_SECONDS = 0.3
/** seek 已生效判定容差 */
const SCRUB_SETTLE_TOLERANCE_SECONDS = 0.6
/** 白点等待 seek 生效的兜底超时 */
const SCRUB_SETTLE_TIMEOUT_MS = 2000
/** 真帧抓取节流间隔 */
const PREVIEW_CAPTURE_INTERVAL_MS = 120
/** 抓帧器空闲销毁延时 */
const PREVIEWER_IDLE_DESTROY_MS = 1500

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const formatTime = (seconds: number): string => {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * 自研进度条：点击跳转 / 按住拖拽（松手 seek）/ 拖拽与 hover 中真帧预览 + 时间气泡。
 * 用 Pointer Events 统一鼠标与触摸，拖拽期间播放头与已播进度同步跟随光标。
 */
export function SeekBar({
  currentTime,
  duration,
  bufferedRanges,
  src,
  coverUrl,
  onSeek,
  onScrubChange,
  disabled = false,
}: SeekBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const frameContainerRef = useRef<HTMLDivElement>(null)
  const previewerRef = useRef<FramePreviewer | null>(null)
  const creatingPreviewerRef = useRef<Promise<FramePreviewer | null> | null>(null)
  const idleTimerRef = useRef<number | null>(null)
  const previewTimerRef = useRef<number | null>(null)
  const pendingPreviewTimeRef = useRef<number>(0)

  const [dragging, setDragging] = useState(false)
  /** 拖拽选定的时间；松手后保留到 seek 真正生效，避免播放头回跳闪烁 */
  const [scrubTime, setScrubTime] = useState<number | null>(null)
  /** hover 预览位置（仅鼠标） */
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [previewFrame, setPreviewFrame] = useState<HTMLCanvasElement | null>(null)

  const isDisabled = disabled || !(Number.isFinite(duration) && duration > 0)

  const ensurePreviewer = useCallback(async (): Promise<FramePreviewer | null> => {
    if (!src) return null
    if (previewerRef.current) return previewerRef.current
    if (creatingPreviewerRef.current) return creatingPreviewerRef.current

    creatingPreviewerRef.current = (async () => {
      try {
        const previewer = await createFramePreviewer(src)
        previewerRef.current = previewer
        return previewer
      } catch {
        return null
      }
    })()

    try {
      return await creatingPreviewerRef.current
    } finally {
      creatingPreviewerRef.current = null
    }
  }, [src])

  const scheduleIdleDestroy = useCallback(() => {
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current)
    }
    idleTimerRef.current = window.setTimeout(() => {
      previewerRef.current?.destroy()
      previewerRef.current = null
      idleTimerRef.current = null
    }, PREVIEWER_IDLE_DESTROY_MS)
  }, [])

  const doCapture = useCallback(
    async (time: number) => {
      const previewer = await ensurePreviewer()
      if (!previewer) {
        setPreviewFrame(null)
        return
      }
      const frame = await previewer.capture(time)
      if (frame) {
        setPreviewFrame(frame)
      }
      scheduleIdleDestroy()
    },
    [ensurePreviewer, scheduleIdleDestroy],
  )

  const schedulePreviewCapture = useCallback(
    (time: number) => {
      pendingPreviewTimeRef.current = time
      if (previewTimerRef.current) return
      previewTimerRef.current = window.setTimeout(() => {
        previewTimerRef.current = null
        void doCapture(pendingPreviewTimeRef.current)
      }, PREVIEW_CAPTURE_INTERVAL_MS)
    },
    [doCapture],
  )

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current)
      }
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current)
      }
      previewerRef.current?.destroy()
      previewerRef.current = null
    }
  }, [])

  useEffect(() => {
    const container = frameContainerRef.current
    if (!container) return
    container.replaceChildren()
    if (previewFrame) {
      container.appendChild(previewFrame)
    }
  }, [previewFrame])

  // seek 生效（播放位置追上拖拽目标）后清除待确认时间
  useEffect(() => {
    if (dragging || scrubTime === null) return
    if (Math.abs(currentTime - scrubTime) <= SCRUB_SETTLE_TOLERANCE_SECONDS) {
      setScrubTime(null)
    }
  }, [currentTime, dragging, scrubTime])

  // 兜底：seek 长时间未生效时也要恢复跟随播放进度
  useEffect(() => {
    if (dragging || scrubTime === null) return
    const timer = window.setTimeout(() => setScrubTime(null), SCRUB_SETTLE_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [dragging, scrubTime])

  const timeFromClientX = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return 0
      const ratio = clamp01((clientX - rect.left) / rect.width)
      return ratio * duration
    },
    [duration],
  )

  const beginScrub = useCallback(
    (time: number) => {
      const clamped = clampValue(time, 0, duration)
      setScrubTime(clamped)
      setHoverTime(null)
      onScrubChange?.(clamped)
      schedulePreviewCapture(clamped)
    },
    [duration, onScrubChange, schedulePreviewCapture],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isDisabled) return
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setDragging(true)
      beginScrub(timeFromClientX(event.clientX))
    },
    [beginScrub, isDisabled, timeFromClientX],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isDisabled) return
      const time = timeFromClientX(event.clientX)

      if (dragging) {
        beginScrub(time)
        return
      }

      // 鼠标悬停预览（触摸设备无 hover，不处理）
      if (event.pointerType === 'mouse') {
        const clamped = clampValue(time, 0, duration)
        setHoverTime(clamped)
        schedulePreviewCapture(clamped)
      }
    },
    [beginScrub, duration, dragging, isDisabled, schedulePreviewCapture, timeFromClientX],
  )

  const finishScrub = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
      if (!dragging) return
      setDragging(false)
      setHoverTime(null)
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current)
        previewTimerRef.current = null
      }
      setPreviewFrame(null)
      onScrubChange?.(null)

      if (!commit) {
        setScrubTime(null)
        return
      }

      const target = clampValue(timeFromClientX(event.clientX), 0, duration)
      // 与当前播放位置几乎重合视为误触，不产生无意义跳转
      if (Math.abs(target - currentTime) <= SEEK_DEAD_ZONE_SECONDS) {
        setScrubTime(null)
        return
      }

      setScrubTime(target)
      onSeek(target)
    },
    [currentTime, dragging, duration, onScrubChange, onSeek, timeFromClientX],
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isDisabled) return
      finishScrub(event, true)
    },
    [finishScrub, isDisabled],
  )

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      finishScrub(event, false)
    },
    [finishScrub],
  )

  const handlePointerLeave = useCallback(() => {
    if (dragging) return
    setHoverTime(null)
    setPreviewFrame(null)
  }, [dragging])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isDisabled) return
      const step = 5
      let next: number | null = null
      if (event.key === 'ArrowRight') next = currentTime + step
      else if (event.key === 'ArrowLeft') next = currentTime - step
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = duration
      if (next === null) return
      event.preventDefault()
      const clamped = clampValue(next, 0, duration)
      setScrubTime(clamped)
      onSeek(clamped)
    },
    [currentTime, duration, isDisabled, onSeek],
  )

  const playedPct = duration > 0 ? clamp01(currentTime / duration) * 100 : 0
  // 拖拽/待生效期间播放头跟随用户选定位置，而不是滞后的播放进度
  const displayPct =
    duration > 0 ? clamp01((scrubTime ?? currentTime) / duration) * 100 : playedPct
  const displayTime = scrubTime ?? hoverTime ?? currentTime
  const bubblePct = Math.min(92, Math.max(8, hoverTime !== null || dragging ? displayPct : playedPct))
  const showBubble = !isDisabled && (dragging || hoverTime !== null)
  const trackExpanded = dragging || hoverTime !== null

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="播放进度"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(displayTime)}
      aria-valuetext={formatTime(displayTime)}
      tabIndex={isDisabled ? -1 : 0}
      className={cn(
        'oki-seek-bar group relative flex h-4 w-full touch-none items-center select-none',
        isDisabled ? 'cursor-default' : 'cursor-pointer',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
    >
      {/* 预览气泡 */}
      {showBubble && (
        <div
          className="pointer-events-none absolute bottom-6 z-20 flex -translate-x-1/2 flex-col items-center gap-1"
          style={{ left: `${bubblePct}%` }}
        >
          <div className="overflow-hidden rounded-md border border-primary-foreground/15 bg-black/80 shadow-xl">
            <div ref={frameContainerRef} className="flex h-20 w-36 items-center justify-center" />
            {!previewFrame && (
              <div className="flex h-20 w-36 items-center justify-center">
                {coverUrl ? (
                  <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-primary-foreground/60">暂无预览</span>
                )}
              </div>
            )}
          </div>
          <div className="rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] leading-4 text-primary-foreground shadow">
            {formatTime(displayTime)}
          </div>
        </div>
      )}

      {/* 轨道 */}
      <div
        className={cn(
          'relative h-1.5 w-full rounded-full bg-primary-foreground/20 transition-[height] duration-150',
          trackExpanded && 'h-2.5',
        )}
      >
        {/* 缓冲：逐个 TimeRange 渲染，seek 后不会从 0 重新铺满 */}
        {bufferedRanges.map(range => {
          if (!(duration > 0)) return null
          const startPct = clamp01(range.start / duration) * 100
          const endPct = clamp01(range.end / duration) * 100
          if (endPct <= startPct) return null
          return (
            <div
              key={`${range.start.toFixed(2)}-${range.end.toFixed(2)}`}
              data-testid="seek-buffered"
              className="absolute inset-y-0 rounded-full bg-primary-foreground/35"
              style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
            />
          )
        })}
        {/* 已播（拖拽时跟随拖拽位置） */}
        <div
          data-testid="seek-played"
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${displayPct}%` }}
        />
        {/* 播放头（拖拽时跟随拖拽位置） */}
        <div
          data-testid="seek-thumb"
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground shadow-[0_0_6px_rgba(0,0,0,0.4)] transition-[width] duration-150"
          style={{ left: `${displayPct}%` }}
        />
      </div>
    </div>
  )
}
