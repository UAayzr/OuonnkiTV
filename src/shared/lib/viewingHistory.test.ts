import { describe, expect, it } from 'vitest'
import type { ViewingHistoryItem } from '@/shared/types'
import { buildHistoryPlayPath, getHistoryItemKey, getHistorySeriesKey } from './viewingHistory'

function createCmsHistoryItem(overrides: Partial<ViewingHistoryItem> = {}): ViewingHistoryItem {
  return {
    recordType: 'cms',
    title: 'CMS 视频',
    imageUrl: '',
    episodeIndex: 1,
    sourceCode: 'source-a',
    sourceName: '源 A',
    vodId: 'vod-a',
    timestamp: 1,
    playbackPosition: 30,
    duration: 100,
    ...overrides,
  }
}

describe('viewingHistory helpers', () => {
  it('buildHistoryPlayPath 生成 CMS 播放路径', () => {
    const cmsPath = buildHistoryPlayPath(createCmsHistoryItem())

    expect(cmsPath).toBe('/play/cms/source-a/vod-a?ep=1')
  })

  it('getHistoryItemKey 与 getHistorySeriesKey 使用 CMS 维度', () => {
    const cmsItem = createCmsHistoryItem()

    expect(getHistoryItemKey(cmsItem)).toBe('cms::source-a::vod-a::1')
    expect(getHistorySeriesKey(cmsItem)).toBe('cms::source-a::vod-a')
  })
})
