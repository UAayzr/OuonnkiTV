import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoItem, VideoSource } from '@ouonnki/cms-core'
import {
  SPEED_MAX_BYTES,
  SPEED_TTL_MS,
  ensureSourceSpeeds,
  formatSpeed,
  getSourceSpeed,
  measureSourceSpeed,
  setSourceSpeed,
  sortResultsBySourceSpeed,
  type SourceSpeedEntry,
  type SpeedMeasureDeps,
} from './sourceSpeed'

/* ---------- 测试工具 ---------- */

const makeChunk = (size: number) => new Uint8Array(size)

/** 带 vi.fn mock 统计的 fetch 类型（访问 .mock.calls 用） */
type MockedFetch = typeof fetch & { mock: ReturnType<typeof vi.fn>['mock'] }

const sourceA: VideoSource = { id: 'a', name: '源A', url: 'https://a.example.com', isEnabled: true }
const sourceB: VideoSource = { id: 'b', name: '源B', url: 'https://b.example.com', isEnabled: true }

const network = { isProxyEnabled: false, proxyUrl: '/proxy?url=' }

/** 基础 deps:直连、固定时钟（每次调用 +1000ms）、默认 512KB/4s/2.5s */
const makeDeps = (fetchFn: typeof fetch): SpeedMeasureDeps => {
  let tick = 0
  return {
    fetchFn,
    getNetwork: () => network,
    now: () => {
      tick += 1
      return tick * 1000
    },
  }
}

/** 立即返回 N 个 chunk 的 response */
const makeOkResponse = (chunkSize: number, chunks: number) => ({
  ok: true,
  status: 200,
  body: {
    getReader: () => {
      let index = 0
      return {
        cancel: async () => {},
        read: async () => {
          if (index >= chunks) return { done: true, value: undefined }
          index += 1
          return { done: false, value: makeChunk(chunkSize) }
        },
      }
    },
  },
})

const makeOkFetch = (chunkSize = 64 * 1024, chunks = 10): MockedFetch =>
  vi.fn(async () => makeOkResponse(chunkSize, chunks)) as unknown as MockedFetch

const entryOf = (id: string, mbps: number, ttfb = 50, ok = true): SourceSpeedEntry => ({
  source: { ...sourceA, id, name: `源${id}` },
  ok,
  throughputMBps: ok ? mbps : null,
  ttfbMs: ttfb,
  bytesReceived: 512 * 1024,
  checkedAt: Date.now(),
})

const itemOf = (sourceId: string, vodId: number): VideoItem => ({
  vod_id: String(vodId),
  vod_name: `剧${vodId}`,
  source_code: sourceId,
  source_name: `源${sourceId}`,
})

/* ---------- measureSourceSpeed ---------- */

describe('measureSourceSpeed', () => {
  it('正常下载计算吞吐（512KB 封顶 + 连接释放）', async () => {
    const reader = {
      cancel: vi.fn(async () => {}),
      read: async () => ({ done: false, value: makeChunk(512 * 1024) }),
    }
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    })) as unknown as typeof fetch

    const entry = await measureSourceSpeed(sourceA, undefined, makeDeps(fetchFn))
    expect(entry.ok).toBe(true)
    expect(entry.bytesReceived).toBe(SPEED_MAX_BYTES)
    // 时钟:readStart 在第 3 次调用（3000），结束在第 4 次（4000）→ elapsed 1000ms
    expect(entry.throughputMBps).toBeCloseTo(0.5)
    expect(reader.cancel).toHaveBeenCalled()
    // 强制回源 + 直连 URL
    expect(fetchFn).toHaveBeenCalledWith(
      'https://a.example.com',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('isProxyEnabled 时 URL 走代理前缀', async () => {
    const proxied = { ...network, isProxyEnabled: true }
    const deps = makeDeps(makeOkFetch())
    deps.getNetwork = () => proxied
    await measureSourceSpeed(sourceA, undefined, deps)
    const url = String((deps.fetchFn as MockedFetch).mock.calls[0][0])
    expect(url).toContain('/proxy?url=')
    expect(url).toContain(encodeURIComponent('https://a.example.com'))
  })

  it('TTFB 超时视为连接超时', async () => {
    const fetchFn = vi.fn(
      (_url: unknown, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    ) as unknown as typeof fetch
    const deps = makeDeps(fetchFn)
    deps.ttfbTimeoutMs = 20
    const entry = await measureSourceSpeed(sourceA, undefined, deps)
    expect(entry.ok).toBe(false)
    expect(entry.errorMessage).toBe('连接超时')
  })

  it('读流超时按已收字节算部分成功', async () => {
    // 每个 chunk 真实延迟 10ms,读超时 20ms → 读到第 3 个 chunk 前被掐断
    let capturedSignal: AbortSignal | undefined
    const reader = {
      cancel: vi.fn(async () => {}),
      read: async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        if (capturedSignal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        return { done: false, value: makeChunk(16 * 1024) }
      },
    }
    const fetchFn = vi.fn((_url: unknown, init: { signal?: AbortSignal }) => {
      capturedSignal = init.signal
      return Promise.resolve({ ok: true, status: 200, body: { getReader: () => reader } })
    }) as unknown as typeof fetch

    const deps = makeDeps(fetchFn)
    deps.maxReadMs = 20
    const entry = await measureSourceSpeed(sourceA, undefined, deps)
    expect(entry.ok).toBe(true) // 部分成功
    expect(entry.bytesReceived).toBeGreaterThan(0)
    expect(entry.bytesReceived).toBeLessThan(10 * 16 * 1024)
  })

  it('HTTP 非 2xx 视为失败', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 500,
      body: { getReader: () => ({ cancel: async () => {}, read: async () => ({ done: true }) }) },
    })) as unknown as typeof fetch
    const entry = await measureSourceSpeed(sourceA, undefined, makeDeps(fetchFn))
    expect(entry.ok).toBe(false)
    expect(entry.errorMessage).toContain('HTTP')
  })

  it('外部 abort 标记为 aborted', async () => {
    const controller = new AbortController()
    const fetchFn = vi.fn(
      (_url: unknown, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    ) as unknown as typeof fetch
    const pending = measureSourceSpeed(sourceA, controller.signal, makeDeps(fetchFn))
    controller.abort()
    const entry = await pending
    expect(entry.aborted).toBe(true)
    expect(entry.ok).toBe(false)
  })

  it('网络错误记录错误信息', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const entry = await measureSourceSpeed(sourceA, undefined, makeDeps(fetchFn))
    expect(entry.ok).toBe(false)
    expect(entry.errorMessage).toContain('Failed to fetch')
  })
})

