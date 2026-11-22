import type { VideoItem } from '@ouonnki/cms-core'
import { normalizeLatencyQuery, type SourceLatencyEntry } from './sourceLatency'

/*
 * 搜索结果相关性打分与最终排序（纯函数，可单测）。
 *
 * 排序原则：关键词关联性最强的结果在最前；关联性相同时，源搜索耗时短的优先；
 * 仍相同则保持原有顺序（稳定）。
 *
 * 打分分层互不重叠（整数区间）：
 *   完全匹配 6000 / 前缀 5000+ / 包含 4000+ / 全词命中 3000+ / 部分命中 2000+
 *   仅辅助字段命中 ≤499 —— 任何标题级命中都严格高于仅辅助字段命中。
 */

/** 分隔符：空白、标点、符号、零宽字符 */
const SEPARATOR = /[\s\p{P}\p{S}\p{Cf}]+/gu
/** 层内加分上限（按关键词占标题长度的比例） */
const LAYER_BONUS_MAX = 499
/** 辅助字段加分的总上限，必须低于「部分标题命中」的 2000 */
const AUX_SCORE_MAX = 499

export const TITLE_SCORE = {
  exact: 6000,
  prefix: 5000,
  contains: 4000,
  allTokens: 3000,
  partial: 2000,
} as const

/** 归一化为 token 列表：全角转半角、小写、按标点/空白/符号切分 */
export function tokenizeSearchText(input?: string | null): string[] {
  if (!input) return []
  return input
    .normalize('NFKC')
    .toLowerCase()
    .split(SEPARATOR)
    .filter(Boolean)
}

/** 归一化为紧凑串：去掉分词之间的分隔符，便于整串匹配 */
export function normalizeSearchText(input?: string | null): string {
  return tokenizeSearchText(input).join('')
}

export interface RelevanceQuery {
  /** 紧凑串（无分隔符） */
  compact: string
  /** 分词结果 */
  tokens: string[]
  /** 紧凑串的唯一 2-gram；长度 1 时为单字符 */
  bigrams: string[]
}

const toBigrams = (value: string): string[] => {
  if (value.length < 2) return value ? [value] : []
  const output = new Set<string>()
  for (let index = 0; index < value.length - 1; index += 1) {
    output.add(value.slice(index, index + 2))
  }
  return [...output]
}

export function createRelevanceQuery(query: string): RelevanceQuery {
  const tokens = tokenizeSearchText(query)
  const compact = tokens.join('')
  return { compact, tokens, bigrams: toBigrams(compact) }
}

/** 归一化后的结果字段：同一条结果在多次排序中只处理一次 */
interface NormalizedItem {
  title: string
  actors: string
  directors: string
  typeName: string
  remarks: string
  content: string
}

const normalizedCache = new WeakMap<VideoItem, NormalizedItem>()

const normalizeItem = (item: VideoItem): NormalizedItem => {
  const cached = normalizedCache.get(item)
  if (cached) return cached

  const normalized: NormalizedItem = {
    title: normalizeSearchText(item.vod_name),
    actors: normalizeSearchText(item.vod_actor),
    directors: normalizeSearchText(item.vod_director),
    typeName: normalizeSearchText(item.type_name),
    remarks: normalizeSearchText(item.vod_remarks),
    content: normalizeSearchText(item.vod_content),
  }
  normalizedCache.set(item, normalized)
  return normalized
}

/** needles 在 text 中的命中比例 */
const coverageOf = (needles: readonly string[], text: string): number => {
  if (needles.length === 0 || !text) return 0
  let hit = 0
  for (const needle of needles) {
    if (text.includes(needle)) hit += 1
  }
  return hit / needles.length
}

/** 标题分层得分；查询长度 ≥2 时单字重合不算命中 */
const scoreTitle = (query: RelevanceQuery, title: string): number => {
  const { compact, tokens, bigrams } = query
  if (!title || !compact) return 0
  if (title === compact) return TITLE_SCORE.exact

  // 关键词占标题比例越高（标题越短），同层内越靠前
  const bonus = Math.round(LAYER_BONUS_MAX * Math.min(1, compact.length / title.length))
  if (title.startsWith(compact)) return TITLE_SCORE.prefix + bonus
  if (title.includes(compact)) return TITLE_SCORE.contains + bonus

  const tokenCoverage = coverageOf(tokens, title)
  const bigramCoverage = coverageOf(bigrams, title)

  // 多词分别命中但不相邻（如「三体」「动画」分散在标题里）
  if (tokens.length >= 2 && tokenCoverage === 1) {
    return TITLE_SCORE.allTokens + bonus
  }

  const partial = Math.max(tokenCoverage, bigramCoverage)
  if (partial > 0) {
    return TITLE_SCORE.partial + Math.round(LAYER_BONUS_MAX * partial)
  }
  return 0
}

const AUX_FIELDS = [
  { key: 'actors', weight: 0.3 },
  { key: 'directors', weight: 0.2 },
  { key: 'typeName', weight: 0.2 },
  { key: 'remarks', weight: 0.15 },
  { key: 'content', weight: 0.15 },
] as const

/** 单字段匹配强度：完全 1、包含 0.9、部分 ≤0.5 */
const fieldStrength = (query: RelevanceQuery, field: string): number => {
  if (!field || !query.compact) return 0
  if (field === query.compact) return 1
  if (field.includes(query.compact)) return 0.9
  const partial = Math.max(coverageOf(query.tokens, field), coverageOf(query.bigrams, field))
  return 0.5 * partial
}

const scoreAuxiliary = (query: RelevanceQuery, item: NormalizedItem): number => {
  let weighted = 0
  for (const field of AUX_FIELDS) {
    weighted += field.weight * fieldStrength(query, item[field.key])
  }
  return Math.round(AUX_SCORE_MAX * Math.min(1, weighted))
}

/** 相关性总分：标题分层分 + 辅助字段加分 */
export function scoreRelevance(query: RelevanceQuery, item: VideoItem): number {
  if (!query.compact) return 0
  const normalized = normalizeItem(item)
  return scoreTitle(query, normalized.title) + scoreAuxiliary(query, normalized)
}

/**
 * 最终排序：相关性降序 → 源耗时升序（未采样/过期/不同词视为 Infinity）→ 原顺序。
 * 若结果顺序没有变化，返回入参数组本身，避免 React 与 FLIP 的无意义重排。
 */
export function sortResultsByRelevance(
  items: VideoItem[],
  query: string,
  latencies: ReadonlyMap<string, SourceLatencyEntry>,
): VideoItem[] {
  const relevanceQuery = createRelevanceQuery(query)
  if (!relevanceQuery.compact || items.length < 2) return items

  const normalizedQuery = normalizeLatencyQuery(query)
  const latencyOf = (item: VideoItem): number => {
    if (!item.source_code) return Infinity
    const entry = latencies.get(item.source_code)
    if (!entry || entry.query !== normalizedQuery) return Infinity
    return Number.isFinite(entry.smoothedMs) ? entry.smoothedMs : Infinity
  }

  const decorated = items.map((item, index) => ({
    item,
    index,
    score: scoreRelevance(relevanceQuery, item),
    latency: latencyOf(item),
  }))

  decorated.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    // Infinity 之间相减会得到 NaN，必须显式比较
    if (a.latency !== b.latency) return a.latency < b.latency ? -1 : 1
    return a.index - b.index
  })

  for (let index = 0; index < decorated.length; index += 1) {
    if (decorated[index].item !== items[index]) {
      return decorated.map(entry => entry.item)
    }
  }
  return items
}