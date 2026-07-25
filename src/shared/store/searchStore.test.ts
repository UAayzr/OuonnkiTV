import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearchStore } from './searchStore'
import { useSettingStore } from './settingStore'

beforeEach(() => {
  localStorage.clear()
  useSearchStore.setState({ query: '', searchHistory: [] })
  useSettingStore.getState().resetSettings()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('搜索状态', () => {
  it('整理空格、去重并把最近搜索放在前面', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-24T10:00:00Z'))
    const store = useSearchStore.getState()
    store.addSearchHistoryItem('  海   边  ')
    vi.setSystemTime(new Date('2026-07-24T10:00:01Z'))
    store.addSearchHistoryItem('电影')
    vi.setSystemTime(new Date('2026-07-24T10:00:02Z'))
    store.addSearchHistoryItem('海 边')

    const history = useSearchStore.getState().searchHistory
    expect(history).toHaveLength(2)
    expect(history[0].content).toBe('海 边')
  })

  it('遵守关闭记录和最大数量设置', () => {
    useSettingStore.getState().setSearchSettings({ isSearchHistoryEnabled: false })
    useSearchStore.getState().addSearchHistoryItem('不会保存')
    expect(useSearchStore.getState().searchHistory).toEqual([])

    useSettingStore.getState().setSearchSettings({
      isSearchHistoryEnabled: true,
      maxSearchHistoryCount: 2,
    })
    useSearchStore.getState().addSearchHistoryItem('一')
    useSearchStore.getState().addSearchHistoryItem('二')
    useSearchStore.getState().addSearchHistoryItem('三')
    expect(useSearchStore.getState().searchHistory.map(item => item.content)).toEqual(['三', '二'])
  })

  it('支持查询、单条删除和全部清空', () => {
    const store = useSearchStore.getState()
    store.setQuery('测试')
    store.addSearchHistoryItem('历史')
    const id = useSearchStore.getState().searchHistory[0].id
    store.removeSearchHistoryItem(id)
    expect(useSearchStore.getState().searchHistory).toEqual([])
    store.clearQuery()
    expect(useSearchStore.getState().query).toBe('')
    store.clearSearchHistory()
  })
})
