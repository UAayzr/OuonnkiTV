import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VideoItem, VideoSource } from '@ouonnki/cms-core'
import {
  clearHomeRecommendationCache,
  getCachedHomeRecommendations,
  setCachedHomeRecommendations,
} from './recommendationCache'

const source = {
  id: 'demo-source',
  name: 'Demo Source',
  url: 'https://example.com/api.php/provide/vod',
  isEnabled: true,
} as VideoSource

const items = [
  {
    vod_id: '1',
    vod_name: 'Demo Video',
    source_code: 'demo-source',
  },
] as VideoItem[]

describe('home recommendation cache', () => {
  afterEach(() => {
    clearHomeRecommendationCache()
    vi.useRealTimers()
  })

  it('returns cached recommendations for the same source', () => {
    setCachedHomeRecommendations(source, items)

    expect(getCachedHomeRecommendations(source)).toBe(items)
  })

  it('expires stale recommendations', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    setCachedHomeRecommendations(source, items)
    vi.setSystemTime(new Date('2026-01-01T00:06:00Z'))

    expect(getCachedHomeRecommendations(source)).toBeNull()
  })

  it('clears all cached recommendations', () => {
    setCachedHomeRecommendations(source, items)
    clearHomeRecommendationCache()

    expect(getCachedHomeRecommendations(source)).toBeNull()
  })

  it('does not cache empty recommendation lists', () => {
    setCachedHomeRecommendations(source, items)
    setCachedHomeRecommendations(source, [])

    expect(getCachedHomeRecommendations(source)).toBeNull()
  })
})
