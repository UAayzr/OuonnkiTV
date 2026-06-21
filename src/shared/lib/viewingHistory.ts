import { buildCmsPlayPath } from './routes'
import type { ViewingHistoryItem } from '@/shared/types'

export const getHistoryItemKey = (item: ViewingHistoryItem): string => {
  return `cms::${item.sourceCode}::${item.vodId}::${item.episodeIndex}`
}

export const getHistorySeriesKey = (item: ViewingHistoryItem): string => {
  return `cms::${item.sourceCode}::${item.vodId}`
}

export const buildHistoryPlayPath = (item: ViewingHistoryItem): string => {
  return buildCmsPlayPath(item.sourceCode, item.vodId, item.episodeIndex)
}
