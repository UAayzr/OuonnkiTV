import type Artplayer from 'artplayer'
import type Hls from 'hls.js'
import type { HlsConfig } from 'hls.js'
import { createHlsLoaderClass, createM3u8Processor } from '@ouonnki/cms-core/m3u8'

interface ArtplayerWithHls extends Artplayer {
  hls?: Hls
}

type HlsConstructor = typeof import('hls.js')['default']

const m3u8Processor = createM3u8Processor({ filterAds: true })

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

export function attachHlsPlayback({
  video,
  url,
  art,
  isCurrentPlayer,
  adFilteringEnabled,
}: {
  video: HTMLMediaElement
  url: string
  art: Artplayer
  isCurrentPlayer: () => boolean
  adFilteringEnabled: boolean
}) {
  const artWithHls = art as ArtplayerWithHls

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
          ...(adFilteringEnabled
            ? {
                loader:
                  getCustomHlsLoaderClass(HlsClass) as unknown as typeof HlsClass.DefaultConfig.loader,
              }
            : {}),
        }
        const hls = new HlsClass(hlsConfig)
        hls.loadSource(url)
        hls.attachMedia(video)
        artWithHls.hls = hls
        art.on('destroy', () => hls.destroy())
        return
      }

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url
        return
      }

      art.notice.show = 'Unsupported playback format: m3u8'
    } catch (loadError) {
      console.error('加载 HLS 播放内核失败:', loadError)
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url
      } else {
        art.notice.show = '播放内核加载失败，请稍后重试'
      }
    }
  })()
}
