import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmModal } from './ConfirmModal'
import { MediaPosterCard } from './MediaPosterCard'

describe('通用卡片和确认弹窗', () => {
  it('海报卡片显示信息，图片失败后显示占位内容', () => {
    render(
      <MemoryRouter>
        <MediaPosterCard
          to="/play"
          posterUrl="https://example.com/poster.jpg"
          title="测试影片"
          year="2026"
          topRightLabel="测试源"
          rating={8.5}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('测试影片')).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(screen.getByText('测试源')).toBeInTheDocument()
    expect(screen.getByText('8.5')).toBeInTheDocument()
    fireEvent.error(screen.getByRole('img', { name: '测试影片' }))
    expect(screen.getByText('暂无海报')).toBeInTheDocument()
  })

  it('确认弹窗能取消并确认操作', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="删除记录"
        description="此操作不可撤销"
      />,
    )
    expect(screen.getByText('此操作不可撤销')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认' }))
    expect(onConfirm).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
