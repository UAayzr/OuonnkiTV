import { describe, expect, it, vi } from 'vitest'
import type { RequestAdapter, SearchResult, VideoSource } from '../types'
import { createDirectStrategy } from '../adapters/proxy.adapter'
import { createAggregatedSearch } from './aggregator'
import { createCmsClient } from './client'
import { createConcurrencyLimiter } from './concurrency'

const sources: VideoSource[] = [
  { id: 'a', name: 'A源', url: 'https://a.example.com', isEnabled: true },
  { id: 'b', name: 'B源', url: 'https://b.example.com', isEnabled: true },
]

describe('聚合搜索和并发控制', () => {
  it('限制同时运行的任务数量', async () => {
    const limiter = createConcurrencyLimiter(2)
    let running = 0
    let peak = 0

    const tasks = Array.from({ length: 5 }, (_, index) =>
      limiter(async () => {
        running += 1
        peak = Math.max(peak, running)
        await new Promise(resolve => setTimeout(resolve, 5))
        running -= 1
        return index
      }),
    )

    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3, 4])
    expect(peak).toBe(2)
  })

  it('合并结果、去掉同一来源的重复项并报告进度', async () => {
    const onProgress = vi.fn()
    const onResult = vi.fn()
    const search = createAggregatedSearch(
      async (_query, source): Promise<SearchResult> => ({
        success: true,
        items: [
          { vod_id: '1', vod_name: `${source.name}-1`, source_code: source.id },
          { vod_id: '1', vod_name: `${source.name}-重复`, source_code: source.id },
        ],
        pagination: { page: 1, totalPages: 2, totalResults: 2 },
      }),
      { concurrencyLimit: 1, onProgress, onResult },
    )

    const result = await search('关键词', sources, 1)

    expect(result).toHaveLength(2)
    expect(result.map(item => item.source_code)).toEqual(['a', 'b'])
    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onResult).toHaveBeenCalledTimes(2)
  })

  it('收到取消信号后立即结束', async () => {
    const controller = new AbortController()
    const search = createAggregatedSearch(
      () => new Promise<SearchResult>(() => undefined),
      { concurrencyLimit: 1 },
    )

    const pending = search('关键词', sources, 1, controller.signal)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('CMS 客户端事件', () => {
  it('搜索时按顺序发出开始、结果、进度和完成事件', async () => {
    const adapter: RequestAdapter = {
      fetch: vi.fn(async () =>
        new Response(JSON.stringify({ list: [{ vod_id: '1', vod_name: '影片' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    }
    const client = createCmsClient({
      requestAdapter: adapter,
      proxyStrategy: createDirectStrategy(),
      concurrencyLimit: 1,
    })
    const eventTypes: string[] = []

    client.on('search:start', event => eventTypes.push(event.type))
    client.on('search:result', event => eventTypes.push(event.type))
    client.on('search:progress', event => eventTypes.push(event.type))
    client.on('search:complete', event => eventTypes.push(event.type))

    await client.aggregatedSearch('影片', [sources[0]], 1)

    expect(eventTypes[0]).toBe('search:start')
    expect(eventTypes).toEqual(
      expect.arrayContaining(['search:start', 'search:result', 'search:progress', 'search:complete']),
    )
  })

  it('一次性监听只执行一次，销毁后不再通知', async () => {
    const adapter: RequestAdapter = {
      fetch: vi.fn(async () =>
        new Response(JSON.stringify({ list: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    }
    const client = createCmsClient({ requestAdapter: adapter, proxyStrategy: createDirectStrategy() })
    const once = vi.fn()
    const regular = vi.fn()
    client.once('search:complete', once)
    client.on('search:complete', regular)

    await client.aggregatedSearch('一', [sources[0]], 1)
    await client.aggregatedSearch('二', [sources[0]], 1)
    client.destroy()
    await client.aggregatedSearch('三', [sources[0]], 1)

    expect(once).toHaveBeenCalledTimes(1)
    expect(regular).toHaveBeenCalledTimes(2)
  })
})
