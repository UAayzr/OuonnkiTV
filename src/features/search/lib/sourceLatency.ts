import { create } from 'zustand'
import type { VideoSource } from '@ouonnki/cms-core'
import { useSettingStore } from '@/shared/store/settingStore'

/*
 * 源搜索耗时表：记录每个源真实搜索请求的耗时（由 cms-core 在聚合层计时，
 * 不含并发限流排队），作为搜索结果的次级排序依据与卡片标签。
 *
 * 不再额外发测速请求：数据来自用户正在进行的真实搜索，同词、同时刻、
 * 同参数、同网络条件，跨源天然可比。
 */

/** 耗时样本有效期 */
export const LATENCY_TTL_MS = 10 * 60 * 1000
/** 同一源多次采样时的平滑系数（新值权重 0.5） */
export const LATENCY_EMA_ALPHA = 0.5

export interface SourceLatencyEntry {
  sourceId: string
  /** 采样时的源地址：地址变化后旧样本作废 */
  sourceUrl: string
  /** 采样时的搜索词（归一化后）：不同关键词的响应体积不同，不混用 */
  query: string
  /** 最近一次实测耗时（毫秒） */
  lastMs: number
  /** EMA 平滑耗时（毫秒）：排序与标签统一使用 */
  smoothedMs: number
  /** 有效样本数（EMA 累积次数） */
  sampleCount: number
  checkedAt: number
}

interface LatencyDeps {
  /** 测试注入时钟 */
  now?: () => number
  /** 测试注入网络配置指纹 */
  getNetworkKey?: () => string
}

/** 模块级耗时表：唯一真相，store 只做增量发布 */
const latencyCache = new Map<string, SourceLatencyEntry>()
let cachedNetworkKey: string | null = null

/** 搜索词归一化：与搜索入口的空白压缩保持一致，用于样本作用域比较 */
export const normalizeLatencyQuery = (query: string): string =>
  query.trim().replace(/\s+/g, ' ')

const readNetworkKey = (deps?: LatencyDeps): string => {
  if (deps?.getNetworkKey) return deps.getNetworkKey()
  const { isProxyEnabled, proxyUrl, concurrencyLimit } = useSettingStore.getState().network
  return `${isProxyEnabled}|${proxyUrl}|${concurrencyLimit}`
}

/** 代理链路或并发变化会改变单源耗时，旧样本整体不可比 */
const ensureNetworkScope = (deps?: LatencyDeps) => {
  const key = readNetworkKey(deps)
  if (key !== cachedNetworkKey) {
    latencyCache.clear()
    cachedNetworkKey = key
  }
}

const pruneExpired = (now: number) => {
  for (const [sourceId, entry] of latencyCache) {
    if (entry.checkedAt + LATENCY_TTL_MS <= now) {
      latencyCache.delete(sourceId)
    }
  }
}

/**
 * 记录一次真实搜索耗时。
 * 同一源、同一词、同一地址且未过期时用 EMA 平滑；否则重新起算。
 */
export function recordSourceLatency(
  source: VideoSource,
  durationMs: number,
  query: string,
  deps?: LatencyDeps,
): SourceLatencyEntry {
  const now = deps?.now?.() ?? Date.now()
  ensureNetworkScope(deps)
  pruneExpired(now)

  const normalizedQuery = normalizeLatencyQuery(query)
  const prev = latencyCache.get(source.id)
  const reusablePrev =
    prev &&
    prev.sourceUrl === source.url &&
    prev.query === normalizedQuery &&
    prev.checkedAt + LATENCY_TTL_MS > now
      ? prev
      : null

  const smoothedMs = reusablePrev
    ? reusablePrev.smoothedMs + LATENCY_EMA_ALPHA * (durationMs - reusablePrev.smoothedMs)
    : durationMs

  const entry: SourceLatencyEntry = {
    sourceId: source.id,
    sourceUrl: source.url,
    query: normalizedQuery,
    lastMs: durationMs,
    smoothedMs: Math.max(0, smoothedMs),
    sampleCount: reusablePrev ? reusablePrev.sampleCount + 1 : 1,
    checkedAt: now,
  }
  latencyCache.set(source.id, entry)
  return entry
}

/** 读取指定源在当前查询下的有效样本；过期/不同词/未采样均返回 null */
export function getSourceLatency(
  sourceId: string,
  query: string,
  deps?: LatencyDeps,
): SourceLatencyEntry | null {
  const now = deps?.now?.() ?? Date.now()
  ensureNetworkScope(deps)

  const entry = latencyCache.get(sourceId)
  if (!entry) return null
  if (entry.checkedAt + LATENCY_TTL_MS <= now) {
    latencyCache.delete(sourceId)
    return null
  }
  return entry.query === normalizeLatencyQuery(query) ? entry : null
}

/** 当前有效样本快照（返回新 Map，供 store 发布与排序读取） */
export function getLatencySnapshot(deps?: LatencyDeps): Map<string, SourceLatencyEntry> {
  const now = deps?.now?.() ?? Date.now()
  ensureNetworkScope(deps)
  pruneExpired(now)
  return new Map(latencyCache)
}

export function resetSourceLatencies(): void {
  latencyCache.clear()
  cachedNetworkKey = null
}

/** 毫秒展示：320ms / 1.2s / 12s */
export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`
}

/*
 * UI 层耗时表（zustand）：
 * record 后发布新 Map，订阅者（卡片标签）随耗时到达自动更新。
 */
export const useSourceLatencyStore = create<{
  entries: Map<string, SourceLatencyEntry>
  record: (source: VideoSource, durationMs: number, query: string) => void
  reset: () => void
}>((set) => ({
  entries: new Map(),
  record: (source, durationMs, query) => {
    recordSourceLatency(source, durationMs, query)
    set({ entries: getLatencySnapshot() })
  },
  reset: () => {
    resetSourceLatencies()
    set({ entries: new Map() })
  },
}))