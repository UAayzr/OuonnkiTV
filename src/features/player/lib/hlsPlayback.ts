import type Artplayer from 'artplayer'
import type Hls from 'hls.js'
import type { HlsConfig } from 'hls.js'
import {
  clearFragmentPrefetch,
  configureFragmentPrefetch,
  createHlsLoaderClass,
  createM3u8Processor,
  ensurePrefetchWindow,
} from '@ouonnki/cms-core/m3u8'
import { wrapPlaybackUrl } from '@/shared/lib/playbackUrl'

interface ArtplayerWithHls extends Artplayer {
  hls?: Hls
}

type HlsConstructor = typeof import('hls.js')['default']

/** 播放清单里单个分片的形态(hls.js Frag 的最小投影) */
type FragmentLike = {
  sn: string | number
  url?: string
}

const m3u8Processor = createM3u8Processor({ filterAds: true })

let hlsConstructorPromise: Promise<HlsConstructor> | null = null
let customHlsLoaderClass: ReturnType<typeof createHlsLoaderClass> | null = null
let customHlsLoaderKey = ''

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

/**
 * loader 单例按参数组合(adFiltering × playbackProxyUrl)缓存：
 * - adFilteringEnabled：对 manifest/level 做广告过滤文本处理
 * - playbackProxyUrl：对全部请求(manifest/level/分片)做代理 URL 重写
 * 两者独立叠加,任一启用即注入 loader。
 */
const getCustomHlsLoaderClass = (
  HlsClass: HlsConstructor,
  params: { adFilteringEnabled: boolean; playbackProxyUrl?: string | null },
) => {
  const { adFilteringEnabled, playbackProxyUrl } = params
  const key = `${adFilteringEnabled}|${playbackProxyUrl || ''}`
  if (!customHlsLoaderClass || customHlsLoaderKey !== key) {
    customHlsLoaderKey = key
    customHlsLoaderClass = createHlsLoaderClass({
      m3u8Processor: adFilteringEnabled ? m3u8Processor : null,
      ...(playbackProxyUrl
        ? { urlTransformer: url => wrapPlaybackUrl(url, playbackProxyUrl) }
        : {}),
      Hls: HlsClass,
    })
  }

  return customHlsLoaderClass
}

export function attachHlsPlayback({
  video,
  url,
  art,
  isCurrentPlayer,
  adFilteringEnabled,
  playbackProxyUrl,
}: {
  video: HTMLMediaElement
  url: string
  art: Artplayer
  isCurrentPlayer: () => boolean
  adFilteringEnabled: boolean
  /** 代理前缀：启用后整条播放链路(清单+分片)经 /proxy 中转,复用服务端缓存 */
  playbackProxyUrl?: string | null
}) {
  const artWithHls = art as ArtplayerWithHls

  // Safari 原生回退路径也走代理(服务端 m3u8 内容重写使其子请求进缓存)
  const resolvePlaybackUrl = (rawUrl: string) =>
    playbackProxyUrl ? wrapPlaybackUrl(rawUrl, playbackProxyUrl) : rawUrl

  void (async () => {
    try {
      const HlsClass = await getHlsConstructor()
      if (!isCurrentPlayer()) return

      if (HlsClass.isSupported()) {
        artWithHls.hls?.destroy()
        /*
         * 回看缓冲策略：
         * - backBufferLength: Infinity —— 不让 hls.js 主动清播放头左侧的缓冲。
         * - maxBufferSize —— 默认 60MB 只够 3000k 码率约 160 秒，播几分钟后回看
         *   就得重新下载分片（浏览器 SourceBuffer 逐出是物理行为，拦不住）。
         *   提到 120MB ≈ 5 分钟的回看窗口：日常回看直接命中 MSE 留存，零网络；
         *   超出窗口的部分重新下载也只要 1-2 个分片（秒级），不值得上分片缓存。
         */
        const hlsConfig: Partial<HlsConfig> = {
          backBufferLength: Infinity,
          maxBufferSize: 120 * 1000 * 1000,
          ...(adFilteringEnabled || playbackProxyUrl
            ? {
                loader: getCustomHlsLoaderClass(HlsClass, {
                  adFilteringEnabled,
                  playbackProxyUrl,
                }) as unknown as typeof HlsClass.DefaultConfig.loader,
              }
            : {}),
        }
        const hls = new HlsClass(hlsConfig)
        hls.loadSource(url)
        hls.attachMedia(video)
        artWithHls.hls = hls

        /*
         * 分片并发预取:部分影视 CDN 单连接限速(实测单连接 ≈2Mbps),4x 倍速下
         * 下载与消耗贴平必然卡顿;同 CDN 并发拉片实测吞吐提升约 3 倍。
         * 策略:目标窗口 = 6 × playbackRate(1x→6 片,4x→24 片,上限 32),由
         * LEVEL_LOADED(清单一解析完就补)/ FRAG_LOADING(消费一片补一片)/
         * ratechange(倍速切换即时生效)共同驱动 ensurePrefetchWindow 补拉;
         * 暂停时 hls.js 默认继续拉缓冲,FRAG_LOADING 持续触发,预取也随之持续。
         * transformer 与 loader 的 urlTransformer 保持一致(代理模式走 /proxy,
         * 直连模式也无碍,同样并行下载)。
         */
        let fragments: FragmentLike[] = []
        // transformer 与播放器生命周期绑定,构造一次复用,避免反复重建闭包
        const prefetchTransformer = playbackProxyUrl
          ? (url: string) => wrapPlaybackUrl(url, playbackProxyUrl)
          : (url: string) => url
        const applyPrefetchWindow = () => {
          // 目标窗口随播放速率伸缩,拉满为止(流量不计较,保不卡顿)
          const rate = Math.max(1, video.playbackRate || 1)
          configureFragmentPrefetch(prefetchTransformer, {
            windowSize: Math.min(32, Math.round(6 * rate)),
          })
          ensurePrefetchWindow(fragments, -1)
        }
        hls.on(HlsClass.Events.LEVEL_LOADED, (_event: unknown, data: { details?: { fragments?: FragmentLike[] } }) => {
          if (data?.details?.fragments) {
            fragments = data.details.fragments
            applyPrefetchWindow()
          }
        })
        hls.on(HlsClass.Events.FRAG_LOADING, (_event: unknown, data: { frag?: { sn: FragmentLike['sn'] } }) => {
          const currentSn = data?.frag?.sn
          if (typeof currentSn !== 'number' || fragments.length === 0) return
          ensurePrefetchWindow(fragments, currentSn)
        })
        video.addEventListener('ratechange', applyPrefetchWindow)
        applyPrefetchWindow()

        art.on('destroy', () => {
          hls.destroy()
          video.removeEventListener('ratechange', applyPrefetchWindow)
          // 清理预取队列与 transformer,避免跨播放器串流
          clearFragmentPrefetch()
          configureFragmentPrefetch(null)
        })
        return
      }

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = resolvePlaybackUrl(url)
        return
      }

      art.notice.show = 'Unsupported playback format: m3u8'
    } catch (loadError) {
      console.error('加载 HLS 播放内核失败:', loadError)
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = resolvePlaybackUrl(url)
      } else {
        art.notice.show = '播放内核加载失败，请稍后重试'
      }
    }
  })()
}