/* ---------- 源速度表与 ensureSourceSpeeds ---------- */

describe('ensureSourceSpeeds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('已有缓存直接命中，不再发起测速请求', async () => {
    const fetchFn = makeOkFetch()
    const deps = makeDeps(fetchFn)
    const targets = [
      { ...sourceA, id: 'cache-a' },
      { ...sourceB, id: 'cache-b' },
    ]

    await ensureSourceSpeeds(targets, undefined, deps)
    const firstCalls = fetchFn.mock.calls.length
    expect(firstCalls).toBe(2)

    const map = await ensureSourceSpeeds(targets, undefined, deps)
    expect(fetchFn.mock.calls.length).toBe(firstCalls) // 零新增
    expect(map.get('cache-a')?.ok).toBe(true)
    expect(map.get('cache-b')?.ok).toBe(true)
  })

  it('in-flight 去重：同一源并发两次调用只测一次', async () => {
    const fetchFn = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 30))
      return makeOkResponse(64 * 1024, 4)
    }) as unknown as typeof fetch
    const deps = makeDeps(fetchFn)
    const target = { ...sourceA, id: 'dedupe-a' }

    const [map1, map2] = await Promise.all([
      ensureSourceSpeeds([target], undefined, deps),
      ensureSourceSpeeds([target], undefined, deps),
    ])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(map1.get('dedupe-a')?.ok).toBe(true)
    expect(map2.get('dedupe-a')?.ok).toBe(true)
  })

  it('并发不超过 2', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const fetchFn = vi.fn(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(resolve => setTimeout(resolve, 30))
      inFlight -= 1
      return makeOkResponse(64 * 1024, 4)
    }) as unknown as typeof fetch
    const deps = makeDeps(fetchFn)
    const sources = Array.from({ length: 6 }, (_, i) => ({ ...sourceA, id: `cc-${i}` }))

    await ensureSourceSpeeds(sources, undefined, deps)
    expect(maxInFlight).toBeLessThanOrEqual(2)
  })

  it('失败进返回表但不入缓存，下次重测', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 500,
      body: { getReader: () => ({ cancel: async () => {}, read: async () => ({ done: true }) }) },
    })) as unknown as typeof fetch
    const deps = makeDeps(fetchFn)
    const target = { ...sourceA, id: 'fail-a' }

    const map = await ensureSourceSpeeds([target], undefined, deps)
    expect(map.get('fail-a')?.ok).toBe(false)
    expect(getSourceSpeed('fail-a')).toBeNull()

    const again = await ensureSourceSpeeds([target], undefined, deps)
    expect(fetchFn).toHaveBeenCalledTimes(2) // 失败源下次重试
    expect(again.get('fail-a')?.ok).toBe(false)
  })

  it('aborted 结果不入返回表', async () => {
    const controller = new AbortController()
    controller.abort()
    const deps = makeDeps(makeOkFetch())

    const map = await ensureSourceSpeeds([{ ...sourceA, id: 'abort-a' }], controller.signal, deps)
    expect(map.size).toBe(0)
  })

  it('onEntry 增量回调:新测完成与缓存命中都即时发布,aborted 不发布', async () => {
    const fetchFn = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
      return makeOkResponse(64 * 1024, 4)
    }) as unknown as typeof fetch
    const deps = makeDeps(fetchFn)
    const targets = [
      { ...sourceA, id: 'entry-new' },
      { ...sourceB, id: 'entry-cached' },
    ]
    const published: string[] = []

    // 第一轮:两个都新测 → 各回调一次
    await ensureSourceSpeeds(targets, undefined, deps, entry => {
      published.push(entry.source.id)
    })
    expect(published).toEqual(['entry-new', 'entry-cached'])

    // 第二轮:缓存命中 → 也立即回调(翻页时 UI 表即时完整)
    published.length = 0
    await ensureSourceSpeeds(targets, undefined, deps, entry => {
      published.push(entry.source.id)
    })
    expect(published).toEqual(['entry-new', 'entry-cached'])
    expect(fetchFn).toHaveBeenCalledTimes(2) // 第二轮零请求(全缓存)
  })

  it('aborted 结果不触发 onEntry', async () => {
    const controller = new AbortController()
    controller.abort()
    const published: string[] = []
    await ensureSourceSpeeds(
      [{ ...sourceA, id: 'entry-abort' }],
      controller.signal,
      makeDeps(makeOkFetch()),
      entry => {
        published.push(entry.source.id)
      },
    )
    expect(published).toHaveLength(0)
  })

  it('网络配置变化时旧缓存整体失效重测', async () => {
    const fetchFn = makeOkFetch()
    const deps = makeDeps(fetchFn)
    const target = { ...sourceA, id: 'net-a' }

    await ensureSourceSpeeds([target], undefined, deps)
    const calls = fetchFn.mock.calls.length

    // 切换到代理 → networkKey 变化 → 清表重测
    network.isProxyEnabled = true
    await ensureSourceSpeeds([target], undefined, deps)
    expect(fetchFn.mock.calls.length).toBe(calls + 1)
    network.isProxyEnabled = false
  })
})

