import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayerEpisodePanel } from './PlayerEpisodePanel'

describe('播放器选集面板', () => {
  it('显示集数、当前状态和进度，并可切换顺序和集数', async () => {
    const user = userEvent.setup()
    const onToggleOrder = vi.fn()
    const onEpisodeSelect = vi.fn()
    render(
      <PlayerEpisodePanel
        totalEpisodes={2}
        selectedEpisode={0}
        isReversed={false}
        onToggleOrder={onToggleOrder}
        pageRanges={[]}
        currentPageRange=""
        onPageRangeChange={vi.fn()}
        episodes={[
          { name: '第一集', actualIndex: 0, displayIndex: 0 },
          { name: '第二集', actualIndex: 1, displayIndex: 1 },
        ]}
        onEpisodeSelect={onEpisodeSelect}
        episodeProgressMap={new Map([[1, 45]])}
      />,
    )

    expect(screen.getByText('第 1 集 / 共 2 集')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换到第一集' })).toHaveAttribute('aria-current', 'true')
    await user.click(screen.getByRole('button', { name: '倒序' }))
    await user.click(screen.getByRole('button', { name: '切换到第二集' }))
    expect(onToggleOrder).toHaveBeenCalled()
    expect(onEpisodeSelect).toHaveBeenCalledWith(1)
  })
})
