import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoSource } from '@ouonnki/cms-core'

const initialSourcesMock = vi.hoisted(() => vi.fn())
vi.mock('@/shared/config/api.config', async importOriginal => {
  const actual = await importOriginal<typeof import('@/shared/config/api.config')>()
  return { ...actual, getInitialVideoSources: initialSourcesMock }
})

import { useApiStore } from './apiStore'

const source = (id: string, enabled = true): VideoSource => ({
  id,
  name: `源${id}`,
  url: `https://${id}.example.com`,
  isEnabled: enabled,
})

beforeEach(() => {
  localStorage.clear()
  initialSourcesMock.mockReset()
  useApiStore.setState({ videoAPIs: [], adFilteringEnabled: true })
})

describe('视频源状态', () => {
  it('新增置顶、更新保序，并支持启停与删除', () => {
    const store = useApiStore.getState()
    store.addAndUpdateVideoAPI(source('one'))
    store.addAndUpdateVideoAPI(source('two'))
    expect(useApiStore.getState().videoAPIs.map(item => item.id)).toEqual(['two', 'one'])

    store.addAndUpdateVideoAPI({ ...source('one'), name: '已更新' })
    expect(useApiStore.getState().videoAPIs.map(item => item.id)).toEqual(['two', 'one'])
    expect(useApiStore.getState().videoAPIs[1].name).toBe('已更新')

    store.setApiEnabled('one', false)
    expect(store.getSelectedAPIs().map(item => item.id)).toEqual(['two'])
    store.removeVideoAPI('two')
    expect(useApiStore.getState().videoAPIs.map(item => item.id)).toEqual(['one'])
  })

  it('支持全选、全不选、重排和广告过滤开关', () => {
    useApiStore.setState({ videoAPIs: [source('one'), source('two', false), source('three')] })
    const store = useApiStore.getState()
    store.deselectAllAPIs()
    expect(useApiStore.getState().videoAPIs.every(item => !item.isEnabled)).toBe(true)
    store.selectAllAPIs()
    store.reorderVideoAPIs(['three', 'one'])
    store.setAdFilteringEnabled(false)

    expect(useApiStore.getState().videoAPIs.map(item => item.id)).toEqual(['three', 'one', 'two'])
    expect(useApiStore.getState().adFilteringEnabled).toBe(false)
  })

  it('替换订阅源时保留用户的启用选择', () => {
    useApiStore.setState({
      videoAPIs: [
        source('manual'),
        { ...source('sub:abc:0', false), name: '订阅源', url: 'https://sub.example.com' },
      ],
    })
    useApiStore.getState().replaceSubscriptionSources('abc', [
      { ...source('sub:abc:9'), name: '订阅源', url: 'https://sub.example.com' },
      { ...source('sub:abc:10'), name: '新源', url: 'https://new.example.com' },
    ])

    const next = useApiStore.getState().videoAPIs
    expect(next.map(item => item.id)).toEqual(['manual', 'sub:abc:9', 'sub:abc:10'])
    expect(next[1].isEnabled).toBe(false)
    useApiStore.getState().removeSubscriptionSources('abc')
    expect(useApiStore.getState().videoAPIs.map(item => item.id)).toEqual(['manual'])
  })

  it('从初始配置加载并支持恢复默认源', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    initialSourcesMock.mockResolvedValue([source('initial')])
    await useApiStore.getState().initializeEnvSources()
    expect(useApiStore.getState().videoAPIs.map(item => item.id)).toEqual(['initial'])

    useApiStore.getState().addAndUpdateVideoAPI(source('custom'))
    await useApiStore.getState().resetVideoSources()
    expect(useApiStore.getState().videoAPIs.map(item => item.id)).toEqual(['initial'])
  })
})
