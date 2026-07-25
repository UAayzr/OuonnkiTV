import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMocks }))

import { extractSubscriptionId, isSubscriptionSource, useSubscriptionStore } from './subscriptionStore'
import { useApiStore } from './apiStore'

beforeEach(() => {
  localStorage.clear()
  toastMocks.success.mockClear()
  toastMocks.error.mockClear()
  useSubscriptionStore.setState({ subscriptions: [] })
  useApiStore.setState({ videoAPIs: [], adFilteringEnabled: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('视频源订阅状态', () => {
  it('识别和提取订阅来源编号', () => {
    expect(isSubscriptionSource('sub:abc:0')).toBe(true)
    expect(isSubscriptionSource('manual')).toBe(false)
    expect(extractSubscriptionId('sub:abc:0')).toBe('abc')
    expect(extractSubscriptionId('manual')).toBeNull()
  })

  it('添加订阅后立即拉取并写入视频源', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify([{ name: '远程源', url: 'https://remote.example.com' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    await useSubscriptionStore.getState().addSubscription('https://config.example.com/sources.json')

    const subscription = useSubscriptionStore.getState().subscriptions[0]
    expect(subscription).toMatchObject({
      name: 'config.example.com',
      sourceCount: 1,
      lastRefreshSuccess: true,
    })
    expect(useApiStore.getState().videoAPIs[0]).toMatchObject({
      name: '远程源',
      id: expect.stringMatching(new RegExp(`^sub:${subscription.id}:0$`)),
    })
  })

  it('阻止重复订阅并记录刷新失败', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    const store = useSubscriptionStore.getState()
    await store.addSubscription('https://config.example.com/sources.json', '测试订阅')
    await store.addSubscription('https://config.example.com/sources.json', '重复')

    const subscriptions = useSubscriptionStore.getState().subscriptions
    expect(subscriptions).toHaveLength(1)
    expect(subscriptions[0]).toMatchObject({ lastRefreshSuccess: false, lastRefreshError: 'offline' })
    expect(toastMocks.error).toHaveBeenCalled()
  })

  it('修改刷新间隔并在删除订阅时移除对应视频源', () => {
    useSubscriptionStore.setState({
      subscriptions: [
        {
          id: 'abc',
          name: '订阅',
          url: 'https://config.example.com',
          sourceCount: 1,
          lastRefreshedAt: null,
          lastRefreshSuccess: true,
          lastRefreshError: null,
          refreshInterval: 60,
          createdAt: new Date(),
        },
      ],
    })
    useApiStore.setState({
      videoAPIs: [
        { id: 'sub:abc:0', name: '订阅源', url: 'https://one.example.com', isEnabled: true },
      ],
    })

    useSubscriptionStore.getState().setRefreshInterval('abc', 15)
    expect(useSubscriptionStore.getState().subscriptions[0].refreshInterval).toBe(15)
    useSubscriptionStore.getState().removeSubscription('abc')
    expect(useSubscriptionStore.getState().subscriptions).toEqual([])
    expect(useApiStore.getState().videoAPIs).toEqual([])
  })
})
