import { buildProxyRequestUrl } from '@/shared/config/api.config'

/** 判断 URL(相对或绝对)是否已经指向本代理(路径 /proxy 且带 url 参数),防双重包裹 */
export function isProxiedPath(url: string): boolean {
  try {
    const u = new URL(url, 'http://localhost')
    return u.pathname === '/proxy' && u.searchParams.has('url')
  } catch {
    return false
  }
}

/**
 * 把播放链路 URL(manifest/分片)包裹进代理前缀,走服务端缓存中转。
 * - 相对 URL 先按页面源解析为绝对地址(hls.js context.url 通常已是绝对的)
 * - 已含代理前缀的 URL 原样返回(相对/绝对均检测),避免重复包裹
 * @param url 裸播放 URL(m3u8/ts)
 * @param proxyUrl 代理前缀(空则原样返回)
 */
export function wrapPlaybackUrl(url: string, proxyUrl?: string | null): string {
  if (!proxyUrl) return url
  if (isProxiedPath(url)) return url

  let absolute: string
  try {
    absolute = new URL(url, window.location.origin).href
  } catch {
    return url
  }

  if (isProxiedPath(absolute)) return absolute
  return buildProxyRequestUrl(absolute, proxyUrl)
}