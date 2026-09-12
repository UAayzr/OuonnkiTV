import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MockDetailState {
  detail: { success?: boolean; episodes: string[]; videoInfo?: { title?: string } } | null
  loading: boolean
  error: string | null
  isDetailRefreshing: boolean
}

interface MockFavoriteState {
  toggleCmsFavorite: (item: unknown) => void
  isCmsFavorited: (vodId: string, sourceCode: string) => boolean
  favorites: unknown[]
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  params: { sourceCode: 'source', vodId: 'vod' },
  detailState: { detail: null, loading: true, error: null, isDetailRefreshing: false } as MockDetailState,
}))

vi.mock('react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useParams: () => mocks.params,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  }
})
vi.mock('artplayer', () => ({ default: class ArtplayerMock {} }))
vi.mock('@/shared/hooks', () => ({
  useDocumentTitle: vi.fn(),
  useCmsClient: () => ({}),
  useIdleReady: () => false,
}))
vi.mock('@/shared/store/apiStore', () => ({
  useApiStore: () => ({
    videoAPIs: [{ id: 'source', name: '测试源', url: 'https://example.com', isEnabled: true }],
    adFilteringEnabled: true,
  }),
}))
vi.mock('@/shared/store/settingStore', () => ({
  useSettingStore: () => ({
    playback: {
      defaultEpisodeOrder: 'asc',
      isViewingHistoryVisible: true,
      isMobileGestureEnabled: false,
      longPressPlaybackRate: 2,
    },
  }),
}))
vi.mock('@/shared/store/viewingHistoryStore', () => ({
  useViewingHistoryStore: () => ({ addViewingHistory: vi.fn(), viewingHistory: [] }),
}))
vi.mock('@/features/favorites/store/favoritesStore', () => ({
  useFavoritesStore: (selector: (state: MockFavoriteState) => unknown) =>
    selector({ toggleCmsFavorite: vi.fn(), isCmsFavorited: vi.fn(() => false), favorites: [] }),
}))
vi.mock('@/features/player/components', () => ({
  PlayerLoadingSkeleton: () => <div>播放器加载中</div>,
  PlayerErrorState: ({ title, description }: { title: string; description: string }) => (
    <div><h1>{title}</h1><p>{description}</p></div>
  ),
  PlayerEpisodePanel: () => <div>选集面板</div>,
  PlayerInfoAndRecommendations: () => <div>视频信息</div>,
}))
vi.mock('@/features/player/hooks', () => ({
  usePlayerDetail: () => mocks.detailState,
  useEpisodePagination: () => ({
    isReversed: false,
    setIsReversed: vi.fn(),
    pageRanges: [],
    currentPageRange: '',
    setCurrentPageRange: vi.fn(),
    currentPageEpisodes: [],
  }),
  usePlayerGestureOverlays: () => ({
    gestureVolumeLevel: null,
    gestureBrightnessLevel: null,
    gestureSeekPreviewTime: null,
  }),
  usePlayerNotices: () => ({ transientNotices: [], showPlayerNotice: vi.fn() }),
  usePlayerControlsVisibility: () => ({
    visible: true,
    showControls: vi.fn(),
    toggleControls: vi.fn(),
    setInteracting: vi.fn(),
  }),
}))

import UnifiedPlayer from './UnifiedPlayer'

beforeEach(() => {
  mocks.params = { sourceCode: 'source', vodId: 'vod' }
  mocks.detailState = { detail: null, loading: true, error: null, isDetailRefreshing: false }
})

describe('播放器页面', () => {
  it('加载详情时显示加载状态', () => {
    render(<UnifiedPlayer />)
    expect(screen.getByText('播放器加载中')).toBeInTheDocument()
  })

  it('错误时显示清楚的错误页面', () => {
    mocks.detailState = { detail: null, loading: false, error: '未找到对应视频源配置', isDetailRefreshing: false }
    render(<UnifiedPlayer />)
    expect(screen.getByText('视频暂时无法播放')).toBeInTheDocument()
    expect(screen.getByText('未找到对应视频源配置')).toBeInTheDocument()
  })

  it('没有播放地址时显示无法获取播放信息', () => {
    mocks.detailState = {
      detail: { success: true, episodes: [], videoInfo: { title: '影片' } },
      loading: false,
      error: null,
      isDetailRefreshing: false,
    }
    render(<UnifiedPlayer />)
    expect(screen.getByText('无法获取播放信息')).toBeInTheDocument()
  })
})
