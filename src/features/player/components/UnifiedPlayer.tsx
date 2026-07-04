import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import Artplayer from 'artplayer'
import type Hls from 'hls.js'
import type { HlsConfig } from 'hls.js'
import { createHlsLoaderClass, createM3u8Processor } from '@ouonnki/cms-core/m3u8'
import _ from 'lodash'
import { toast } from 'sonner'
import { Spinner } from '@/shared/components/ui/spinner'
import { useDocumentTitle, useCmsClient } from '@/shared/hooks'
import { useApiStore } from '@/shared/store/apiStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { buildCmsPlayPath } from '@/shared/lib/routes'
import type { VideoItem } from '@/shared/types'
import { useFavoritesStore } from '@/features/favorites/store/favoritesStore'
import {
  PlayerEpisodePanel,
  PlayerErrorState,
  PlayerInfoAndRecommendations,
  PlayerLoadingSkeleton,
} from '@/features/player/components'
import {
  useEpisodePagination,
  usePlayerDetail,
  usePlayerGestureOverlays,
  usePlayerNotices,
} from '@/features/player/hooks'
import { computeMiniPlayerRect, validatePlayerRoute } from '@/features/player/lib'

interface ArtplayerWithHls extends Artplayer {
  hls?: Hls
}

interface PlayerRouteParams {
  [key: string]: string | undefined
  sourceCode?: string
  vodId?: string
}

const m3u8Processor = createM3u8Processor({ filterAds: true })
type HlsConstructor = typeof import('hls.js')['default']

let hlsConstructorPromise: Promise<HlsConstructor> | null = null
let customHlsLoaderClass: ReturnType<typeof createHlsLoaderClass> | null = null

const getHlsConstructor = async (): Promise<HlsConstructor> => {
  if (!hlsConstructorPromise) {
    hlsConstructorPromise = import('hls.js/dist/hls.light.mjs')
      .then(module => module.default as HlsConstructor)
      .catch(error => {
        hlsConstructorPromise = null
        throw error
      })
  }

  return hlsConstructorPromise
}

const getCustomHlsLoaderClass = (HlsClass: HlsConstructor) => {
  if (!customHlsLoaderClass) {
    customHlsLoaderClass = createHlsLoaderClass({
      m3u8Processor,
      Hls: HlsClass,
    })
  }

  return customHlsLoaderClass
}

