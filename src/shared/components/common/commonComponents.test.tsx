import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmModal } from './ConfirmModal'
import { MediaPosterCard } from './MediaPosterCard'

const prefetchMock = vi.hoisted(() => vi.fn(async () => undefined))
const warmChainMock = vi.hoisted(() => vi.fn(async () => true))
const networkSettingsMock = vi.hoisted(() => ({
  isProxyEnabled: true,
  proxyUrl: 'https://my-proxy.example/proxy?url=',
}))

vi.mock('@/shared/lib/detailCache', async original => {
  const actual = await original<typeof import('@/shared/lib/detailCache')>()
  return {
    ...actual,
    prefetchCmsDetail: prefetchMock,
  }
})

vi.mock('@/shared/lib/playbackWarmup', () => ({
  warmPlaybackChain: warmChainMock,
}))

vi.mock('@/shared/store/settingStore', () => ({
  useSettingStore: () => ({ network: networkSettingsMock }),
}))

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

  it('海报卡片支持次级角标（源速度），缺省时不渲染', () => {
    render(
      <MemoryRouter>
        <MediaPosterCard to="/play" posterUrl={null} title="测试影片" topRightLabel="源A" />
      </MemoryRouter>,
    )
    expect(screen.queryByText('8.5 MB/s')).not.toBeInTheDocument()

    const { getByText } = render(
      <MemoryRouter>
        <MediaPosterCard
          to="/play"
          posterUrl={null}
          title="测试影片"
          topRightLabel="源A"
          topRightSecondaryLabel="8.5 MB/s"
        />
      </MemoryRouter>,
    )
    const label = getByText('8.5 MB/s')
    expect(label).toBeInTheDocument()
    // 弹性浮现动画 + 无障碍降级
    expect(label.className).toContain('speed-tag-in')
    expect(label.className).toContain('motion-reduce:animate-none')
  })

  it('播放路径卡片点击时预取详情(非播放路径不预取)', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <MediaPosterCard to="/play/cms/source1/85265" posterUrl={null} title="影片A" />
      </MemoryRouter>,
    )
    await user.click(screen.getByText('影片A'))
    await waitFor(() => {
      expect(prefetchMock).toHaveBeenCalledWith('source1', '85265')
    })
  })

  it('非播放路径不触发预取', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <MediaPosterCard to="/settings" posterUrl={null} title="设置入口" />
      </MemoryRouter>,
    )
    await user.click(screen.getByText('设置入口'))
    await waitFor(() => {
      expect(prefetchMock).not.toHaveBeenCalled()
    })
  })

  it('hover 暖链使用设置里的自定义代理前缀', async () => {
    prefetchMock.mockResolvedValue({
      success: true,
      episodes: ['https://cdn.example.com/e1.m3u8'],
    } as never)
    networkSettingsMock.isProxyEnabled = true
    networkSettingsMock.proxyUrl = 'https://my-proxy.example/proxy?url='

    render(
      <MemoryRouter>
        <MediaPosterCard to="/play/cms/source1/85265" posterUrl={null} title="影片B" />
      </MemoryRouter>,
    )
    fireEvent.pointerEnter(screen.getByText('影片B'))
    // hover 有 200ms 防抖,等待防抖与预取 promise 链
    await waitFor(
      () => {
        expect(warmChainMock).toHaveBeenCalledWith(
          'https://cdn.example.com/e1.m3u8',
          'https://my-proxy.example/proxy?url=',
        )
      },
      { timeout: 2000 },
    )
  })

  it('代理关闭时 hover 不暖链(详情预取仍执行)', async () => {
    prefetchMock.mockResolvedValue({
      success: true,
      episodes: ['https://cdn.example.com/e1.m3u8'],
    } as never)
    networkSettingsMock.isProxyEnabled = false
    warmChainMock.mockClear()

    render(
      <MemoryRouter>
        <MediaPosterCard to="/play/cms/source1/85265" posterUrl={null} title="影片C" />
      </MemoryRouter>,
    )
    fireEvent.pointerEnter(screen.getByText('影片C'))
    await waitFor(
      () => {
        expect(prefetchMock).toHaveBeenCalledWith('source1', '85265')
      },
      { timeout: 2000 },
    )
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(warmChainMock).not.toHaveBeenCalled()
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
