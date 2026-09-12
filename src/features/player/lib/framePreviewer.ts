import type Hls from 'hls.js'

type HlsConstructor = typeof import('hls.js')['default']

export interface FramePreviewer {
  /** 抓取指定时间的一帧；源不可随机访问 / CORS 污染 / 超时等失败时返回 null */
  capture(time: number): Promise<HTMLCanvasElement | null>
  /** 销毁隐藏视频与 hls 实例 */
  destroy(): void
}

const isHlsUrl = (url: string): boolean => /\.m3u8(\?|#|$)/i.test(url)

const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>(resolve => {
      window.setTimeout(() => resolve(fallback), ms)
    }),
  ])

let hlsConstructorPromise: Promise<HlsConstructor> | null = null

const getHlsConstructor = (): Promise<HlsConstructor> => {
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
 * 创建真帧预览器：用隐藏 `<video>`（m3u8 走独立 hls.js 实例，其余走原生）在目标
 * 时间 seek 后通过 canvas 抓帧。调用方负责懒创建与闲置销毁。
 */
export async function createFramePreviewer(url: string): Promise<FramePreviewer> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  // 用 1x1 离屏定位而非 display:none，确保解码器正常工作且不干扰页面
  video.setAttribute(
    'style',
    'position:fixed;top:0;left:-9999px;width:2px;height:2px;opacity:0;pointer-events:none;',
  )
  document.body.appendChild(video)

  let hls: Hls | null = null
  let ready = false

  if (isHlsUrl(url)) {
    try {
      const HlsClass = await getHlsConstructor()
      if (HlsClass.isSupported()) {
        hls = new HlsClass()
        hls.loadSource(url)
        hls.attachMedia(video)
      } else {
        video.src = url
      }
    } catch {
      video.src = url
    }
  } else {
    video.src = url
  }
  video.load()

  const waitForReady = (): Promise<boolean> =>
    new Promise(resolve => {
      if (video.readyState >= 1) {
        ready = true
        resolve(true)
        return
      }
      const onReady = () => {
        cleanup()
        ready = true
        resolve(true)
      }
      const onFail = () => {
        cleanup()
        resolve(false)
      }
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onReady)
        video.removeEventListener('loadeddata', onReady)
        video.removeEventListener('error', onFail)
      }
      video.addEventListener('loadedmetadata', onReady)
      video.addEventListener('loadeddata', onReady)
      video.addEventListener('error', onFail)
    })

  const seekTo = (time: number): Promise<boolean> =>
    new Promise(resolve => {
      if (Math.abs(video.currentTime - time) < 0.4) {
        resolve(true)
        return
      }
      const onSeeked = () => {
        cleanup()
        resolve(true)
      }
      const onFail = () => {
        cleanup()
        resolve(false)
      }
      const cleanup = () => {
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onFail)
      }
      video.addEventListener('seeked', onSeeked)
      video.addEventListener('error', onFail)
      video.currentTime = Math.max(0, time)
    })

  const canvas = document.createElement('canvas')

  const capture = async (time: number): Promise<HTMLCanvasElement | null> => {
    try {
      if (!ready) {
        const ok = await withTimeout(waitForReady(), 2500, false)
        if (!ok) return null
      }
      if (video.readyState < 1) return null

      const seekOk = await withTimeout(seekTo(time), 2000, false)
      if (!seekOk) return null

      const { videoWidth: w, videoHeight: h } = video
      if (!w || !h) return null

      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, w, h)
      return canvas
    } catch {
      return null
    }
  }

  const destroy = () => {
    hls?.destroy()
    hls = null
    video.removeAttribute('src')
    video.load()
    video.remove()
  }

  return { capture, destroy }
}
