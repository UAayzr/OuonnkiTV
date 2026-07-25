import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./SearchBox', () => ({
  default: () => <div>导航搜索框</div>,
}))

vi.mock('./theme', () => ({
  ThemeToggle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useThemeState: () => ({ mode: 'light' }),
}))

vi.mock('@/shared/components/icons', () => ({
  OkiLogo: () => <span>应用标志</span>,
}))

vi.mock('@/shared/components/ui/sidebar', () => ({
  SidebarTrigger: () => <button type="button">打开侧栏</button>,
}))

import Navigation from './Navigation'

function renderNavigation(path: string, hidden = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navigation hidden={hidden} />
    </MemoryRouter>,
  )
}

describe('Navigation', () => {
  it('首页显示导航搜索框', () => {
    renderNavigation('/')

    expect(screen.getByText('导航搜索框')).toBeInTheDocument()
    expect(screen.getByText('UAayZR TV')).toBeInTheDocument()
  })

  it('搜索页隐藏导航搜索框', () => {
    renderNavigation('/search')

    expect(screen.queryByText('导航搜索框')).not.toBeInTheDocument()
  })

  it('隐藏状态会把导航高度收起', () => {
    const { container } = renderNavigation('/', true)

    expect(container.firstElementChild).toHaveStyle({ height: '0rem' })
  })
})
