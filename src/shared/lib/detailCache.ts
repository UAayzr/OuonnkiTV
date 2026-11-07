import type { DetailResult } from '@ouonnki/cms-core'
import { getCmsClient } from '@/shared/hooks/useCmsCore'
import { useApiStore } from '@/shared/store'

/**
 * 详情缓存(模块级内存):跨播放页挂载共享,解决「每次进播放页重拉详情」。
 * - 键: sourceCode::vodId
 * - TTL 10 分钟 / 上限 200 条(插入序淘汰,最近写入保留)
 * - prefetchCmsDetail 与原请求共用 in-flight 去重,避免预取与页面同时发起重复请求
 */

const DETAIL_CACHE_TTL_MS = 10 * 60 * 1000
const DETAIL_CACHE_MAX_ENTRIES = 200

interface DetailCacheEntry {
  result: DetailResult
  expiresAt: number
}

const cache = new Map<string, DetailCacheEntry>()
const inflight = new Map<string, Promise<DetailResult | null>>()

const buildKey = (sourceCode: string, vodId: string) => `${sourceCode}::${vodId}`

export function getCachedDetail(sourceCode: string, vodId: string): DetailResult | null {
  const key = buildKey(sourceCode, vodId)
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.result
}

function putCachedDetail(sourceCode: string, vodId: string, result: DetailResult): void {
  const key = buildKey(sourceCode, vodId)
  cache.set(key, { result, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS })
  if (cache.size > DETAIL_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }
}

/** 供播放页等获取成功路径显式写缓存(下次挂载直接命中) */
export function cacheDetailResult(sourceCode: string, vodId: string, result: DetailResult): void {
  putCachedDetail(sourceCode, vodId, result)
}

/** 清空缓存(测试与诊断用) */
export function clearDetailCache(): void {
  cache.clear()
  inflight.clear()
}

/**
 * 预取详情进缓存(静默失败):供列表页 hover/点击调用。
 * 同 key 的并发请求(预取 + 播放页挂载)只发一次。
 * 返回缓存详情(可能为 null,表示未获得详情)。
 */
export async function prefetchCmsDetail(
  sourceCode: string,
  vodId: string,
): Promise<DetailResult | null> {
  const key = buildKey(sourceCode, vodId)
  if (cache.has(key)) return cache.get(key)!.result
  if (inflight.has(key)) return inflight.get(key)!

  const source = useApiStore
    .getState()
    .videoAPIs.find(api => api.id === sourceCode)
  if (!source) return null

  const pending = (async () => {
    try {
      const response = await getCmsClient().getDetail(vodId, source)
      if (response.success && response.episodes && response.episodes.length > 0) {
        putCachedDetail(sourceCode, vodId, response)
        return response
      }
      return null
    } catch {
      // 预取失败静默,不打扰用户
      return null
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, pending)
  return pending
}