const parseEpisodeIndex = (value: string | null): number => {
  const parsed = Number.parseInt(value || '0', 10)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const formatDurationLabel = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const stripHtmlTags = (value: string) => {
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

const isTouchDevice = () =>
  window.matchMedia('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 0

const shouldFallbackEpisodeToFirst = (episodeCount: number, selectedEpisode: number) =>
  episodeCount > 0 && selectedEpisode >= episodeCount

export default function UnifiedPlayer() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { sourceCode: routeSourceCode = '', vodId: routeVodId = '' } = useParams<PlayerRouteParams>()

  const cmsClient = useCmsClient()
  const { videoAPIs, adFilteringEnabled } = useApiStore()
  const { addViewingHistory, viewingHistory } = useViewingHistoryStore()
  const { playback } = useSettingStore()
  const toggleCmsFavorite = useFavoritesStore(state => state.toggleCmsFavorite)

  const routeValidation = useMemo(
    () =>
      validatePlayerRoute({
        sourceCode: routeSourceCode,
        vodId: routeVodId,
      }),
    [routeSourceCode, routeVodId],
  )
  const routeError = routeValidation.isValid ? null : routeValidation.message
  const sourceCode = routeValidation.isValid ? routeValidation.sourceCode : ''
  const vodId = routeValidation.isValid ? routeValidation.vodId : ''
  const selectedEpisode = parseEpisodeIndex(searchParams.get('ep'))

  const viewingHistoryRef = useRef(viewingHistory)
  const playbackRef = useRef(playback)
  const pendingSeekRef = useRef<number | null>(null)
  const playerRef = useRef<Artplayer | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [activeArt, setActiveArt] = useState<Artplayer | null>(null)

  useEffect(() => {
    viewingHistoryRef.current = viewingHistory
    playbackRef.current = playback
  }, [playback, viewingHistory])

  const { transientNotices, showPlayerNotice } = usePlayerNotices()
  const { gestureVolumeLevel, gestureSeekPreviewTime } = usePlayerGestureOverlays({
    art: activeArt,
    enabled: playback.isMobileGestureEnabled,
    longPressPlaybackRate: playback.longPressPlaybackRate,
  })

  const playerOverlayContainer = activeArt?.template?.$player ?? null
  const seekPreviewOverlay =
    gestureSeekPreviewTime !== null ? (
      <div className="pointer-events-none absolute top-3 left-3 z-[160]">
        <div className="rounded-md border border-white/15 bg-black/65 px-2.5 py-1.5 text-xs text-white shadow-lg backdrop-blur-sm">
          预览 {formatDurationLabel(gestureSeekPreviewTime)}
        </div>
      </div>
    ) : null
  const volumeOverlay =
    gestureVolumeLevel !== null ? (
      <div className="pointer-events-none absolute top-3 left-1/2 z-[160] w-[min(52vw,300px)] -translate-x-1/2">
        <div className="rounded-full border border-white/15 bg-black/70 px-2.5 py-2 shadow-lg backdrop-blur-sm">
          <div className="mb-1 text-center text-xs text-white">{Math.round(gestureVolumeLevel * 100)}%</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-75"
              style={{ width: `${Math.round(gestureVolumeLevel * 100)}%` }}
            />
          </div>
        </div>
      </div>
    ) : null

  const sourceConfig = useMemo(
    () => videoAPIs.find(api => api.id === sourceCode),
    [sourceCode, videoAPIs],
  )

  const {
    detail,
    loading,
    error,
    isDetailRefreshing,
  } = usePlayerDetail({
    cmsClient,
    routeError,
    sourceCode,
    vodId,
    sourceConfig,
  })

  const buildCurrentPlayPath = useCallback(
    (episodeIndex: number) => buildCmsPlayPath(sourceCode, vodId, episodeIndex),
    [sourceCode, vodId],
  )

  const episodes = useMemo(() => {
    if (!detail) return []
    if (detail.videoInfo?.episodes_names && detail.videoInfo.episodes_names.length > 0) {
      return detail.videoInfo.episodes_names
    }
    return detail.episodes.map((_, index) => `第 ${index + 1} 集`)
  }, [detail])

  useEffect(() => {
    if (!shouldFallbackEpisodeToFirst(episodes.length, selectedEpisode)) return

    pendingSeekRef.current = null
    navigate(buildCurrentPlayPath(0), { replace: true })
  }, [buildCurrentPlayPath, episodes.length, navigate, selectedEpisode])

  const episodePagination = useEpisodePagination({
    episodes,
    selectedEpisode,
    defaultDescOrder: playback.defaultEpisodeOrder === 'desc',
  })

  const episodeProgressMap = useMemo(() => {
    if (!playback.isViewingHistoryVisible || !sourceCode || !vodId) return null

    const map = new Map<number, { progress: number; timestamp: number }>()
    for (const item of viewingHistory) {
      if (item.sourceCode !== sourceCode || item.vodId !== vodId) continue

      const progress =
        item.duration > 0 ? Math.min(100, Math.max(0, (item.playbackPosition / item.duration) * 100)) : 0
      const previous = map.get(item.episodeIndex)
      if (!previous || item.timestamp > previous.timestamp) {
        map.set(item.episodeIndex, { progress, timestamp: item.timestamp })
      }
    }

    const normalized = new Map<number, number>()
    map.forEach((value, episodeIndex) => {
      normalized.set(episodeIndex, value.progress)
    })
    return normalized
  }, [playback.isViewingHistoryVisible, sourceCode, viewingHistory, vodId])

  useEffect(() => {
    if (!detail?.episodes || !detail.episodes[selectedEpisode] || !containerRef.current) return

    if (playerRef.current && playerRef.current.destroy) {
      playerRef.current.destroy(false)
    }

    const isMobileDevice = isTouchDevice()

    const nextEpisode = () => {
      if (!playbackRef.current.isAutoPlayEnabled) return
      if (selectedEpisode >= episodes.length - 1) return

      const nextIndex = selectedEpisode + 1
      navigate(buildCurrentPlayPath(nextIndex), { replace: true })
      showPlayerNotice(`即将播放下一集: ${episodes[nextIndex]}`)
    }

    const art = new Artplayer({
      container: containerRef.current,
      url: detail.episodes[selectedEpisode],
      volume: playbackRef.current.defaultVolume,
      isLive: false,
      muted: false,
      autoplay: false,
      pip: playbackRef.current.isPipEnabled,
      autoSize: false,
      autoMini: false,
      screenshot: playbackRef.current.isScreenshotEnabled,
      setting: true,
      loop: playbackRef.current.isLoopEnabled,
      flip: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: !isMobileDevice,
      lock: isMobileDevice,
      gesture: false,
      fastForward: false,
      subtitleOffset: true,
      miniProgressBar: true,
      mutex: true,
      backdrop: true,
      playsInline: true,
      airplay: !isMobileDevice,
      theme: playbackRef.current.playerThemeColor,
      lang: 'zh-cn',
      moreVideoAttr: {
        crossOrigin: 'anonymous',
      },
      customType: {
        m3u8: function (video: HTMLMediaElement, url: string, artInstance: Artplayer) {
          const artWithHls = artInstance as ArtplayerWithHls
          void (async () => {
            try {
              const HlsClass = await getHlsConstructor()
              if (playerRef.current !== artInstance) return

              if (HlsClass.isSupported()) {
                if (artWithHls.hls) artWithHls.hls.destroy()
                const hlsConfig: Partial<HlsConfig> = adFilteringEnabled
                  ? {
                      loader: getCustomHlsLoaderClass(HlsClass) as unknown as typeof HlsClass.DefaultConfig.loader,
                    }
                  : {}
                const hls = new HlsClass(hlsConfig)
                hls.loadSource(url)
                hls.attachMedia(video)
                artWithHls.hls = hls
                artInstance.on('destroy', () => hls.destroy())
              } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url
              } else {
                artInstance.notice.show = 'Unsupported playback format: m3u8'
              }
            } catch (loadError) {
              console.error('加载 HLS 播放内核失败:', loadError)
              if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url
              } else {
                artInstance.notice.show = '播放内核加载失败，请稍后重试'
              }
            }
          })()
        },
      },
    })

    playerRef.current = art
    setActiveArt(art)

    const syncFullscreenMiniProgressBar = () => {
      const isFullscreenActive = art.fullscreen || art.fullscreenWeb
      const shouldHideMiniProgress =
        playbackRef.current.isFullscreenProgressHidden && isFullscreenActive
      art.template.$player.classList.toggle('oki-hide-mini-progress', shouldHideMiniProgress)
    }

    const syncMobileControlBar = () => {
      const isFullscreenActive = art.fullscreen || art.fullscreenWeb
      const isMobileNow = isTouchDevice()
      const fullscreenControl = art.controls.fullscreen as HTMLElement | undefined
      const fullscreenWebControl = art.controls.fullscreenWeb as HTMLElement | undefined
      const preferredFullscreenControl = fullscreenControl ?? fullscreenWebControl
      const rightControls = Array.from(
        art.template.$controlsRight.querySelectorAll<HTMLElement>('.art-control'),
      )

      if (isMobileNow && !isFullscreenActive) {
        rightControls.forEach(control => {
          control.style.display = control === preferredFullscreenControl ? '' : 'none'
        })
      } else {
        rightControls.forEach(control => {
          control.style.display = ''
        })
      }
      if (preferredFullscreenControl) {
        preferredFullscreenControl.style.display = ''
      }

      syncFullscreenMiniProgressBar()
    }

    const handleControlViewportChange = _.throttle(() => {
      syncMobileControlBar()
    }, 120)

    art.on('fullscreen', syncMobileControlBar)
    art.on('fullscreenWeb', syncMobileControlBar)
    window.addEventListener('resize', handleControlViewportChange, { passive: true })
    window.addEventListener('orientationchange', handleControlViewportChange)

    art.on('ready', () => {
      syncMobileControlBar()

      if (art.video) {
        art.video.style.objectFit = 'contain'
        art.video.style.objectPosition = 'center center'
        art.video.style.background = '#000'
      }

      const existingHistory = viewingHistoryRef.current.find(
        item =>
          item.sourceCode === sourceCode &&
          item.vodId === vodId &&
          item.episodeIndex === selectedEpisode,
      )

      if (pendingSeekRef.current && pendingSeekRef.current > 0) {
        art.seek = pendingSeekRef.current
        pendingSeekRef.current = null
        showPlayerNotice('已继承播放进度')
      } else if (existingHistory && existingHistory.playbackPosition > 0) {
        art.seek = existingHistory.playbackPosition
        showPlayerNotice('已自动跳转到上次观看位置')
      }
    })

    const addHistorySnapshot = () => {
      if (!sourceCode || !vodId) return

      addViewingHistory({
        recordType: 'cms',
        title: detail.videoInfo?.title || '未知视频',
        imageUrl: detail.videoInfo?.cover || '',
        sourceCode,
        sourceName: detail.videoInfo?.source_name || sourceConfig?.name || sourceCode,
        vodId,
        episodeIndex: selectedEpisode,
        episodeName: episodes[selectedEpisode],
        playbackPosition: art.currentTime || 0,
        duration: art.duration || 0,
        timestamp: Date.now(),
      })
    }

    art.on('video:play', addHistorySnapshot)
    art.on('video:pause', addHistorySnapshot)
    art.on('video:ended', () => {
      addHistorySnapshot()
      nextEpisode()
    })
    art.on('video:error', addHistorySnapshot)

    let lastTimeUpdate = 0
    const timeUpdateHandler = () => {
      const currentTime = art.currentTime || 0
      const duration = art.duration || 0
      const timeSinceLastUpdate = Date.now() - lastTimeUpdate

      if (timeSinceLastUpdate >= 3000 && currentTime > 0 && duration > 0) {
        lastTimeUpdate = Date.now()
        addHistorySnapshot()
      }
    }

    const throttledTimeUpdate = _.throttle(timeUpdateHandler, 3000)
    art.on('video:timeupdate', throttledTimeUpdate)

    let miniCleanup: (() => void) | undefined
    if (playbackRef.current.isAutoMiniEnabled && containerRef.current) {
      const scrollViewport = document.querySelector(
        '[data-main-scroll-area] [data-slot="scroll-area-viewport"]',
      ) as HTMLElement | null
      const playerSection = containerRef.current.closest('section')

      if (scrollViewport && playerSection) {
        let isMini = false
        const applyMiniPosition = () => {
          const miniEl = (playerRef.current as Artplayer & { template?: { $mini?: HTMLElement } })
            ?.template?.$mini
          if (!miniEl) return

          const isMobile = window.matchMedia('(max-width: 639px)').matches
          const isTablet = window.matchMedia('(min-width: 640px) and (max-width: 1023px)').matches
          const currentRect = miniEl.getBoundingClientRect()
          const rect = computeMiniPlayerRect({
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            currentWidth: currentRect.width,
            currentHeight: currentRect.height,
            isMobile,
            isTablet,
          })

          miniEl.style.width = `${rect.width}px`
          miniEl.style.height = `${rect.height}px`
          miniEl.style.top = `${rect.top}px`
          miniEl.style.left = `${rect.left}px`
        }

        const handleViewportChange = _.throttle(() => {
          if (!isMini) return
          requestAnimationFrame(applyMiniPosition)
        }, 120)

        const checkVisibility = _.throttle(() => {
          if (!playerRef.current) return

          const scrollRect = scrollViewport.getBoundingClientRect()
          const sectionRect = playerSection.getBoundingClientRect()
          const isVisible =
            sectionRect.bottom > scrollRect.top + 50 && sectionRect.top < scrollRect.bottom - 50

          if (!isVisible && !isMini) {
            playerSection.style.minHeight = `${sectionRect.height}px`
            isMini = true
            playerRef.current.mini = true
            requestAnimationFrame(applyMiniPosition)
          } else if (isVisible && isMini) {
            isMini = false
            playerRef.current.mini = false
            playerSection.style.minHeight = ''
          }
        }, 200)

        scrollViewport.addEventListener('scroll', checkVisibility, { passive: true })
        window.addEventListener('resize', handleViewportChange, { passive: true })
        window.addEventListener('orientationchange', handleViewportChange)

        miniCleanup = () => {
          checkVisibility.cancel()
          handleViewportChange.cancel()
          scrollViewport.removeEventListener('scroll', checkVisibility)
          window.removeEventListener('resize', handleViewportChange)
          window.removeEventListener('orientationchange', handleViewportChange)
          if (playerRef.current) {
            playerRef.current.mini = false
          }
          playerSection.style.minHeight = ''
        }
      }
    }

    return () => {
      miniCleanup?.()
      throttledTimeUpdate.cancel()
      handleControlViewportChange.cancel()
      window.removeEventListener('resize', handleControlViewportChange)
      window.removeEventListener('orientationchange', handleControlViewportChange)
      art.off('fullscreen', syncMobileControlBar)
      art.off('fullscreenWeb', syncMobileControlBar)
      addHistorySnapshot()
      setActiveArt(current => (current === art ? null : current))
      art.destroy(false)
      if (playerRef.current === art) {
        playerRef.current = null
      }
    }
  }, [
    addViewingHistory,
    adFilteringEnabled,
    buildCurrentPlayPath,
    detail,
    episodes,
    navigate,
    selectedEpisode,
    showPlayerNotice,
    sourceCode,
    sourceConfig?.name,
    vodId,
  ])

  const handleEpisodeChange = (displayIndex: number) => {
    pendingSeekRef.current = null
    const actualIndex = episodePagination.toActualIndex(displayIndex)
    if (actualIndex === selectedEpisode) return
    navigate(buildCurrentPlayPath(actualIndex), { replace: true })
  }

  const cmsFavoriteActive = useFavoritesStore(state =>
    sourceCode && vodId ? state.isCmsFavorited(vodId, sourceCode) : false,
  )

  const handleToggleCmsFavorite = useCallback(() => {
    if (!sourceCode || !vodId) return

    const video: VideoItem = {
      vod_id: vodId,
      vod_name: detail?.videoInfo?.title || '未知视频',
      vod_pic: detail?.videoInfo?.cover,
      vod_year: detail?.videoInfo?.year,
      vod_area: detail?.videoInfo?.area,
      vod_remarks: detail?.videoInfo?.remarks,
      vod_content: detail?.videoInfo?.desc,
      type_name: detail?.videoInfo?.type,
      source_code: sourceCode,
      source_name: detail?.videoInfo?.source_name || sourceConfig?.name || sourceCode,
    }

    toggleCmsFavorite(video)
    toast.success(cmsFavoriteActive ? '已取消收藏' : '已加入收藏')
  }, [
    cmsFavoriteActive,
    detail?.videoInfo?.area,
    detail?.videoInfo?.cover,
    detail?.videoInfo?.desc,
    detail?.videoInfo?.remarks,
    detail?.videoInfo?.source_name,
    detail?.videoInfo?.title,
    detail?.videoInfo?.type,
    detail?.videoInfo?.year,
    sourceCode,
    sourceConfig?.name,
    toggleCmsFavorite,
    vodId,
  ])

  const title = detail?.videoInfo?.title || '未知视频'
  const sourceName = detail?.videoInfo?.source_name || sourceConfig?.name || sourceCode || '未知来源'
  const overview = stripHtmlTags(detail?.videoInfo?.desc || '')
  const pageTitle = title || '视频播放'
  const primaryError = routeError || error
  const shouldShowLoading = loading && !detail
  const modeLabel = 'CMS 直连模式'

  useDocumentTitle(pageTitle)

  const renderErrorState = (message: string) => {
    const isRouteInvalid = message.includes('无效的播放地址')
    const isSourceConfigIssue = message.includes('未找到对应视频源配置')

    const title = isRouteInvalid ? '这个播放地址不可用' : '视频暂时无法播放'
    const tag = isRouteInvalid ? '路由校验失败' : '播放链路异常'

    return (
      <PlayerErrorState
        title={title}
        description={message}
        tag={tag}
        primaryAction={{
          label: '返回上一页',
          onClick: () => navigate(-1),
        }}
        secondaryAction={
          isSourceConfigIssue
            ? {
                label: '视频源设置',
                to: '/settings/source',
                variant: 'outline' as const,
              }
            : {
                label: '返回首页',
                to: '/',
                variant: 'outline' as const,
              }
        }
      />
    )
  }

  if (shouldShowLoading) {
    return <PlayerLoadingSkeleton />
  }

  if (primaryError) {
    return renderErrorState(primaryError)
  }

  if (!detail || detail.episodes.length === 0) {
    return renderErrorState(error || '无法获取播放信息')
  }

  return (
    <div className="space-y-4 md:space-y-5">
      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          {error && (
            <div className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error}
            </div>
          )}

          <section className="relative overflow-hidden rounded-lg border border-border/60 bg-black/95 shadow-lg">
            <div
              id="player"
              ref={containerRef}
              className="aspect-video min-h-[180px] w-full bg-black sm:h-[clamp(240px,56vw,74vh)] sm:min-h-[220px] sm:aspect-auto [&_.art-video-player]:!h-full [&_.art-video-player]:!w-full [&_.artplayer-app]:!h-full [&_.artplayer-app]:!w-full [&_video]:!h-full [&_video]:!w-full"
            />
            {seekPreviewOverlay &&
              (playerOverlayContainer
                ? createPortal(seekPreviewOverlay, playerOverlayContainer)
                : seekPreviewOverlay)}
            {volumeOverlay &&
              (playerOverlayContainer ? createPortal(volumeOverlay, playerOverlayContainer) : volumeOverlay)}
            {transientNotices.length > 0 && (
              <div className="pointer-events-none absolute top-3 right-3 z-30 flex max-w-[min(78vw,340px)] flex-col items-end gap-2">
                {transientNotices.map(notice => (
                  <div
                    key={notice.id}
                    className="pointer-events-auto w-[min(78vw,340px)] overflow-hidden rounded-md border border-white/15 bg-black/65 shadow-lg backdrop-blur-sm"
                  >
                    <div className="px-3 py-1.5 text-xs text-white">{notice.message}</div>
                    <div className="h-0.5 bg-white/20">
                      <div
                        className="h-full bg-red-500 transition-[width] ease-linear"
                        style={{
                          width: `${notice.progress}%`,
                          transitionDuration: `${notice.duration}ms`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isDetailRefreshing && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
                <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-sm text-white">
                  <Spinner size="sm" />
                  正在切换资源...
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-20 xl:h-[clamp(240px,56vw,74vh)] xl:min-h-[220px] xl:pr-1">
          <section className="space-y-3 rounded-lg border border-border/60 bg-card/55 p-3 md:p-4 xl:h-full xl:min-h-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">选集</h2>
              <span className="text-muted-foreground text-xs">共 {detail.episodes.length} 集</span>
            </div>
            <PlayerEpisodePanel
              totalEpisodes={detail.episodes.length}
              selectedEpisode={selectedEpisode}
              isReversed={episodePagination.isReversed}
              onToggleOrder={() => episodePagination.setIsReversed(prev => !prev)}
              pageRanges={episodePagination.pageRanges}
              currentPageRange={episodePagination.currentPageRange}
              onPageRangeChange={episodePagination.setCurrentPageRange}
              episodes={episodePagination.currentPageEpisodes}
              onEpisodeSelect={handleEpisodeChange}
              episodeProgressMap={episodeProgressMap}
              compact
              fillHeight
              hideHeader
              className="border-0 bg-transparent p-0 md:p-0"
            />
          </section>
        </aside>
      </section>

      <PlayerInfoAndRecommendations
        title={title}
        overview={overview}
        sourceName={sourceName}
        modeLabel={modeLabel}
        year={detail.videoInfo?.year}
        area={detail.videoInfo?.area}
        category={detail.videoInfo?.type}
        cmsCover={detail.videoInfo?.cover}
        episodeCount={detail.episodes.length}
        favoriteAction={{
          active: cmsFavoriteActive,
          onToggle: handleToggleCmsFavorite,
        }}
      />
    </div>
  )
}
