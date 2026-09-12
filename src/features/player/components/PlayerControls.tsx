import { useEffect, useRef, useState } from 'react'
import type Artplayer from 'artplayer'
import {
  ArrowLeft,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Settings,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { usePlayerState } from '@/features/player/hooks/usePlayerState'
import { SeekBar } from '@/features/player/components/SeekBar'

const formatTime = (seconds: number): string => {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const isTouchDevice = () =>
  window.matchMedia('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 0

const PLAYBACK_RATES = [1, 1.25, 1.5, 2]

interface PlayerControlsProps {
  art: Artplayer | null
  /** 控制条可见性由 usePlayerControlsVisibility 统一管理 */
  visible: boolean
  /** 播放 URL，供进度条真帧预览 */
  src?: string
  coverUrl?: string
  /** 顶部标题 */
  title?: string
  sourceName?: string
  hasNextEpisode: boolean
  onNextEpisode: () => void
  /** 移动端返回（退出播放页/全屏） */
  onBack?: () => void
  isPipEnabled: boolean
  isLoopEnabled: boolean
  /** 进度条拖拽中：冻结控制条自动隐藏 */
  /** 进度条拖拽 / 面板展开期间：冻结控制条自动隐藏 */
  onInteractingChange?: (interacting: boolean) => void
  /** 设置面板开关（由上层统一管理，便于画面点击关闭） */
  settingOpen: boolean
  onSettingOpenChange: (open: boolean) => void
}

function ControlButton({
  children,
  label,
  onClick,
  active = false,
  solidIcon = false,
  disabled = false,
}: {
  children: React.ReactNode
  label: string
  onClick?: () => void
  active?: boolean
  /**
   * 激活时图标是否转为实心。
   * 只适用于结构简单的图标（如齿轮的闭合轮廓）；喇叭、箭头这类含开放路径的图标
   * 被填充后会变形，不要开启。
   */
  solidIcon?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      data-active={active ? 'true' : undefined}
      data-solid-icon={solidIcon ? 'true' : undefined}
      className={cn(
        // 图标描边/填充由 main.css 统一控制（未分层 + !important）：
        // 默认 fill:none，标记 solidIcon 的按钮激活时 fill:currentColor。
        // 不要把 fill 规则写成 Tailwind 的 important 变体——它位于 @layer utilities 内，
        // 带 !important 时层内优先级高于未分层，会反过来压住 main.css 的规则。
        'flex size-9 shrink-0 items-center justify-center rounded-full text-primary-foreground/90 transition-[transform,background-color] duration-100 hover:bg-primary-foreground/10 active:scale-90 disabled:pointer-events-none disabled:opacity-40',
        // 激活态用主题色，跟随项目配色（文字与深色底保持中性，保证任意视频画面上的可读性）
        active && 'bg-primary/30 text-primary-foreground',
      )}
    >
      {children}
    </button>
  )
}

function VolumeControl({
  art,
  volume,
  muted,
  onExpandedChange,
}: {
  art: Artplayer
  volume: number
  muted: boolean
  /** 上报展开状态，供外层冻结控制条自动隐藏 */
  onExpandedChange?: (expanded: boolean) => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const effectiveVolume = muted ? 0 : volume
  const Icon = effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2

  useEffect(() => {
    onExpandedChange?.(expanded)
  }, [expanded, onExpandedChange])

  /*
   * 点击外部收起面板。延迟一拍注册监听，跳过"打开它的那一次点击"，
   * 否则面板会在打开的同一个事件里立刻被关掉。
   */
  useEffect(() => {
    if (!expanded) return
    const onPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return
      setExpanded(false)
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [expanded])

  return (
    <div ref={wrapperRef} className="relative flex items-center">
      {/*
        点击展开滑块而非直接静音：触摸设备没有 hover，靠 hover 展开的滑块在手机上
        永远出不来，音量键就只剩"一下静音"这个粗暴行为。静音改由面板内的图标承担。
      */}
      <ControlButton label="音量" active={expanded} onClick={() => setExpanded(value => !value)}>
        <Icon className="size-5" />
      </ControlButton>

      {/*
        展开/收起动画：与设置面板同一套语汇（淡入淡出 + 轻微缩放 + 位移），
        时长与缓动取全站动效变量，保证播放器内两个面板手感一致。
        方向相反——设置面板在按钮上方，从下方弹出；音量面板在按钮右侧，
        因此 origin-left + 从按钮一侧（左侧）滑出，视觉上是"从音量键长出来"。
      */}
      <div
        className={cn(
          'absolute left-full top-1/2 ml-1 flex origin-left -translate-y-1/2 items-center gap-2 rounded-full border border-primary-foreground/15 bg-black/85 px-3 py-1.5 shadow-xl backdrop-blur-xl',
          // 注意：Tailwind 4 把 translate/scale 编译成独立 CSS 属性，不在 transform 里，
          // 所以过渡列表必须逐个列出，否则只有 opacity 会动、位移与缩放是瞬变。
          'transition-[opacity,translate,scale] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft)]',
          expanded
            ? 'translate-x-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-x-1.5 scale-95 opacity-0',
        )}
      >
        {/* 面板内的图标承担静音切换 */}
        <button
          type="button"
          aria-label={muted ? '取消静音' : '静音'}
          title={muted ? '取消静音' : '静音'}
          onClick={() => {
            art.video.muted = !muted
          }}
          className="shrink-0 rounded-full text-primary-foreground/70 transition-colors hover:text-primary-foreground"
        >
          <Icon className="size-4" />
        </button>

        {/* touch-none：触摸拖动滑块时不要触发页面滚动 */}
        <div className="relative h-5 w-24 shrink-0 touch-none">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary-foreground/25">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${effectiveVolume * 100}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={effectiveVolume}
            aria-label="音量滑块"
            onChange={event => {
              const next = Number(event.target.value)
              art.video.volume = next
              if (next > 0) art.video.muted = false
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-primary-foreground/70">
          {Math.round(effectiveVolume * 100)}%
        </span>
      </div>
    </div>
  )
}

function SettingsPanel({
  art,
  isLoopEnabled,
  panelRef,
}: {
  art: Artplayer
  isLoopEnabled: boolean
  /** 供外层做"点击面板外部才关闭"的命中判断 */
  panelRef: React.RefObject<HTMLDivElement | null>
}) {
  const [loop, setLoop] = useState(isLoopEnabled)
  const [flip, setFlip] = useState<'normal' | 'horizontal'>(() =>
    art.flip === 'horizontal' ? 'horizontal' : 'normal',
  )
  const [ratio, setRatio] = useState<Artplayer['aspectRatio']>(() => art.aspectRatio || 'default')

  // 选项只改设置，不关闭面板——面板只在"再次点设置"或"点击面板外部"时收起
  const updateRatio = (value: Artplayer['aspectRatio']) => {
    art.aspectRatio = value
    setRatio(value)
  }

  const toggleLoop = () => {
    const next = !loop
    art.video.loop = next
    setLoop(next)
  }

  return (
    <div
      ref={panelRef}
      className="pointer-events-auto absolute right-0 bottom-full z-30 mb-1 w-60 origin-bottom-right rounded-xl border border-primary-foreground/15 bg-black/85 p-2 shadow-2xl backdrop-blur-xl"
      style={{
        animation: 'settings-pop 200ms var(--motion-ease-soft)',
      }}
    >
      <div className="mb-1.5 px-2 text-[11px] font-medium tracking-wider text-primary-foreground/50">倍速</div>
      <div className="mb-1 flex flex-wrap gap-1">
        {PLAYBACK_RATES.map(rate => (
          <button
            key={rate}
            type="button"
            onClick={() => {
              art.playbackRate = rate
            }}
            className={cn(
              'h-7 min-w-9 rounded-full px-2 text-xs transition-colors',
              art.playbackRate === rate
                ? 'bg-primary text-primary-foreground'
                : 'text-primary-foreground/80 hover:bg-primary-foreground/10',
            )}
          >
            {rate}x
          </button>
        ))}
      </div>

      <div className="my-1.5 h-px bg-primary-foreground/10" />

      <div className="mb-1.5 px-2 text-[11px] font-medium tracking-wider text-primary-foreground/50">画面</div>
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => {
            const next = flip === 'normal' ? 'horizontal' : 'normal'
            art.flip = next
            setFlip(next)
          }}
          className="flex h-8 items-center justify-between rounded-lg px-2 text-xs text-primary-foreground/85 hover:bg-primary-foreground/10"
        >
          <span>镜像</span>
          <span className="text-primary-foreground/50">{flip === 'horizontal' ? '开启' : '关闭'}</span>
        </button>

        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-xs text-primary-foreground/85">画面比例</span>
          <div className="flex gap-1">
            {(['default', '16:9', '4:3'] as const).map(item => (
              <button
                key={item}
                type="button"
                onClick={() => updateRatio(item)}
                className={cn(
                  'h-6 min-w-9 rounded-md px-1.5 text-[11px] transition-colors',
                  ratio === item
                    ? 'bg-primary text-primary-foreground'
                    : 'text-primary-foreground/70 hover:bg-primary-foreground/10',
                )}
              >
                {item === 'default' ? '默认' : item}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleLoop}
          className="flex h-8 items-center justify-between rounded-lg px-2 text-xs text-primary-foreground/85 hover:bg-primary-foreground/10"
        >
          <span>循环播放</span>
          <span
            className={cn(
              'flex h-4 w-7 items-center rounded-full p-0.5 transition-colors',
              loop ? 'bg-primary' : 'bg-primary-foreground/25',
            )}
          >
            <span
              className={cn(
                'size-3 rounded-full bg-primary-foreground transition-transform',
                loop ? 'translate-x-3' : 'translate-x-0',
              )}
            />
          </span>
        </button>
      </div>
    </div>
  )
}

/**
 * 完整自绘控制条：顶部标题条 + 底部（进度条 + 控制按钮 + 音量滑块 + 设置面板）。
 *
 * pointer-events 约定：
 * - 根容器 `pointer-events-none`，让画面空白区的手势穿透到 video；
 * - 顶部/底部两条 `pointer-events-auto`，且弹出面板（音量/设置）必须是这两条的**后代**并显式
 *   `pointer-events-auto`，否则会被根容器吞掉而无法点击。
 * - 隐藏时用 `invisible`（visibility:hidden），保证不可见时不拦截任何事件。
 */
export function PlayerControls({
  art,
  visible,
  src,
  coverUrl,
  title,
  sourceName,
  hasNextEpisode,
  onNextEpisode,
  onBack,
  isPipEnabled,
  isLoopEnabled,
  onInteractingChange,
  settingOpen,
  onSettingOpenChange,
}: PlayerControlsProps) {
  const state = usePlayerState(art)
  const settingsPanelRef = useRef<HTMLDivElement>(null)

  // 迷你/画中画模式下不应残留打开的面板
  useEffect(() => {
    if (state.mini || state.pip) {
      onSettingOpenChange(false)
    }
  }, [onSettingOpenChange, state.mini, state.pip])

  /** 面板打开时，点击控制条内面板以外的区域收起（点击画面收起由上层画面单击处理） */
  const handleControlsAreaClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!settingOpen) return
    if (settingsPanelRef.current?.contains(event.target as Node)) return
    onSettingOpenChange(false)
  }

  const [volumePanelOpen, setVolumePanelOpen] = useState(false)

  /*
   * 任一面板展开期间冻结控制条自动隐藏：否则用户按住滑块微调时，
   * 控制条会因为"鼠标没动"到点淡出，把正在操作的面板一起带走。
   * 两个面板的状态在这里聚合，避免各自上报时互相覆盖。
   */
  useEffect(() => {
    onInteractingChange?.(settingOpen || volumePanelOpen)
  }, [onInteractingChange, settingOpen, volumePanelOpen])

  if (!art || !state.ready) return null
  if (state.mini || state.pip) return null

  const isMobile = isTouchDevice()
  const isFullscreen = state.fullscreen || state.fullscreenWeb

  const handleSeek = (time: number) => {
    art.seek = time
  }

  const toggleFullscreen = () => {
    if (isMobile) {
      art.fullscreen = !art.fullscreen
    } else {
      art.fullscreenWeb = !art.fullscreenWeb
    }
  }

  const togglePip = () => {
    art.pip = !state.pip
  }

  const cycleRate = () => {
    const index = PLAYBACK_RATES.indexOf(state.playbackRate)
    art.playbackRate = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length]
  }

  return (
    <div
      className={cn(
        'oki-player-controls pointer-events-none absolute inset-0 z-[120] transition-[opacity,visibility] duration-300',
        visible ? 'visible opacity-100' : 'invisible opacity-0',
      )}
    >
      {/* 顶部标题条 */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/60 via-black/25 to-transparent px-3 pt-2.5 pb-6">
        <div className="pointer-events-auto flex min-w-0 items-center gap-1">
          {isMobile && onBack && (
            <ControlButton label="返回" onClick={onBack}>
              <ArrowLeft className="size-5" />
            </ControlButton>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-primary-foreground drop-shadow">{title}</div>
            {sourceName && (
              <div className="mt-0.5 truncate text-[11px] text-primary-foreground/70 drop-shadow">
                {sourceName}
              </div>
            )}
          </div>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-1">
          {isPipEnabled && !isMobile && (
            <ControlButton label="画中画" onClick={togglePip}>
              <PictureInPicture2 className="size-5" />
            </ControlButton>
          )}
          <ControlButton label="全屏" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </ControlButton>
        </div>
      </div>

      {/* 底部控制条 */}
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/45 to-transparent px-3 pt-8 pb-2.5"
        onClick={handleControlsAreaClick}
      >
        {/* relative 包装：让设置面板贴着进度条上沿展开，而不是浮在整条底栏之上 */}
        <div className="relative">
          <div className="pointer-events-auto">
            <SeekBar
              currentTime={state.currentTime}
              duration={state.duration}
              bufferedRanges={state.bufferedRanges}
              src={src}
              coverUrl={coverUrl}
              onSeek={handleSeek}
              onScrubChange={time => onInteractingChange?.(time !== null)}
              disabled={state.isLive}
            />
          </div>

          <div className="pointer-events-auto mt-1 flex items-center gap-0.5">
          <ControlButton label={state.playing ? '暂停' : '播放'} onClick={() => art.toggle()}>
            {state.playing ? <Pause className="size-5" /> : <Play className="size-5" />}
          </ControlButton>

          {hasNextEpisode && (
            <ControlButton label="下一集" onClick={onNextEpisode}>
              <SkipForward className="size-5" />
            </ControlButton>
          )}

          <VolumeControl
            art={art}
            volume={state.volume}
            muted={state.muted}
            onExpandedChange={setVolumePanelOpen}
          />

          <div className="ml-1.5 text-xs tabular-nums text-primary-foreground/85">
            {formatTime(state.currentTime)}
            <span className="text-primary-foreground/50"> / {formatTime(state.duration)}</span>
          </div>

          <div className="flex-1" />

          {!isMobile && (
            <ControlButton label="倍速" onClick={cycleRate}>
              <span className="text-[11px] font-semibold">{state.playbackRate}x</span>
            </ControlButton>
          )}

          {isPipEnabled && isMobile && (
            <ControlButton label="画中画" onClick={togglePip}>
              <PictureInPicture2 className="size-5" />
            </ControlButton>
          )}

          <ControlButton
            label="设置"
            active={settingOpen}
            solidIcon={settingOpen}
            onClick={() => onSettingOpenChange(!settingOpen)}
          >
            <Settings className="size-5" />
          </ControlButton>

          <ControlButton label="全屏" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </ControlButton>
          </div>

          {/* 设置面板：紧贴进度条上沿展开 */}
          {settingOpen && (
            <SettingsPanel art={art} isLoopEnabled={isLoopEnabled} panelRef={settingsPanelRef} />
          )}
        </div>
      </div>
    </div>
  )
}
