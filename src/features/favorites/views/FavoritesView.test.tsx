import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FavoriteWatchStatus } from '../types/favorites'

interface MockFavorite {
  id: string
  title: string
  watchStatus: FavoriteWatchStatus
}

const mocks = vi.hoisted(() => ({
  favorites: [] as MockFavorite[],
  removeFavorite: vi.fn(),
  removeFavorites: vi.fn(),
  setFilter: vi.fn(),
  updateWatchStatus: vi.fn(),
  setSelectedIds: vi.fn(),
}))

vi.mock('../hooks/useFavorites', () => ({
  useFavorites: () => ({
    filteredFavorites: mocks.favorites,
    filterOptions: { sortBy: 'addedAt', sortOrder: 'desc' },
    stats: {
      total: mocks.favorites.length,
      notWatched: mocks.favorites.filter(item => item.watchStatus === FavoriteWatchStatus.NOT_WATCHED).length,
      watching: 0,
      watched: 0,
    },
    removeFavorite: mocks.removeFavorite,
    removeFavorites: mocks.removeFavorites,
    setFilter: mocks.setFilter,
    updateWatchStatus: mocks.updateWatchStatus,
    setSelectedIds: mocks.setSelectedIds,
  }),
}))

vi.mock('@/shared/hooks/usePortalToSidebarInset', () => ({
  usePortalToSidebarInset: () => ({ SidebarInsetPortal: ({ children }: { children: ReactNode }) => children }),
}))

vi.mock('../components/StatusTabs', () => ({
  StatusTabs: () => <div>状态标签</div>,
}))
vi.mock('../components/FavoritesSortControl', () => ({
  FavoritesSortControl: ({ onChange }: { onChange: (value: 'title_asc') => void }) => (
    <button onClick={() => onChange('title_asc')}>更改排序</button>
  ),
}))
vi.mock('../components/ui/favoritesGrid', () => ({
  FavoritesGrid: ({ favorites }: { favorites: MockFavorite[] }) => (
    <div>收藏列表:{favorites.map(item => item.title).join(',')}</div>
  ),
}))
vi.mock('../components/ManagementPanel', () => ({
  ManagementPanel: ({ onClearAll }: { onClearAll: () => void }) => (
    <button onClick={onClearAll}>清空当前收藏</button>
  ),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import FavoritesView from './FavoritesView'

beforeEach(() => {
  mocks.favorites = []
  mocks.removeFavorites.mockClear()
  mocks.setFilter.mockClear()
})

describe('收藏页', () => {
  it('空数据时显示空状态', () => {
    render(<FavoritesView />)
    expect(screen.getByText('暂无收藏内容')).toBeInTheDocument()
  })

  it('显示收藏内容并支持排序和清空', async () => {
    const user = userEvent.setup()
    mocks.favorites = [
      { id: 'one', title: '收藏影片', watchStatus: FavoriteWatchStatus.NOT_WATCHED },
    ]
    render(<FavoritesView />)

    expect(screen.getByText('收藏列表:收藏影片')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '更改排序' }))
    expect(mocks.setFilter).toHaveBeenCalledWith({ sortBy: 'title', sortOrder: 'asc' })
    await user.click(screen.getByRole('button', { name: '清空当前收藏' }))
    expect(mocks.removeFavorites).toHaveBeenCalledWith(['one'])
  })
})
