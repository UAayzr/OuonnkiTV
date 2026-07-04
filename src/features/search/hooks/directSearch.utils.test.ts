import { describe, expect, it } from 'vitest'
import type { VideoItem, VideoSource } from '@ouonnki/cms-core'
import { appendUniqueVideoItems, getSourcesToFetch } from './directSearch.utils'

function createSource(id: string): VideoSource {
  return {
    id,
    name: id,
    url: `https://example.com/${id}`,
    detailUrl: `https://example.com/${id}`,
    isEnabled: true,
    updatedAt: new Date(),
    timeout: 5000,
    retry: 1,
  }
}

describe('getSourcesToFetch', () => {
  it('无缓存时返回全部启用源', () => {
    const selectedAPIs = [createSource('a'), createSource('b')]
    const result = getSourcesToFetch(selectedAPIs, new Map(), 2)

    expect(result.map(item => item.id)).toEqual(['a', 'b'])
  })

  it('页码超出缓存总页数时跳过该源', () => {
    const selectedAPIs = [createSource('a'), createSource('b'), createSource('c')]
    const cache = new Map([
      ['a', { totalPages: 1, totalResults: 10 }],
      ['b', { totalPages: 3, totalResults: 20 }],
    ])

    const result = getSourcesToFetch(selectedAPIs, cache, 2)

    expect(result.map(item => item.id)).toEqual(['b', 'c'])
    expect(result).toHaveLength(2)
  })
})

function createVideo(sourceCode: string, vodId: string): VideoItem {
  return {
    vod_id: vodId,
    vod_name: `${sourceCode}-${vodId}`,
    source_code: sourceCode,
  }
}

describe('appendUniqueVideoItems', () => {
  it('同源同 vod_id 的结果只追加一次', () => {
    const seenKeys = new Set<string>()
    const first = appendUniqueVideoItems([], [createVideo('source-a', '1')], seenKeys)
    const second = appendUniqueVideoItems(
      first,
      [createVideo('source-a', '1'), createVideo('source-a', '2')],
      seenKeys,
    )

    expect(second.map(item => `${item.source_code}:${item.vod_id}`)).toEqual([
      'source-a:1',
      'source-a:2',
    ])
  })

  it('不同源相同 vod_id 仍保留为独立结果', () => {
    const seenKeys = new Set<string>()
    const result = appendUniqueVideoItems(
      [],
      [createVideo('source-a', '1'), createVideo('source-b', '1')],
      seenKeys,
    )

    expect(result.map(item => `${item.source_code}:${item.vod_id}`)).toEqual([
      'source-a:1',
      'source-b:1',
    ])
  })
})
