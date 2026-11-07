import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { DetailResult, VideoSource } from '@ouonnki/cms-core'
import { clearDetailCache, cacheDetailResult } from '@/shared/lib/detailCache'
import { usePlayerDetail } from './usePlayerDetail'

const getDetailMock = vi.fn()

vi.mock('@/shared/lib/detailCache', async original => {
  const actual = await original<typeof import('@/shared/lib/detailCache')>()
  return {
    ...actual,
    prefetchCmsDetail: vi.fn(async (sourceCode: string, vodId: string) => {
      const response = await getDetailMock()
      if (response?.success) {
        actual.cacheDetailResult(sourceCode, vodId, response)
        return false
      }
      return false
    }),
  }
})

const sourceConfig = {
  id: 'source1',
  name: '源1',
  url: 'https://cdn.example.com/api.php',
} as unknown as VideoSource

const baseParams = {
  cmsClient: { getDetail: getDetailMock } as never,
  routeError: null,
  sourceCode: 'source1',
  vodId: '85265',
  sourceConfig,
}

const okDetail = {
  success: true,
  episodes: ['https://cdn.example.com/e1.m3u8'],
} as unknown as DetailResult

afterEach(() => {
  clearDetailCache()
  vi.clearAllMocks()
})

describe('usePlayerDetail 缓存优先', () => {
  it('缓存命中时直接呈现,不发起请求', async () => {
    cacheDetailResult('source1', '85265', okDetail)
    getDetailMock.mockResolvedValue(okDetail)

    const { result } = renderHook(() => usePlayerDetail(baseParams))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.detail).toEqual(okDetail)
    expect(getDetailMock).not.toHaveBeenCalled()
  })

  it('缓存未命中时走正常请求并写缓存', async () => {
    getDetailMock.mockResolvedValue(okDetail)

    const { result } = renderHook(() => usePlayerDetail(baseParams))
    await waitFor(() => {
      expect(result.current.detail).toEqual(okDetail)
    })

    expect(getDetailMock).toHaveBeenCalled()
    // 请求成功已写入缓存(下次挂载命中)
    const { getCachedDetail } = await import('@/shared/lib/detailCache')
    expect(getCachedDetail('source1', '85265')).toEqual(okDetail)
  })

  it('请求失败时不呈现详情', async () => {
    getDetailMock.mockResolvedValue({ success: false, error: 'boom' })

    const { result } = renderHook(() => usePlayerDetail(baseParams))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.detail).toBeNull()
    expect(result.current.error).toBe('boom')
  })
})