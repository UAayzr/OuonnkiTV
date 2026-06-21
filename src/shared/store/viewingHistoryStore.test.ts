import { beforeEach, describe, expect, it } from 'vitest'
import type { ViewingHistoryItem } from '@/shared/types'
import { useViewingHistoryStore } from './viewingHistoryStore'

function createHistoryItem(
  overrides: Partial<ViewingHistoryItem> = {},
  episodeIndex = 0,
): ViewingHistoryItem {
  return {
    recordType: 'cms',
    title: '测试视频',
    imageUrl: 'https://example.com/poster.jpg',
    episodeIndex,
    episodeName: `第${episodeIndex + 1}集`,
    sourceCode: 'test-source',
    sourceName: '测试源',
    vodId: 'vod-1',
    timestamp: Date.now(),
    playbackPosition: 120,
    duration: 240,
    ...overrides,
  }
}

describe('viewingHistoryStore', () => {
  beforeEach(() => {
    localStorage.removeItem('ouonnki-tv-viewing-history')
    useViewingHistoryStore.setState({ viewingHistory: [] })
  })

  it('removeViewingHistory 会删除同一视频的全部分集记录', () => {
    const target = createHistoryItem({}, 0)
    const secondEpisode = createHistoryItem({}, 1)
    const otherVideo = createHistoryItem({ vodId: 'vod-2' }, 0)

    useViewingHistoryStore.setState({
      viewingHistory: [target, secondEpisode, otherVideo],
    })

    useViewingHistoryStore.getState().removeViewingHistory(target)

    const remaining = useViewingHistoryStore.getState().viewingHistory
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.vodId).toBe('vod-2')
  })

  it('removeViewingHistoryItem 仅删除指定分集记录', () => {
    const target = createHistoryItem({}, 0)
    const secondEpisode = createHistoryItem({}, 1)
    const otherVideo = createHistoryItem({ vodId: 'vod-2' }, 0)

    useViewingHistoryStore.setState({
      viewingHistory: [target, secondEpisode, otherVideo],
    })

    useViewingHistoryStore.getState().removeViewingHistoryItem(target)

    const remaining = useViewingHistoryStore.getState().viewingHistory
    expect(remaining).toHaveLength(2)
    expect(remaining.some(item => item.vodId === 'vod-1' && item.episodeIndex === 1)).toBe(true)
    expect(remaining.some(item => item.vodId === 'vod-2')).toBe(true)
  })

  it('迁移旧数据时会补齐 recordType=cms', async () => {
    const migrate = useViewingHistoryStore.persist.getOptions().migrate
    const legacyState = {
      viewingHistory: [
        {
          title: '旧记录',
          imageUrl: '',
          episodeIndex: 0,
          sourceCode: 'legacy-source',
          sourceName: '旧源',
          vodId: 'legacy-vod',
          timestamp: 1,
          playbackPosition: 1,
          duration: 10,
        },
      ],
    }

    const migratedState = (await Promise.resolve(migrate?.(legacyState, 2.1))) as {
      viewingHistory: ViewingHistoryItem[]
    }

    expect(migratedState.viewingHistory[0]?.recordType).toBe('cms')
  })

  it('迁移旧数据时会过滤非 CMS 记录', async () => {
    const migrate = useViewingHistoryStore.persist.getOptions().migrate
    const legacyState = {
      viewingHistory: [
        createHistoryItem({ vodId: 'cms-vod' }),
        {
          ...createHistoryItem({ vodId: 'legacy-vod' }),
          recordType: 'legacy',
        },
      ],
    }

    const migratedState = (await Promise.resolve(migrate?.(legacyState, 3))) as {
      viewingHistory: ViewingHistoryItem[]
    }

    expect(migratedState.viewingHistory).toHaveLength(1)
    expect(migratedState.viewingHistory[0]?.vodId).toBe('cms-vod')
  })
})
