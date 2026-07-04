import type { VideoItem, VideoSource } from '@ouonnki/cms-core'

const HOME_RECOMMENDATION_CACHE_TTL = 5 * 60 * 1000

interface RecommendationCacheEntry {
  items: VideoItem[]
  timestamp: number
}

const recommendationCache = new Map<string, RecommendationCacheEntry>()

const getSourceCacheKey = (source: VideoSource) => source.id || source.name

export function getCachedHomeRecommendations(source: VideoSource) {
  const entry = recommendationCache.get(getSourceCacheKey(source))
  if (!entry) return null

  if (Date.now() - entry.timestamp > HOME_RECOMMENDATION_CACHE_TTL) {
    recommendationCache.delete(getSourceCacheKey(source))
    return null
  }

  return entry.items
}

export function setCachedHomeRecommendations(source: VideoSource, items: VideoItem[]) {
  if (items.length === 0) {
    recommendationCache.delete(getSourceCacheKey(source))
    return
  }

  recommendationCache.set(getSourceCacheKey(source), {
    items,
    timestamp: Date.now(),
  })
}

export function clearHomeRecommendationCache() {
  recommendationCache.clear()
}
