import type { VideoSource } from '@ouonnki/cms-core'
import type { VideoItem } from '@ouonnki/cms-core'

export interface SourcePaginationInfo {
  totalPages: number
  totalResults: number
}

export function getSourcesToFetch(
  selectedAPIs: VideoSource[],
  cachedSources: Map<string, SourcePaginationInfo>,
  page: number,
): VideoSource[] {
  return selectedAPIs.filter(source => {
    const cached = cachedSources.get(source.id)
    if (!cached) return true
    return page <= cached.totalPages
  })
}

function getVideoItemDedupeKey(item: VideoItem): string {
  const sourceKey = item.source_code || item.api_url || item.source_name || 'unknown-source'
  return `${sourceKey}::${String(item.vod_id)}`
}

export function appendUniqueVideoItems(
  currentItems: VideoItem[],
  nextItems: VideoItem[],
  seenKeys: Set<string>,
): VideoItem[] {
  if (nextItems.length === 0) return currentItems

  const uniqueItems: VideoItem[] = []
  for (const item of nextItems) {
    const key = getVideoItemDedupeKey(item)
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    uniqueItems.push(item)
  }

  if (uniqueItems.length === 0) return currentItems
  return [...currentItems, ...uniqueItems]
}
