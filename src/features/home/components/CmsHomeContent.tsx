import { useApiStore } from '@/shared/store/apiStore'
import { useCmsVideoList } from '@/shared/hooks/useCmsCore'
import type { VideoSource } from '@ouonnki/cms-core'
import { ContinueWatching } from './ContinueWatching'
import { CmsMediaCarousel } from './CmsMediaCarousel'
import { NavLink } from 'react-router'
import { Settings, Plus } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { useEffect, useMemo, useRef, useState } from 'react'

const HOME_SOURCE_LIMIT = 6
const EAGER_HOME_SOURCE_COUNT = 2

/**
 * 单个视频源推荐列表
 * 独立组件以隔离每个源的 hook 调用
 */
function SourceCarousel({ source, eager = false }: { source: VideoSource; eager?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [shouldLoad, setShouldLoad] = useState(eager)
  const sourceWithoutRetry = useMemo(() => ({ ...source, retry: 0 }), [source])

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

  const { items, loading } = useCmsVideoList(shouldLoad ? sourceWithoutRetry : null)

  return (
    <div ref={containerRef} className="min-h-[120px]">
      <CmsMediaCarousel
        title={source.name}
        items={items}
        loading={shouldLoad ? loading : true}
      />
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
