import { useApiStore } from '@/shared/store/apiStore'
import { useCmsVideoList } from '@/shared/hooks/useCmsCore'
import type { VideoSource } from '@ouonnki/cms-core'
import { ContinueWatching } from './ContinueWatching'
import { CmsMediaCarousel } from './CmsMediaCarousel'
import { NavLink } from 'react-router'
import { Settings, Plus } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getCachedHomeRecommendations,
  setCachedHomeRecommendations,
} from '../lib/recommendationCache'

const HOME_SOURCE_LIMIT = 6
const EAGER_HOME_SOURCE_COUNT = 2

function SourceEmptyState({ title }: { title: string }) {
  return (
    <div>
      <div className="px-1">
        <h2 className="text-primary text-xl font-semibold">{title}</h2>
      </div>
      <div className="border-border/60 bg-muted/20 text-muted-foreground mt-2 rounded-lg border border-dashed px-4 py-6 text-center text-sm">
        暂无推荐内容
      </div>
    </div>
  )
}

/**
 * 单个视频源推荐列表
 * 独立组件以隔离每个源的 hook 调用
 */
function SourceCarousel({ source, eager = false }: { source: VideoSource; eager?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [cachedItems, setCachedItems] = useState(() => getCachedHomeRecommendations(source))
  const [shouldLoad, setShouldLoad] = useState(eager)
  const [hasRequested, setHasRequested] = useState(false)
  const sourceWithoutRetry = useMemo(() => ({ ...source, retry: 0 }), [source])

  useEffect(() => {
    setCachedItems(getCachedHomeRecommendations(source))
    setHasRequested(false)
  }, [source])

  useEffect(() => {
    if (shouldLoad || eager) {
      setShouldLoad(true)
      return
    }

    const element = containerRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return
        setShouldLoad(true)
        observer.disconnect()
      },
      {
        rootMargin: '480px 0px',
        threshold: 0.01,
      },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [eager, shouldLoad])

  const shouldFetch = shouldLoad && !cachedItems
  const { items, loading, error } = useCmsVideoList(shouldFetch ? sourceWithoutRetry : null)

  useEffect(() => {
    if (shouldFetch) {
      setHasRequested(true)
    }
  }, [shouldFetch])

  useEffect(() => {
    if (!shouldFetch || !hasRequested || loading || error || items.length === 0) return
    setCachedHomeRecommendations(source, items)
    setCachedItems(items)
  }, [error, hasRequested, items, loading, shouldFetch, source])

  const displayItems = cachedItems ?? items
  const showEmpty = shouldLoad && hasRequested && !loading && !error && displayItems.length === 0

  return (
    <div ref={containerRef}>
      {showEmpty ? (
        <SourceEmptyState title={source.name} />
      ) : (
        <CmsMediaCarousel
          title={source.name}
          items={displayItems}
          loading={shouldLoad ? loading && !cachedItems : true}
        />
      )}
    </div>
  )
}

/**
 * 无视频源时的空状态
 */
function EmptySourceState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <div className="bg-muted flex size-16 items-center justify-center rounded-full">
        <Settings className="text-muted-foreground size-8" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold">暂无视频源</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          添加视频源后即可浏览推荐内容
        </p>
      </div>
      <Button asChild variant="outline">
        <NavLink to="/settings/source">
          <Plus className="size-4" />
          添加视频源
        </NavLink>
      </Button>
    </div>
  )
}

/**
 * CmsHomeContent - CMS 首页内容
 */
export function CmsHomeContent() {
  const allVideoAPIs = useApiStore(state => state.videoAPIs)
  const videoAPIs = useMemo(
    () => allVideoAPIs.filter(source => source.isEnabled).slice(0, HOME_SOURCE_LIMIT),
    [allVideoAPIs],
  )

  return (
    <div className="flex flex-col gap-6">
      {/* 继续观看 */}
      <ContinueWatching />
      {/* 各视频源推荐列表 */}
      {videoAPIs.length > 0 ? (
        videoAPIs.map((source, index) => (
          <SourceCarousel key={source.id} source={source} eager={index < EAGER_HOME_SOURCE_COUNT} />
        ))
      ) : (
        <EmptySourceState />
      )}
    </div>
  )
}
