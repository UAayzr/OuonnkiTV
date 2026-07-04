import { lazy, Suspense, useEffect, useState } from 'react'
import { MediaPosterCard } from '@/shared/components/common'
import { AspectRatio } from '@/shared/components/ui/aspect-ratio'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { buildCmsPlayPath } from '@/shared/lib/routes'
import type { VideoItem } from '@ouonnki/cms-core'

const CmsMediaCarouselTrack = lazy(() =>
  import('./CmsMediaCarouselTrack').then(module => ({
    default: module.CmsMediaCarouselTrack,
  })),
)

interface CmsMediaCarouselProps {
  /** 板块标题 */
  title: string
  /** CMS 视频数据列表 */
  items: VideoItem[]
  /** 加载状态 */
  loading?: boolean
}

/**
 * CmsMediaCarouselSkeleton - 骨架屏组件
 */
const getVisibleCount = () => {
  if (typeof window === 'undefined') return 6
  if (window.matchMedia('(max-width: 767px)').matches) return 3
  if (window.matchMedia('(max-width: 1023px)').matches) return 4
  return 6
}

function useResponsiveVisibleCount() {
  const [visibleCount, setVisibleCount] = useState(getVisibleCount)

  useEffect(() => {
    const update = () => setVisibleCount(getVisibleCount())
    update()
    window.addEventListener('resize', update, { passive: true })
    return () => window.removeEventListener('resize', update)
  }, [])

  return visibleCount
}

function CmsMediaCarouselSkeleton({
  title,
  visibleCount,
}: {
  title: string
  visibleCount: number
}) {
  const skeletonCount = visibleCount

  return (
    <div>
      <div className="px-1">
        <h2 className="text-primary text-xl font-semibold">{title}</h2>
      </div>
      <div className="flex gap-4 pt-2">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div key={index} className="flex-1">
            <AspectRatio ratio={2 / 3}>
              <Skeleton className="size-full rounded-lg" />
            </AspectRatio>
            <Skeleton className="mt-2 h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  )
}

function StaticPosterGrid({ items, limit }: { items: VideoItem[]; limit?: number }) {
  const visibleItems = typeof limit === 'number' ? items.slice(0, limit) : items

  return (
    <div className="grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-6">
      {visibleItems.map(item => (
        <MediaPosterCard
          key={`${item.source_code}-${item.vod_id}`}
          to={buildCmsPlayPath(item.source_code || '', String(item.vod_id))}
          posterUrl={item.vod_pic}
          title={item.vod_name}
          year={item.vod_year}
          topRightLabel={item.vod_remarks || undefined}
        />
      ))}
    </div>
  )
}

/**
 * CmsMediaCarousel - CMS 视频卡片轮播组件
 * 展示 CMS 视频源的视频列表，使用竖向海报卡片
 */
export function CmsMediaCarousel({ title, items, loading = false }: CmsMediaCarouselProps) {
  const visibleCount = useResponsiveVisibleCount()
  const slidesToScroll = visibleCount
  const canDrag = items.length > visibleCount

  if (loading) {
    return <CmsMediaCarouselSkeleton title={title} visibleCount={visibleCount} />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className="group/carousel">
      <div className="px-1">
        <h2 className="text-primary text-xl font-semibold">{title}</h2>
      </div>
      <div className="pt-2">
        {canDrag ? (
          <Suspense fallback={<StaticPosterGrid items={items} limit={visibleCount} />}>
            <CmsMediaCarouselTrack items={items} slidesToScroll={slidesToScroll} />
          </Suspense>
        ) : (
          <StaticPosterGrid items={items} />
        )}
      </div>
    </div>
  )
}
