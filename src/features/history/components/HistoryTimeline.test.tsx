import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ViewingHistoryItem } from '@/shared/types'

vi.mock('@/shared/components/common', () => ({
  ViewingHistoryCard: ({
    item,
    onToggleSelect,
    selectionMode,
    selected,
  }: {
    item: ViewingHistoryItem
    onToggleSelect: (item: ViewingHistoryItem) => void
    selectionMode: boolean
    selected: boolean
  }) => (
    <button type="button" aria-pressed={selected} onClick={() => onToggleSelect(item)}>
      {item.title}
      {selectionMode ? ' 多选' : ''}
    </button>
  ),
}))

vi.mock('@/shared/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({
    children,
    onClick,
    variant,
  }: {
    children: ReactNode
    onClick?: () => void
    variant?: string
  }) => (
    <button type="button" data-variant={variant} onClick={onClick}>
      {children}
    </button>
  ),
  ContextMenuSeparator: () => <hr />,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/shared/hooks/useWindowedGrid', () => ({
  useWindowedGrid: ({ items }: { items: ViewingHistoryItem[] }) => ({
    containerRef: { current: null },
    visibleItems: items.map((item, index) => ({ item, index })),
    topPadding: 0,
    bottomPadding: 0,
  }),
}))

import { HistoryTimeline } from './HistoryTimeline'

const historyItem: ViewingHistoryItem = {
  recordType: 'cms',
  title: '历史影片',
  imageUrl: '',
  episodeIndex: 1,
  episodeName: '第1集',
  sourceCode: 'source',
  sourceName: '测试源',
  vodId: 'vod-1',
  timestamp: Date.now(),
  playbackPosition: 60,
  duration: 120,
}

describe('HistoryTimeline', () => {
  it('没有观看历史时显示空状态', () => {
    render(
      <HistoryTimeline
        hasHistory={false}
        sectionedHistory={{ today: [], yesterday: [], older: [] }}
        selectedKeys={new Set()}
        selectionMode={false}
        onToggleItemSelected={vi.fn()}
        onEnableSelectionMode={vi.fn()}
        onRequestDeleteItem={vi.fn()}
      />,
    )

    expect(screen.getByText('暂无观看历史')).toBeInTheDocument()
  })

  it('显示分组和历史卡片，并支持点选', async () => {
    const user = userEvent.setup()
    const onToggleItemSelected = vi.fn()

    render(
      <HistoryTimeline
        hasHistory
        sectionedHistory={{ today: [historyItem], yesterday: [], older: [] }}
        selectedKeys={new Set()}
        selectionMode
        onToggleItemSelected={onToggleItemSelected}
        onEnableSelectionMode={vi.fn()}
        onRequestDeleteItem={vi.fn()}
      />,
    )

    expect(screen.getAllByText('今天')).toHaveLength(2)
    expect(screen.getAllByText('1 项')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: '历史影片 多选' }))

    expect(onToggleItemSelected).toHaveBeenCalledWith(historyItem)
  })

  it('右键菜单里的删除入口会通知外层确认', async () => {
    const user = userEvent.setup()
    const onRequestDeleteItem = vi.fn()

    render(
      <HistoryTimeline
        hasHistory
        sectionedHistory={{ today: [historyItem], yesterday: [], older: [] }}
        selectedKeys={new Set()}
        selectionMode={false}
        onToggleItemSelected={vi.fn()}
        onEnableSelectionMode={vi.fn()}
        onRequestDeleteItem={onRequestDeleteItem}
      />,
    )

    await user.click(screen.getByRole('button', { name: /删除记录/ }))

    expect(onRequestDeleteItem).toHaveBeenCalledWith(historyItem)
  })
})
