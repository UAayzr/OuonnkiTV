import type { VideoItem } from '@ouonnki/cms-core'
import { MediaPosterCard } from '@/shared/components/common/MediaPosterCard'
import { NoResultIcon } from '@/shared/components/icons'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'
import { AspectRatio } from '@/shared/components/ui/aspect-ratio'
import { useWindowedGrid } from '@/shared/hooks/useWindowedGrid'
import { getSourceColorScheme } from '@/shared/lib/source-colors'
import { SourceStatusBadge } from './SourceStatusBadge'
import { buildCmsPlayPath } from '@/shared/lib/routes'

interface SearchResultsGridProps {
  /** 直连搜索结果 */
  directResults?: VideoItem[]
  /** 是否加载中 */
  loading: boolean
  /** 直连搜索进度（已完成的源数量/总源数量） */
  searchProgress?: { completed: number; total: number }
  /** 成功返回结果的源 ID 集合 */
  successfulSources?: Set<string>
  /** 聚合分页返回的结果总数 */
  totalResults?: number
  /** 是否还有更多内容 */
  hasMore?: boolean
  /** 当前页是否已完成（仅 Direct 模式） */
  isCurrentPageComplete?: boolean
  /** 哨兵元素引用（用于滚动加载） */
  sentinelRef?: React.RefObject<HTMLDivElement | null>
  className?: string
}

// 骨架屏数量
const SKELETON_COUNT = 20
const MIN_VIRTUALIZED_ITEMS = 60
const VIRTUAL_OVERSCAN_ROWS = 3
const CARD_TITLE_HEIGHT = 32
const GRID_ROW_GAP = 12
const GRID_BREAKPOINTS = [
  { minWidth: 1536, columns: 8 },
  { minWidth: 1280, columns: 7 },
  { minWidth: 1024, columns: 6 },
  { minWidth: 768, columns: 5 },
  { minWidth: 640, columns: 4 },
  { minWidth: 0, columns: 2 },
]

const estimatePosterRowHeight = (cardWidth: number) =>
  cardWidth * 1.5 + CARD_TITLE_HEIGHT + GRID_ROW_GAP

/**
 * ResultSkeleton - 结果骨架屏
 */
function ResultSkeleton() {
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg">
        <AspectRatio ratio={2 / 3}>
          <Skeleton className="h-full w-full" />
        </AspectRatio>
      </div>
      <Skeleton className="h-4 w-3/4" />
    </div>
  )
}

/**
 * EmptyState - 空状态组件
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <NoResultIcon size={128} className="text-muted-foreground/30" />
      <p className="text-muted-foreground mt-4 text-sm">换个关键词试试吧</p>
    </div>
  )
}

/**
 * SearchResultsGrid - 搜索结果网格组件
 */
export function SearchResultsGrid({
  directResults = [],
  loading,
  searchProgress,
  successfulSources,
  totalResults,
  hasMore = false,
  isCurrentPageComplete = true,
  sentinelRef,
  className,
}: SearchResultsGridProps) {
  const results = directResults
  const hasResults = results.length > 0
  const virtualGrid = useWindowedGrid({
    items: results,
    minItems: MIN_VIRTUALIZED_ITEMS,
    breakpoints: GRID_BREAKPOINTS,
    estimateItemHeight: estimatePosterRowHeight,
    gap: GRID_ROW_GAP,
    overscanRows: VIRTUAL_OVERSCAN_ROWS,
  })

  return (
    <div className={cn('space-y-6', className)}>
      {/* 结果统计 + 源状态 */}
      <div className="flex items-center justify-between gap-4">
        {/* 左侧：结果统计 */}
        {hasResults && (
          <div className="text-muted-foreground text-sm">
            共找到 <span className="text-primary font-medium">{totalResults || results.length}</span> 个结果
          </div>
        )}
        {/* 右侧：源状态徽章 */}
        {searchProgress && (
          <SourceStatusBadge
            completed={searchProgress.completed}
            total={searchProgress.total}
            successfulSources={successfulSources}
            resultsCount={results.length}
            loading={loading}
          />
        )}
      </div>

      {/* 内容区域 */}
      <div>
        {loading && !hasResults ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
            {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <ResultSkeleton key={index} />
            ))}
          </div>
        ) : hasResults ? (
          <div ref={virtualGrid.containerRef}>
            {virtualGrid.topPadding > 0 && <div style={{ height: virtualGrid.topPadding }} />}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
              {virtualGrid.visibleItems.map(({ item, index }) => {
              if (!item.source_code || !item.vod_id) {
                return null
              }

              // 根据源代码生成配色方案
              const colorScheme = item.source_code
                ? getSourceColorScheme(item.source_code)
                : undefined

              return (
                <div key={`${item.source_code}-${item.vod_id}-${index}`}>
                  <MediaPosterCard
                    to={buildCmsPlayPath(item.source_code, item.vod_id)}
                    posterUrl={item.vod_pic || null}
                    title={item.vod_name}
                    year={item.vod_year}
                    topRightLabel={item.source_name}
                    topRightLabelColorScheme={colorScheme}
                    rating={
                      item.vod_douban_score !== undefined
                        ? typeof item.vod_douban_score === 'number'
                          ? item.vod_douban_score
                          : parseFloat(item.vod_douban_score)
                        : undefined
                    }
                  />
                </div>
              )
            })}
            </div>
            {virtualGrid.bottomPadding > 0 && (
              <div style={{ height: virtualGrid.bottomPadding }} />
            )}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* 加载更多状态 */}
      {hasResults && (
        <div ref={sentinelRef} className="py-8 flex justify-center">
          {!hasMore ? (
            <div className="text-muted-foreground text-sm">
              已加载全部内容
            </div>
          ) : loading && isCurrentPageComplete ? (
            <div className="text-muted-foreground text-sm flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
              加载下一页...
            </div>
          ) : !isCurrentPageComplete ? (
            <div className="text-muted-foreground text-sm flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
              等待更多源返回结果...
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">
              下滑加载更多
            </div>
          )}
        </div>
      )}
    </div>
  )
}
