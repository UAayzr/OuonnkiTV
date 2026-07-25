import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'

vi.mock('../components', () => ({
  HistoryHeader: ({ totalCount, onOpenClearAll }: { totalCount: number; onOpenClearAll: () => void }) => (
    <div>
      <span>历史数量:{totalCount}</span>
      <button onClick={onOpenClearAll}>打开清空</button>
    </div>
  ),
  HistoryTimeline: ({ hasHistory }: { hasHistory: boolean }) => <div>{hasHistory ? '历史列表' : '暂无历史记录'}</div>,
  HistoryDialogs: ({ clearAllOpen, onClearAll }: { clearAllOpen: boolean; onClearAll: () => void }) =>
    clearAllOpen ? <button onClick={onClearAll}>确认清空历史</button> : null,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import HistoryView from './HistoryView'

beforeEach(() => {
  useViewingHistoryStore.setState({ viewingHistory: [] })
})

describe('观看历史页', () => {
  it('空数据时显示空状态', () => {
    render(<HistoryView />)
    expect(screen.getByText('历史数量:0')).toBeInTheDocument()
    expect(screen.getByText('暂无历史记录')).toBeInTheDocument()
  })

  it('显示历史并可以确认清空', async () => {
    const user = userEvent.setup()
    useViewingHistoryStore.setState({
      viewingHistory: [
        {
          recordType: 'cms',
          title: '影片',
          imageUrl: '',
          sourceCode: 'source',
          sourceName: '测试源',
          vodId: 'vod',
          episodeIndex: 0,
          episodeName: '第1集',
          playbackPosition: 10,
          duration: 100,
          timestamp: Date.now(),
        },
      ],
    })
    render(<HistoryView />)
    expect(screen.getByText('历史列表')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '打开清空' }))
    await user.click(screen.getByRole('button', { name: '确认清空历史' }))
    expect(useViewingHistoryStore.getState().viewingHistory).toEqual([])
  })
})
