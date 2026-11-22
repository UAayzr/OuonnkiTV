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
  /** 分片在时间轴上的起点(秒),用于把 seek 位置映射到分片 */
  start?: number
  duration?: number
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
         * 策略:目标窗口 = 6 × playbackRate(1x→6 片,4x→24 片,上限 32)。
         *  - FRAG_LOADED 后补拉刚加载完分片之后的窗口(不和正在下载的分片抢带宽);
         *  - ratechange 时按新倍速扩大窗口;
         *  - seek 时清空旧位置队列,目标分片加载完成后再并发补其后的窗口。
         * 暂停时 hls.js 默认继续拉缓冲,FRAG_LOADED 持续触发,预取也随之持续。
         * transformer 与 loader 的 urlTransformer 保持一致(代理模式走 /proxy,
         * 直连模式也无碍,同样并行下载)。
         *
         * 预取队列只有自定义 loader 会消费;未注入 loader 时启动预取等于重复下载,
         * 因此这里与 hlsConfig 的 loader 注入条件保持同一开关。
         */
        const prefetchEnabled = Boolean(adFilteringEnabled || playbackProxyUrl)
        let fragments: FragmentLike[] = []
        /** 最近一次加载完成的分片序号(预取以此为基准向前滚动) */
        let lastLoadedSn: number | null = null
        /** 当前档位索引,用于识别 ABR 切档并作废旧档位的预取 */
        let lastLevelIndex: number | null = null
        /** 上次 seek 命中的分片序号(hls.js 会对同一个 seek 做多次播放头微调) */
        let lastSeekTargetSn: number | null = null

        const prefetchWindowSize = (minWindow: number) => {
          const rate = Math.max(1, video.playbackRate || 1)
          const sizeByRate = Math.round(6 * rate)
          return Math.min(32, Math.max(minWindow, sizeByRate))
        }

        /** 找到包含指定时间的分片序号(清单按 start 升序;找不到返回 null) */
        const findSnByTime = (time: number): number | null => {
          let sn: number | null = null
          for (const fragment of fragments) {
            if (typeof fragment.start !== 'number' || typeof fragment.sn !== 'number') continue
            if (fragment.start <= time + 0.05) sn = fragment.sn
            else break
          }
          return sn
        }

        // transformer 与播放器生命周期绑定,构造一次复用,避免反复重建闭包
        const prefetchTransformer = playbackProxyUrl
          ? (url: string) => wrapPlaybackUrl(url, playbackProxyUrl)
          : (url: string) => url

        const applyPrefetchWindow = () => {
          if (!prefetchEnabled) return
          configureFragmentPrefetch(prefetchTransformer, {
            windowSize: prefetchWindowSize(6),
          })
          // 只有已有「最近加载完成的分片」时才补拉其后的窗口。
          // 当前/即将请求的分片交给 hls.js 单独下载(有进度与超时控制),避免预取
          // 抢带宽拖慢它;首个分片加载完成后由 FRAG_LOADED 触发首轮填充。
          // 也不能固定从 -1(文件开头)补拉,否则续播/跳转后窗口全浪费在已播区域。
          if (lastLoadedSn !== null) {
            ensurePrefetchWindow(fragments, lastLoadedSn)
          }
        }

        /**
         * seek 后重置预取窗口:旧位置的分片不会再被消费,必须丢弃,
         * 否则队列被占满、新位置的预取彻底停摆(实测跳转后只剩串行 XHR)。
         * 只清空、不预取目标分片本身——目标交由 hls.js 正常下载(有进度与超时控制),
         * 随后 FRAG_LOADED 会立即把目标之后的一屏窗口并发拉起。
         */
        const handleSeeking = () => {
          if (!prefetchEnabled || fragments.length === 0) return
          const targetSn = findSnByTime(video.currentTime)
          if (targetSn === null) return
          // hls.js 会微调播放头对齐分片边界,可能连续触发 seeking;
          // 同分片或相邻分片的微调不重复清空,避免刚拉起的窗口被反复中断。
          if (
            lastSeekTargetSn !== null &&
            Math.abs(targetSn - lastSeekTargetSn) <= 1
          ) {
            return
          }
          lastSeekTargetSn = targetSn

          clearFragmentPrefetch()
          lastLoadedSn = null
          configureFragmentPrefetch(prefetchTransformer, {
            // 跳转后最需要并发补货:至少保证一屏窗口,倍速下按 6×rate 扩大
            windowSize: prefetchWindowSize(12),
          })
        }

        if (prefetchEnabled) {
          hls.on(
            HlsClass.Events.LEVEL_LOADED,
            (_event: unknown, data: { level?: number; details?: { fragments?: FragmentLike[] } }) => {
              if (!data?.details?.fragments) return
              fragments = data.details.fragments

              // 切档(ABR 换档)时分片 URL 整体变化,旧档位预取全部作废
              const levelIndex = typeof data.level === 'number' ? data.level : null
              if (
                levelIndex !== null &&
                lastLevelIndex !== null &&
                levelIndex !== lastLevelIndex
              ) {
                clearFragmentPrefetch()
                lastLoadedSn = null
                // 新档位分片编号可能重新定义,旧的 seek 基准不再可信
                lastSeekTargetSn = null
              }
              lastLevelIndex = levelIndex

              applyPrefetchWindow()
            },
          )
          hls.on(HlsClass.Events.FRAG_LOADED, (_event: unknown, data: { frag?: { sn: FragmentLike['sn'] } }) => {
            const currentSn = data?.frag?.sn
            if (typeof currentSn !== 'number' || fragments.length === 0) return
            // 分片已下载完成后再补拉其后的窗口:不和正在下载的分片抢连接/带宽
            lastLoadedSn = currentSn
            ensurePrefetchWindow(fragments, currentSn)
          })
          video.addEventListener('ratechange', applyPrefetchWindow)
          video.addEventListener('seeking', handleSeeking)
          applyPrefetchWindow()
        }

        art.on('destroy', () => {
          hls.destroy()
          video.removeEventListener('ratechange', applyPrefetchWindow)
          video.removeEventListener('seeking', handleSeeking)
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