describe('源速度表 TTL', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('过期后视为无', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    setSourceSpeed('a', entryOf('a', 8.5))
    expect(getSourceSpeed('a')?.throughputMBps).toBe(8.5)
    vi.setSystemTime(SPEED_TTL_MS + 1)
    expect(getSourceSpeed('a')).toBeNull()
  })
})

/* ---------- sortResultsBySourceSpeed ---------- */

describe('sortResultsBySourceSpeed', () => {
  it('快源的结果在前', () => {
    const items = [itemOf('b', 1), itemOf('a', 1), itemOf('b', 2)]
    const map = new Map([
      ['a', entryOf('a', 12)],
      ['b', entryOf('b', 3)],
    ])
    const sorted = sortResultsBySourceSpeed(items, map)
    expect(sorted.map(item => item.source_code)).toEqual(['a', 'b', 'b'])
    // 同源内部保持原顺序（b1 在 b2 前）
    expect(sorted[1].vod_id).toBe('1')
    expect(sorted[2].vod_id).toBe('2')
  })

  it('吞吐差 <10% 时按 TTFB 升序', () => {
    const items = [itemOf('slow-ttfb', 1), itemOf('fast-ttfb', 1)]
    const map = new Map([
      ['slow-ttfb', entryOf('slow-ttfb', 8, 300)],
      ['fast-ttfb', entryOf('fast-ttfb', 8.2, 30)],
    ])
    const sorted = sortResultsBySourceSpeed(items, map)
    expect(sorted[0].source_code).toBe('fast-ttfb')
  })

  it('未测/失败的源沉底且相互保持原顺序', () => {
    const items = [itemOf('known', 1), itemOf('unknown-1', 1), itemOf('failed', 1), itemOf('unknown-2', 1)]
    const map = new Map([
      ['known', entryOf('known', 10)],
      ['failed', entryOf('failed', 0, 0, false)],
    ])
    const sorted = sortResultsBySourceSpeed(items, map)
    expect(sorted[0].source_code).toBe('known')
    const tail = sorted.slice(1).map(item => item.source_code)
    expect(tail).toEqual(['unknown-1', 'failed', 'unknown-2'])
  })

  it('交错块按桶归并，桶内相对顺序不变', () => {
    const items = [itemOf('a', 1), itemOf('b', 1), itemOf('a', 2), itemOf('c', 1)]
    const map = new Map([
      ['a', entryOf('a', 10)],
      ['b', entryOf('b', 5)],
      ['c', entryOf('c', 2)],
    ])
    const sorted = sortResultsBySourceSpeed(items, map)
    expect(sorted.map(item => item.source_code)).toEqual(['a', 'a', 'b', 'c'])
    expect(sorted.map(item => item.vod_id)).toEqual(['1', '2', '1', '1'])
  })

  it('空速度表原样返回', () => {
    const items = [itemOf('a', 1), itemOf('b', 1)]
    expect(sortResultsBySourceSpeed(items, new Map())).toBe(items)
  })

  it('source_code 缺失归 unknown 桶沉底', () => {
    const missing = { vod_id: 'x', vod_name: '剧x' } as VideoItem
    const items = [missing, itemOf('a', 1)]
    const map = new Map([['a', entryOf('a', 10)]])
    const sorted = sortResultsBySourceSpeed(items, map)
    expect(sorted[0].source_code).toBe('a')
    expect(sorted[1]).toBe(missing)
  })
})

describe('formatSpeed', () => {
  it('1 位小数 MB/s', () => {
    expect(formatSpeed(8.456)).toBe('8.5 MB/s')
    expect(formatSpeed(0)).toBe('0.0 MB/s')
  })
})
