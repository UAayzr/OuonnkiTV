import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FavoriteWatchStatus, type FavoriteItem } from '../../types/favorites'

vi.mock('@/shared/components/common/MediaPosterCard', () => ({
  MediaPosterCard: ({ title }: { title: string }) => <span>{title}</span>,
}))

vi.mock('@/shared/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
  }) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
    >
      选择收藏
    </button>
  ),
}))

vi.mock('@/shared/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({
    children,
    disabled,
    onClick,
    variant,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
    variant?: string
  }) => (
    <button type="button" disabled={disabled} data-variant={variant} onClick={onClick}>
      {children}
    </button>
  ),
  ContextMenuSeparator: () => <hr />,
  ContextMenuSub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuSubContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/shared/components/ui/alert-dialog', () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogMedia: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('@/shared/hooks/useWindowedGrid', () => ({
  useWindowedGrid: ({ items }: { items: FavoriteItem[] }) => ({
    containerRef: { current: null },
    visibleItems: items.map((item, index) => ({ item, index })),
    topPadding: 0,
    bottomPadding: 0,
  }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { FavoritesGrid } from './favoritesGrid'

const favorite: FavoriteItem = {
  id: 'favorite-1',
  addedAt: 1,
  updatedAt: 1,
  sourceType: 'cms',
  watchStatus: FavoriteWatchStatus.NOT_WATCHED,
  tags: [],
  media: {
    vodId: 'vod-1',
    vodName: '收藏影片',
    vodPic: '',
    vodYear: '2026',
    sourceCode: 'source',
    sourceName: '测试源',
  },
}

describe('FavoritesGrid', () => {
  it('加载中显示 20 个占位块', () => {
    const { container } = render(
      <FavoritesGrid
        favorites={[]}
        selectedIds={new Set()}
        onSelectionChange={vi.fn()}
        selectionMode={false}
        loading
      />,
    )

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(20)
  })

  it('显示收藏卡片，并能在多选模式勾选', async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()

    render(
      <FavoritesGrid
        favorites={[favorite]}
        selectedIds={new Set()}
        onSelectionChange={onSelectionChange}
        selectionMode
      />,
    )

    expect(screen.getByText('收藏影片')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: '选择收藏' }))

    const nextSelected = onSelectionChange.mock.calls[0][0] as Set<string>
    expect(nextSelected.has('favorite-1')).toBe(true)
  })

  it('可以修改观看状态并确认删除单个收藏', async () => {
    const user = userEvent.setup()
    const onUpdateWatchStatus = vi.fn()
    const onRemoveFavorite = vi.fn()

    render(
      <FavoritesGrid
        favorites={[favorite]}
        selectedIds={new Set()}
        onSelectionChange={vi.fn()}
        onUpdateWatchStatus={onUpdateWatchStatus}
        onRemoveFavorite={onRemoveFavorite}
        selectionMode={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: /已看完/ }))
    expect(onUpdateWatchStatus).toHaveBeenCalledWith('favorite-1', FavoriteWatchStatus.COMPLETED)

    await user.click(screen.getByRole('button', { name: /删除收藏/ }))
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    expect(onRemoveFavorite).toHaveBeenCalledWith('favorite-1')
  })
})
