import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VideoSource } from '@ouonnki/cms-core'
import {
  LATENCY_TTL_MS,
  formatLatency,
  getLatencySnapshot,
  getSourceLatency,
  normalizeLatencyQuery,
  recordSourceLatency,
  resetSourceLatencies,
  useSourceLatencyStore,
} from './sourceLatency'

const makeSource = (id = 'a', url = 'https://a.example.com'): VideoSource => ({
  id,
  name: `源${id}`,
  url,
  isEnabled: true,
})

let clock: { now: number }
let networkKey: string

const deps = () => ({
  now: () => clock.now,
  getNetworkKey: () => networkKey,
})

beforeEach(() => {
  resetSourceLatencies()
  clock = { now: 0 }
  networkKey = 'direct|/proxy?url=|3'
})

afterEach(() => {
  resetSourceLatencies()
})

describe('formatLatency', () => {
  it('毫秒与秒的边界', () => {
    expect(formatLatency(0)).toBe('0ms')
    expect(formatLatency(320)).toBe('320ms')
    expect(formatLatency(999)).toBe('999ms')
    expect(formatLatency(1000)).toBe('1.0s')
    expect(formatLatency(1234)).toBe('1.2s')
    expect(formatLatency(10_000)).toBe('10s')
    expect(formatLatency(12_000)).toBe('12s')
  })

  it('无效值返回空串', () => {
    expect(formatLatency(Number.NaN)).toBe('')
    expect(formatLatency(Infinity)).toBe('')
    expect(formatLatency(-1)).toBe('')
  })
})

describe('recordSourceLatency', () => {
  it('首次采样直接作为平滑值', () => {
    const entry = recordSourceLatency(makeSource(), 120, '三体', deps())

    expect(entry.sourceId).toBe('a')
    expect(entry.lastMs).toBe(120)
    expect(entry.smoothedMs).toBe(120)
    expect(entry.sampleCount).toBe(1)
  })

  it('同源同词再次采样按 EMA 平滑', () => {
    recordSourceLatency(makeSource(), 120, '三体', deps())
    const entry = recordSourceLatency(makeSource(), 200, '三体', deps())

    // 120 + 0.5 * (200 - 120) = 160
    expect(entry.smoothedMs).toBe(160)
    expect(entry.lastMs).toBe(200)
    expect(entry.sampleCount).toBe(2)
  })

  it('不同搜索词重新起算', () => {
    recordSourceLatency(makeSource(), 120, '三体', deps())
    const entry = recordSourceLatency(makeSource(), 200, '流浪地球', deps())

    expect(entry.smoothedMs).toBe(200)
    expect(entry.sampleCount).toBe(1)
    expect(getSourceLatency('a', '三体', deps())).toBeNull()
  })

  it('源地址变化后旧样本作废', () => {
    recordSourceLatency(makeSource('a', 'https://old.example.com'), 500, '三体', deps())
    const entry = recordSourceLatency(
      makeSource('a', 'https://new.example.com'),
      80,
      '三体',
      deps(),
    )

    expect(entry.smoothedMs).toBe(80)
    expect(entry.sampleCount).toBe(1)
  })

  it('空格差异视为同一个搜索词', () => {
    recordSourceLatency(makeSource(), 100, ' 三体   动画 ', deps())
    const entry = recordSourceLatency(makeSource(), 200, '三体 动画', deps())

    expect(entry.sampleCount).toBe(2)
  })
})

describe('耗时表生命周期', () => {
  it('TTL 到期后不再返回', () => {
    recordSourceLatency(makeSource(), 120, '三体', deps())

    clock.now = LATENCY_TTL_MS - 1
    expect(getSourceLatency('a', '三体', deps())?.smoothedMs).toBe(120)

    clock.now = LATENCY_TTL_MS
    expect(getSourceLatency('a', '三体', deps())).toBeNull()
    expect(getLatencySnapshot(deps()).size).toBe(0)
  })

  it('网络配置变化时整表失效', () => {
    recordSourceLatency(makeSource(), 120, '三体', deps())
    expect(getLatencySnapshot(deps()).size).toBe(1)

    networkKey = 'proxy|/proxy?url=|3'
    expect(getLatencySnapshot(deps()).size).toBe(0)
  })

  it('快照是副本，外部修改不影响内部', () => {
    recordSourceLatency(makeSource(), 120, '三体', deps())
    const snapshot = getLatencySnapshot(deps())
    snapshot.clear()

    expect(getLatencySnapshot(deps()).size).toBe(1)
  })
})

describe('normalizeLatencyQuery', () => {
  it('去首尾空白并压缩内部空白', () => {
    expect(normalizeLatencyQuery('  三体   动画  ')).toBe('三体 动画')
  })
})

describe('useSourceLatencyStore', () => {
  it('record 发布新 Map，reset 清空', () => {
    const before = useSourceLatencyStore.getState().entries
    useSourceLatencyStore.getState().record(makeSource(), 120, '三体')
    const after = useSourceLatencyStore.getState().entries

    expect(after).not.toBe(before)
    expect(after.get('a')?.smoothedMs).toBe(120)

    useSourceLatencyStore.getState().reset()
    expect(useSourceLatencyStore.getState().entries.size).toBe(0)
  })
})