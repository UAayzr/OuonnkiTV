import { useEffect, useState } from 'react'
import type Artplayer from 'artplayer'
import { throttle } from '@/shared/lib/throttle'

/** 已缓冲区间（秒），对应 video.buffered 中的每个 TimeRange */
export interface BufferedRange {
  start: number
  end: number
}

export interface PlayerUiState {
  currentTime: number
  duration: number
  /**
   * 真实缓冲区间列表。
   * 不能用 art.loadedTime（它是"本次缓冲的末尾秒数"，seek 后会从新位置重新累积，
   * 渲染成单一进度条就会出现"缓冲倒退"的错觉）。
   */
  bufferedRanges: BufferedRange[]
  playing: boolean
  volume: number
  muted: boolean
  playbackRate: number
  fullscreen: boolean
  fullscreenWeb: boolean
  mini: boolean
  pip: boolean
  /** 直播等时长未知 */
  isLive: boolean
  ready: boolean
  error: boolean
}

/** 安全读取 video.buffered（跨域媒体在部分浏览器会抛错） */
export const readBufferedRanges = (
  video: HTMLVideoElement | null | undefined,
): BufferedRange[] => {
  if (!video) return []
  try {
    const ranges = video.buffered
    if (!ranges) return []
    const result: BufferedRange[] = []
    // 极端碎片化场景下限制区间数量，避免渲染过多 DOM
    const count = Math.min(ranges.length, 16)
    for (let index = 0; index < count; index += 1) {
      const start = ranges.start(index)
      const end = ranges.end(index)
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        result.push({ start, end })
      }
    }
    return result
  } catch {
    return []
  }
}

const INITIAL_STATE: PlayerUiState = {
  currentTime: 0,
  duration: 0,
  bufferedRanges: [],
  playing: false,
  volume: 1,
  muted: false,
  playbackRate: 1,
  fullscreen: false,
  fullscreenWeb: false,
  mini: false,
  pip: false,
  isLive: false,
  ready: false,
  error: false,
}

/**
 * 订阅 Artplayer 事件 → React 状态，供自绘控制条/进度条消费。
 */
export function usePlayerState(art: Artplayer | null): PlayerUiState {
  const [state, setState] = useState<PlayerUiState>(INITIAL_STATE)

  useEffect(() => {
    if (!art) return

    const video = art.video as HTMLVideoElement | undefined

    const read = (): PlayerUiState => ({
      currentTime: art.currentTime || 0,
      duration: art.duration || 0,
      bufferedRanges: readBufferedRanges(video),
      playing: art.playing,
      volume: video?.volume ?? 1,
      muted: video?.muted ?? false,
      playbackRate: art.playbackRate || 1,
      fullscreen: art.fullscreen,
      fullscreenWeb: art.fullscreenWeb,
      mini: art.mini,
      pip: art.pip,
      isLive: !Number.isFinite(art.duration),
      ready: true,
      error: false,
    })

    const apply = () => setState(read())

    // timeupdate 高频，节流更新播放进度与缓冲区间
    const onTimeupdate = throttle(() => {
      setState(current => ({
        ...current,
        currentTime: art.currentTime || 0,
        bufferedRanges: readBufferedRanges(video),
      }))
    }, 250)

    const onError = () => {
      setState(current => ({ ...current, error: true }))
    }

    art.on('ready', apply)
    art.on('restart', apply)
    art.on('video:loadedmetadata', apply)
    art.on('video:seeked', apply)
    art.on('video:play', apply)
    art.on('video:pause', apply)
    art.on('video:volumechange', apply)
    // ratechange：倍速写入后 video 会派发该事件，缺了它倍速 UI 不会刷新
    //（表现为"调了没反应，要等别的事件顺带刷新"），循环倍速按钮也会因此算错下一个值
    art.on('video:ratechange', apply)
    art.on('video:error', onError)
    art.on('video:timeupdate', onTimeupdate)
    // progress：缓冲推进不跟随 timeupdate，需要单独订阅
    art.on('video:progress', onTimeupdate)
    art.on('fullscreen', apply)
    art.on('fullscreenWeb', apply)
    art.on('mini', apply)
    art.on('pip', apply)
    art.on('aspectRatio', apply)
    art.on('flip', apply)

    return () => {
      onTimeupdate.cancel()
      art.off('ready', apply)
      art.off('restart', apply)
      art.off('video:loadedmetadata', apply)
      art.off('video:seeked', apply)
      art.off('video:play', apply)
      art.off('video:pause', apply)
      art.off('video:volumechange', apply)
      art.off('video:ratechange', apply)
      art.off('video:error', onError)
      art.off('video:timeupdate', onTimeupdate)
      art.off('video:progress', onTimeupdate)
      art.off('fullscreen', apply)
      art.off('fullscreenWeb', apply)
      art.off('mini', apply)
      art.off('pip', apply)
      art.off('aspectRatio', apply)
      art.off('flip', apply)
    }
  }, [art])

  return state
}
