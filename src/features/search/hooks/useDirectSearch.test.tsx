import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoItem, VideoSource } from '@ouonnki/cms-core'
import { useApiStore } from '@/shared/store/apiStore'
import { getSourceLatency, useSourceLatencyStore } from '../lib/sourceLatency'
import { useDirectSearch } from './useDirectSearch'

// 假 CmsClient：手动触发 search:result，aggregatedSearch 保持挂起（不自动完成）
const { fakeClient, listeners, emit } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: Record<string, unknown>) => void>>()
  const fakeClient = {
    on: (type: string, handler: (event: Record<string, unknown>) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(handler)
      return () => {
        listeners.get(type)?.delete(handler)
      }
    },
    aggregatedSearch: () => new Promise(() => {}),
  }
  const emit = (type: string, event: Record<string, unknown>) => {
    listeners.get(type)?.forEach(handler => handler({ type, ...event }))
  }
  return { fakeClient, listeners, emit }
})

vi.mock('@/shared/hooks', () => ({ useCmsClient: () => fakeClient }))

const makeSource = (id: string): VideoSource => ({
  id,
  name: id,
  url: `https://${id}.example.com`,
  isEnabled: true,
})

const makeItem = (sourceCode: string, vodId: string, vodName: string): VideoItem => ({
  vod_id: vodId,
  vod_name: vodName,
  source_code: sourceCode,
})

const emitResult = (
  source: VideoSource,
  items: VideoItem[],
  durationMs: number,
) => {
  emit('search:result', {
    source,
    items,
    isIncremental: true,
    durationMs,
  })
}

beforeEach(() => {
  listeners.clear()
  useSourceLatencyStore.getState().reset()
})

describe('useDirectSearch 排序', () => {
  it('相关性优先：高相关慢源排在前，低相关快源在后', () => {
    const slow = makeSource('slow')
    const fast = makeSource('fast')
    useApiStore.setState({ videoAPIs: [slow, fast] })

    const { result } = renderHook(() => useDirectSearch())
    act(() => {
      void result.current.startDirectSearch('三体', 1)
    })

    act(() => {
      emitResult(slow, [makeItem('slow', '1', '三体')], 900)
    })
    act(() => {
      emitResult(fast, [makeItem('fast', '1', '三体 第二季')], 50)
    })

    expect(result.current.directResults.map(item => item.source_code)).toEqual(['slow', 'fast'])
  })

  it('相关性相同时快源在前', () => {
    const slow = makeSource('slow')
    const fast = makeSource('fast')
    useApiStore.setState({ videoAPIs: [slow, fast] })

    const { result } = renderHook(() => useDirectSearch())
    act(() => {
      void result.current.startDirectSearch('三体', 1)
    })

    act(() => {
      emitResult(slow, [makeItem('slow', '1', '三体')], 900)
    })
    act(() => {
      emitResult(fast, [makeItem('fast', '1', '三体')], 50)
    })

    expect(result.current.directResults.map(item => item.source_code)).toEqual(['fast', 'slow'])
  })

  it('旧请求的迟到结果不计入耗时表（耗时按查询词隔离）', () => {
    const slow = makeSource('slow')
    useApiStore.setState({ videoAPIs: [slow] })

    const { result } = renderHook(() => useDirectSearch())
    act(() => {
      void result.current.startDirectSearch('三体', 1)
    })
    // 切换关键词：旧订阅因版本号不匹配而被忽略
    act(() => {
      void result.current.startDirectSearch('流浪地球', 1)
    })

    act(() => {
      emitResult(slow, [makeItem('slow', '1', '三体')], 100)
    })

    expect(getSourceLatency('slow', '流浪地球')).not.toBeNull()
    expect(getSourceLatency('slow', '三体')).toBeNull()
  })
})