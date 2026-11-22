import { describe, expect, it } from 'vitest'
import type { VideoItem } from '@ouonnki/cms-core'
import {
  TITLE_SCORE,
  createRelevanceQuery,
  normalizeSearchText,
  scoreRelevance,
  sortResultsByRelevance,
  tokenizeSearchText,
} from './relevance'
import { normalizeLatencyQuery, type SourceLatencyEntry } from './sourceLatency'

const makeItem = (
  sourceCode: string,
  vodId: string,
  vodName: string,
  extra: Partial<VideoItem> = {},
): VideoItem => ({
  vod_id: vodId,
  vod_name: vodName,
  source_code: sourceCode,
  ...extra,
})

const score = (query: string, item: VideoItem): number =>
  scoreRelevance(createRelevanceQuery(query), item)

const latencyEntry = (sourceId: string, ms: number, query = '三体'): SourceLatencyEntry => ({
  sourceId,
  sourceUrl: `https://${sourceId}.example.com`,
  query: normalizeLatencyQuery(query),
  lastMs: ms,
  smoothedMs: ms,
  sampleCount: 1,
  checkedAt: 0,
})

describe('文本归一化', () => {
  it('全角转半角、小写、去除标点与空白', () => {
    expect(tokenizeSearchText('ＴＨＥ　ＯＦＦＩＣＥ！')).toEqual(['the', 'office'])
    expect(normalizeSearchText('三体：动画')).toBe('三体动画')
    expect(normalizeSearchText('  三体   动画  ')).toBe('三体动画')
    expect(normalizeSearchText(undefined)).toBe('')
  })

  it('去除零宽字符', () => {
    expect(normalizeSearchText('三体​动画')).toBe('三体动画')
  })
})

describe('scoreRelevance 分层', () => {
  it('完全匹配 6000', () => {
    expect(score('三体', makeItem('a', '1', '三体'))).toBe(TITLE_SCORE.exact)
  })

  it('全角/大小写等价于完全匹配', () => {
    expect(score('ＴＨＥ ＯＦＦＩＣＥ', makeItem('a', '1', 'The Office'))).toBe(TITLE_SCORE.exact)
    expect(score('三体：动画', makeItem('a', '1', '三体动画'))).toBe(TITLE_SCORE.exact)
  })

  it('前缀匹配落在 [5000, 5999]', () => {
    const value = score('三体', makeItem('a', '1', '三体 第二季'))
    expect(value).toBeGreaterThanOrEqual(TITLE_SCORE.prefix)
    expect(value).toBeLessThan(TITLE_SCORE.exact)
  })

  it('包含匹配落在 [4000, 4999]', () => {
    const value = score('三体', makeItem('a', '1', '新三体'))
    expect(value).toBeGreaterThanOrEqual(TITLE_SCORE.contains)
    expect(value).toBeLessThan(TITLE_SCORE.prefix)
  })

  it('多词全部命中但不相邻，落在 [3000, 3999]', () => {
    const value = score('三体 动画', makeItem('a', '1', '动画版三体'))
    expect(value).toBeGreaterThanOrEqual(TITLE_SCORE.allTokens)
    expect(value).toBeLessThan(TITLE_SCORE.contains)
  })

  it('部分命中落在 [2000, 2999]', () => {
    const value = score('三体 动画', makeItem('a', '1', '三体'))
    expect(value).toBeGreaterThanOrEqual(TITLE_SCORE.partial)
    expect(value).toBeLessThan(TITLE_SCORE.allTokens)
    expect(value).toBe(2250)
  })

  it('查询长度 ≥2 时单字重合不算标题命中', () => {
    expect(score('三体', makeItem('a', '1', '体'))).toBe(0)
  })

  it('仅辅助字段命中不超过 499', () => {
    const value = score('三体', makeItem('a', '1', '三人行', { vod_actor: '三体' }))
    expect(value).toBeGreaterThan(0)
    expect(value).toBeLessThanOrEqual(499)
  })

  it('标题精确匹配时辅助字段不再加分，同层内按速度决胜', () => {
    expect(score('三体', makeItem('a', '1', '三体', {
      vod_actor: '三体',
      vod_director: '三体',
      type_name: '三体',
      vod_remarks: '三体',
      vod_content: '三体',
    }))).toBe(TITLE_SCORE.exact)
  })

  it('标题级命中严格高于辅助字段全部命中', () => {
    const partial = score('三体 动画', makeItem('a', '1', '三体'))
    const auxOnly = score('三体', makeItem('b', '1', '无关标题', {
      vod_actor: '三体',
      vod_director: '三体',
      type_name: '三体',
      vod_remarks: '三体',
      vod_content: '三体',
    }))

    expect(auxOnly).toBeLessThanOrEqual(499)
    expect(partial).toBeGreaterThan(auxOnly)
  })

  it('辅助字段权重：演员高于简介', () => {
    const actorHit = score('三体', makeItem('a', '1', '无关标题', { vod_actor: '三体' }))
    const contentHit = score('三体', makeItem('b', '1', '无关标题', { vod_content: '三体' }))
    expect(actorHit).toBeGreaterThan(contentHit)
  })

  it('空标题与空查询返回 0', () => {
    expect(score('三体', makeItem('a', '1', ''))).toBe(0)
    expect(score('', makeItem('a', '1', '三体'))).toBe(0)
  })
})

