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
        const hlsConfig: Partial<HlsConfig> = adFilteringEnabled
          ? {
              loader: getCustomHlsLoaderClass(HlsClass) as unknown as typeof HlsClass.DefaultConfig.loader,
            }
          : {}
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
