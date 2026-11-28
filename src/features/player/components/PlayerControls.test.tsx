import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Artplayer from 'artplayer'
import { PlayerControls } from './PlayerControls'

const mocks = vi.hoisted(() => ({
  isMobile: false,
  /** 主指针是否为粗指针（手机/平板） */
  coarse: false,
  state: {} as Record<string, unknown>,
}))

vi.mock('@/features/player/hooks/usePlayerState', () => ({
  usePlayerState: () => mocks.state,
}))

vi.mock('@/features/player/lib/playerUtils', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/player/lib/playerUtils')>()
  return { ...actual, isTouchDevice: () => mocks.isMobile }
})

// 进度条依赖 canvas 抓帧，与本次断言无关，替换成占位节点
vi.mock('@/features/player/components/SeekBar', () => ({
  SeekBar: () => <div data-testid="seek-bar" />,
}))

const flushAsync = () => new Promise(resolve => setTimeout(resolve, 0))

function createArt() {
  return {
    video: { loop: false, volume: 1, muted: false, paused: false, currentTime: 0, duration: 0 },
    seek: 0,
    playbackRate: 1,
    flip: 'normal',
    aspectRatio: 'default',
    currentTime: 0,
    duration: 0,
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
    fullscreen: false,
    fullscreenWeb: false,
  } as unknown as Artplayer
}

const baseState = (overrides: Record<string, unknown> = {}) => ({
  currentTime: 0,
  duration: 100,
  bufferedRanges: [],
  playing: true,
  volume: 1,
  muted: false,
  playbackRate: 1,
  fullscreen: false,
  fullscreenWeb: false,
  mini: false,
  pip: false,
  isLive: false,
  ready: true,
  error: false,
  ...overrides,
})

function renderControls(settingOpen = false) {
  const art = createArt()
  const onSettingOpenChange = vi.fn()
  const props = {
    art,
    visible: true,
    hasNextEpisode: false,
    onNextEpisode: vi.fn(),
    isPipEnabled: false,
    isLoopEnabled: false,
    onSettingOpenChange,
  }
  const { rerender } = render(<PlayerControls {...props} settingOpen={settingOpen} />)
  return {
    art,
    onSettingOpenChange,
    setSettingOpen: (open: boolean) => rerender(<PlayerControls {...props} settingOpen={open} />),
  }
}

beforeEach(() => {
  mocks.isMobile = false
  mocks.coarse = false
  mocks.state = baseState()
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('pointer: coarse') ? mocks.coarse : false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
})

describe('PlayerControls 设置入口', () => {
  it('桌面端始终提供设置入口', () => {
    renderControls()
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()
  })

  it('触屏笔记本（粗指针不成立）不会丢设置入口', () => {
    // maxTouchPoints > 0 但主指针是鼠标：设置面板仍有足够空间，必须保留
    mocks.isMobile = true
    renderControls()
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()
  })

  it('手机小窗（未全屏）不显示设置入口，并回收已打开的面板', async () => {
    mocks.isMobile = true
    mocks.coarse = true
    const { onSettingOpenChange } = renderControls(true)
    await flushAsync()

    expect(screen.queryByRole('button', { name: '设置' })).not.toBeInTheDocument()
    // 面板不再渲染，避免被播放器容器裁切
    expect(screen.queryByText('倍速')).not.toBeInTheDocument()
    expect(onSettingOpenChange).toHaveBeenCalledWith(false)
  })

  it('手机全屏后恢复设置入口并可展开面板', async () => {
    mocks.isMobile = true
    mocks.coarse = true
    mocks.state = baseState({ fullscreen: true })
    const { onSettingOpenChange, setSettingOpen } = renderControls(false)

    screen.getByRole('button', { name: '设置' }).click()
    expect(onSettingOpenChange).toHaveBeenCalledWith(true)

    setSettingOpen(true)
    await flushAsync()
    expect(screen.getByText('倍速')).toBeInTheDocument()
  })

  it('手机退出全屏时收起已打开的面板', async () => {
    mocks.isMobile = true
    mocks.coarse = true
    mocks.state = baseState({ fullscreen: true })
    const { onSettingOpenChange, setSettingOpen } = renderControls(true)
    await flushAsync()
    expect(screen.getByText('倍速')).toBeInTheDocument()

    onSettingOpenChange.mockClear()
    mocks.state = baseState({ fullscreen: false })
    setSettingOpen(true)
    await flushAsync()

    // 粗指针判定不变，但 fullscreen 状态变化后应立刻回收面板
    expect(screen.queryByText('倍速')).not.toBeInTheDocument()
    expect(onSettingOpenChange).toHaveBeenCalledWith(false)
  })
})