describe('sortResultsByRelevance', () => {
  it('相关性优先于速度', () => {
    const slowExact = makeItem('slow', '1', '三体')
    const fastPrefix = makeItem('fast', '1', '三体 第二季')
    const latencies = new Map([
      ['slow', latencyEntry('slow', 900)],
      ['fast', latencyEntry('fast', 50)],
    ])

    const sorted = sortResultsByRelevance([fastPrefix, slowExact], '三体', latencies)

    expect(sorted).toEqual([slowExact, fastPrefix])
  })

  it('相关性相同时快源在前', () => {
    const slow = makeItem('slow', '1', '三体')
    const fast = makeItem('fast', '1', '三体')
    const latencies = new Map([
      ['slow', latencyEntry('slow', 900)],
      ['fast', latencyEntry('fast', 50)],
    ])

    const sorted = sortResultsByRelevance([slow, fast], '三体', latencies)

    expect(sorted).toEqual([fast, slow])
  })

  it('同分同耗时保持原顺序，并返回原数组引用', () => {
    const items = [makeItem('a', '1', '三体'), makeItem('b', '1', '三体')]

    expect(sortResultsByRelevance(items, '三体', new Map())).toBe(items)
  })

  it('未采样与不同查询的源沉底', () => {
    const sampled = makeItem('sampled', '1', '三体')
    const otherQuery = makeItem('other-query', '1', '三体')
    const unknown = makeItem('unknown', '1', '三体')
    const latencies = new Map([
      ['sampled', latencyEntry('sampled', 800)],
      ['other-query', latencyEntry('other-query', 10, '流浪地球')],
    ])

    const sorted = sortResultsByRelevance([otherQuery, unknown, sampled], '三体', latencies)

    expect(sorted[0]).toBe(sampled)
    expect(sorted.slice(1)).toEqual([otherQuery, unknown])
  })

  it('source_code 缺失不报错，视为未采样', () => {
    const missing = { vod_id: 'x', vod_name: '三体' } as VideoItem
    const normal = makeItem('a', '1', '三体')
    const latencies = new Map([['a', latencyEntry('a', 100)]])

    const sorted = sortResultsByRelevance([missing, normal], '三体', latencies)

    expect(sorted[0]).toBe(normal)
    expect(sorted[1]).toBe(missing)
  })

  it('空查询或单条结果原样返回', () => {
    const items = [makeItem('a', '1', '三体'), makeItem('b', '1', '三体')]
    expect(sortResultsByRelevance(items, '  ', new Map())).toBe(items)

    const single = [makeItem('a', '1', '三体')]
    expect(sortResultsByRelevance(single, '三体', new Map())).toBe(single)
  })
})