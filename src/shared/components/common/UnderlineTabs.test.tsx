import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UnderlineTabs } from './UnderlineTabs'

describe('UnderlineTabs', () => {
  it('显示当前选中项的下划线', () => {
    const { container } = render(
      <UnderlineTabs
        options={[
          { key: 'all', label: '全部' },
          { key: 'favorite', label: '收藏' },
        ]}
        activeKey="favorite"
        onChange={vi.fn()}
        layoutId="测试下划线"
      />,
    )

    expect(screen.getByRole('button', { name: '收藏' })).toBeInTheDocument()
    expect(container.querySelector('[data-layout-id="测试下划线"]')).toBeInTheDocument()
  })

  it('点击未选中项会通知外层切换', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <UnderlineTabs
        options={[
          { key: 'all', label: '全部' },
          { key: 'favorite', label: '收藏' },
        ]}
        activeKey="all"
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '收藏' }))

    expect(onChange).toHaveBeenCalledWith('favorite')
  })
})
