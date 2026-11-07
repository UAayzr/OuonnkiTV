import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DetailResult } from '@ouonnki/cms-core'
import { clearDetailCache, getCachedDetail, prefetchCmsDetail, cacheDetailResult } from './detailCache'

const mocks = vi.hoisted(() => {
  const client = {
    getDetail: vi.fn(async () => ({ success: false, error: 'never' }) as unknown as DetailResult),
  }
  return {
    client,
    sourceFound: true,
    getCmsClient: vi.fn(() => client),
  }
})

vi.mock('@/shared/hooks/useCmsCore', () => ({
  getCmsClient: mocks.getCmsClient,
}))

vi.mock('@/shared/store', () => ({
  useApiStore: {
    getState: () => ({
      videoAPIs: mocks.sourceFound ? [{ id: 'source1', name: '源1' }] : [],
    }),
  },
}))

afterEach(() => {
  clearDetailCache()
  vi.clearAllMocks()
  mocks.sourceFound = true
})

describe('detailCache 详情缓存', () => {
  it('预取成功后 getCachedDetail 命中', async () => {
    mocks.client.getDetail.mockResolvedValue({
      success: true,
      episodes: ['https://cdn.example.com/e1.m3u8'],
    } as unknown as DetailResult)

    await prefetchCmsDetail('source1', '85265')
    expect(getCachedDetail('source1', '85265')).toEqual({
      success: true,
      episodes: ['https://cdn.example.com/e1.m3u8'],
    })
  })

  it('并发预取只发一次请求(in-flight 去重)', async () => {
    await Promise.all([
      prefetchCmsDetail('source1', '85265'),
      prefetchCmsDetail('source1', '85265'),
    ])
    expect(mocks.client.getDetail).toHaveBeenCalledTimes(1)
  })

  it('源不存在时静默跳过(不写缓存不报错)', async () => {
    mocks.sourceFound = false
    await expect(prefetchCmsDetail('missing', '1')).resolves.toBeNull()
    expect(getCachedDetail('missing', '1')).toBeNull()
  })

  it('请求失败静默,不写缓存', async () => {
    mocks.client.getDetail.mockResolvedValue({ success: false, error: 'boom' } as unknown as DetailResult)
    await prefetchCmsDetail('source1', '85265')
    expect(getCachedDetail('source1', '85265')).toBeNull()
  })

  it('显式 cacheDetailResult 后可命中', () => {
    const result = { success: true, episodes: ['u'] } as unknown as DetailResult
    cacheDetailResult('source1', '7', result)
    expect(getCachedDetail('source1', '7')).toEqual(result)
  })
})