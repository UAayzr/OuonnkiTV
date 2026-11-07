import { buildProxyRequestUrl } from '@/shared/config/api.config'

/**
 * 播放链路暖链:在用户进入播放页之前,提前把「master 清单 → 档位清单 → 首段分片」
 * 逐级拉进服务端代理缓存,使播放器首次请求全链命中(打开秒出)。
 * 全部静默失败,不影响导航与页面其他逻辑。
 */

const WARMUP_TIMEOUT_MS = 8000

/** 从 m3u8 文本提取第一条非注释 URI 行 */
function firstUriLine(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) return trimmed
  }
  return null
}

/** 拉取并解析下一级清单 URI(静默失败返回 null) */
async function fetchPlaylistUri(masterUrl: string, proxyUrl: string): Promise<string | null> {
  try {
    const response = await fetch(buildProxyRequestUrl(masterUrl, proxyUrl), {
      signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const text = await response.text()
    return firstUriLine(text)
  } catch {
    return null
  }
}

const resolveUrl = (uri: string, base: string) => {
  try {
    return new URL(uri, base).href
  } catch {
    return null
  }
}

/**
 * 暖链整条链:master → 档位清单 → 首段分片。三次请求全走代理,把首段全链
 * 写进服务端缓存。返回是否完成至少一级(供测试/日志)。
 */
export async function warmPlaybackChain(masterUrl: string, proxyUrl: string): Promise<boolean> {
  try {
    const levelUri = await fetchPlaylistUri(masterUrl, proxyUrl)
    if (!levelUri) return false

    const levelUrl = resolveUrl(levelUri, masterUrl)
    if (!levelUrl) return false

    const segUri = await fetchPlaylistUri(levelUrl, proxyUrl)
    if (!segUri) return false

    const segUrl = resolveUrl(segUri, levelUrl)
    if (!segUrl) return false

    // 首段分片(经代理,命中会写进 ts 缓存)
    const response = await fetch(buildProxyRequestUrl(segUrl, proxyUrl), {
      signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
    })
    if (!response.ok) return false
    await response.arrayBuffer()
    return true
  } catch {
    return false
  }
}

/**
 * 轻量暖链:仅预热下一集的 master 清单(切集时省一次回源)。
 */
export async function warmNextEpisodeMaster(masterUrl: string, proxyUrl: string): Promise<boolean> {
  try {
    const response = await fetch(buildProxyRequestUrl(masterUrl, proxyUrl), {
      signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
    })
    if (!response.ok) return false
    await response.text()
    return true
  } catch {
    return false
  }
}