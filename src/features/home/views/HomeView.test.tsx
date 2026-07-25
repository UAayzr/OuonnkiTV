import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../components/CmsHomeContent', () => ({
  CmsHomeContent: () => <div>首页推荐内容</div>,
}))

import HomeView from './HomeView'

describe('首页', () => {
  it('显示首页内容区域', () => {
    render(<HomeView />)
    expect(screen.getByText('首页推荐内容')).toBeInTheDocument()
  })
})
