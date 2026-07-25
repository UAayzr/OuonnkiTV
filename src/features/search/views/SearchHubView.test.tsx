import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addHistory: vi.fn(),
  removeHistory: vi.fn(),
  clearHistory: vi.fn(),
  history: [{ id: 'history-1', content: '旧关键词', createdAt: 1, updatedAt: 1 }],
}))

vi.mock('@/shared/hooks', () => ({
  useDocumentTitle: vi.fn(),
  useSearchHistory: () => ({
    searchHistory: mocks.history,
    removeSearchHistoryItem: mocks.removeHistory,
    clearSearchHistory: mocks.clearHistory,
  }),
}))

vi.mock('@/shared/store/searchStore', () => ({
  useSearchStore: () => ({ addSearchHistoryItem: mocks.addHistory }),
}))

vi.mock('../components', () => ({
  SearchHubInput: ({
    initialQuery,
    onSearch,
    onClear,
  }: {
    initialQuery: string
    onSearch: (query: string) => void
    onClear: () => void
  }) => (
    <div>
      <span>输入值:{initialQuery}</span>
      <button onClick={() => onSearch('  新   关键词  ')}>执行搜索</button>
      <button onClick={onClear}>清除搜索</button>
    </div>
  ),
  SearchDirectSection: ({ query }: { query: string }) => <div>搜索结果:{query || '空'}</div>,
}))

import SearchHubView from './SearchHubView'

describe('搜索页', () => {
  it('空搜索时显示提示和历史记录', () => {
    render(
      <MemoryRouter initialEntries={['/search']}>
        <SearchHubView />
      </MemoryRouter>,
    )
    expect(screen.getByText('发现你的下一部好剧')).toBeInTheDocument()
    expect(screen.getByText('旧关键词')).toBeInTheDocument()
    expect(screen.getByText('搜索结果:空')).toBeInTheDocument()
  })

  it('执行搜索时整理空格、保存历史并更新结果', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/search']}>
        <SearchHubView />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '执行搜索' }))
    expect(mocks.addHistory).toHaveBeenCalledWith('新 关键词')
    expect(screen.getByText('搜索结果:新 关键词')).toBeInTheDocument()
  })

  it('可以清除全部历史记录', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/search']}>
        <SearchHubView />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: '清除' }))
    expect(mocks.clearHistory).toHaveBeenCalled()
  })
})
