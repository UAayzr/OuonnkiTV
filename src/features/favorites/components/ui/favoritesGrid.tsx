import { useState, useCallback } from 'react'
import { Checkbox } from '@/shared/components/ui/checkbox'
import { MediaPosterCard } from '@/shared/components/common/MediaPosterCard'
import { Skeleton } from '@/shared/components/ui/skeleton'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/shared/components/ui/context-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog'
import { Eye, EyeOff, CheckCircle, Trash2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { FavoriteWatchStatus } from '../../types/favorites'
import type { FavoriteItem } from '../../types/favorites'
import { getSourceColorScheme } from '@/shared/lib/source-colors'
import { buildCmsPlayPath } from '@/shared/lib/routes'
import { toast } from 'sonner'
import { useWindowedGrid } from '@/shared/hooks/useWindowedGrid'

const FAVORITES_GRID_BREAKPOINTS = [
  { minWidth: 1536, columns: 8 },
  { minWidth: 1280, columns: 7 },
  { minWidth: 1024, columns: 6 },
  { minWidth: 768, columns: 5 },
  { minWidth: 640, columns: 4 },
  { minWidth: 0, columns: 2 },
]

const FAVORITES_GRID_GAP = 12
const FAVORITES_TITLE_HEIGHT = 32
const estimateFavoriteRowHeight = (cardWidth: number) =>
  cardWidth * 1.5 + FAVORITES_TITLE_HEIGHT + FAVORITES_GRID_GAP

/** 观看状态配置 */
const watchStatusOptions = [
  { value: FavoriteWatchStatus.NOT_WATCHED, label: '未观看', icon: EyeOff },
  { value: FavoriteWatchStatus.WATCHING, label: '正在看', icon: Eye },
  { value: FavoriteWatchStatus.COMPLETED, label: '已看完', icon: CheckCircle },
] as const

interface FavoritesGridProps {
  /** 收藏列表 */
  favorites: FavoriteItem[]
  /** 已选中的 ID 集合 */
  selectedIds: Set<string>
  /** 选择状态变化回调 */
  onSelectionChange: (selected: Set<string>) => void
  /** 更改观看状态回调 */
  onUpdateWatchStatus?: (id: string, status: FavoriteWatchStatus) => void
  /** 删除单个收藏回调 */
  onRemoveFavorite?: (id: string) => void
  /** 是否处于多选模式 */
  selectionMode: boolean
  /** 是否加载中 */
  loading?: boolean
}

/**
 * 将 FavoriteItem 转换为 MediaPosterCard props
 */
function favoriteToPosterCard(item: FavoriteItem) {
  const { media } = item
  return {
    to: buildCmsPlayPath(media.sourceCode, media.vodId),
    posterUrl: media.vodPic || null,
    title: media.vodName,
    year: media.vodYear,
    topRightLabel: media.sourceName,
    topRightLabelColorScheme: getSourceColorScheme(media.sourceCode),
  }
}

/**
 * FavoritesGrid - 收藏网格组件
 * 复用 SearchResultsGrid 的响应式网格布局
 */
export function FavoritesGrid({
  favorites,
  selectedIds,
  onSelectionChange,
  onUpdateWatchStatus,
  onRemoveFavorite,
  selectionMode,
  loading = false,
}: FavoritesGridProps) {
  // 待确认删除的收藏项 ID
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const windowedGrid = useWindowedGrid({
    items: favorites,
    minItems: 60,
    breakpoints: FAVORITES_GRID_BREAKPOINTS,
    estimateItemHeight: estimateFavoriteRowHeight,
    gap: FAVORITES_GRID_GAP,
    overscanRows: 3,
  })

  // 处理单个项的选中状态切换
  const toggleItemSelection = useCallback(
    (item: FavoriteItem) => {
      const next = new Set(selectedIds)
      if (selectedIds.has(item.id)) {
        next.delete(item.id)
      } else {
        next.add(item.id)
      }
      onSelectionChange(next)
    },
    [selectedIds, onSelectionChange],
  )

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
        {Array.from({ length: 20 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-lg">
            <div className="aspect-[2/3] w-full">
              <Skeleton className="h-full w-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <div ref={windowedGrid.containerRef}>
        {windowedGrid.topPadding > 0 && <div style={{ height: windowedGrid.topPadding }} />}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
        {windowedGrid.visibleItems.map(({ item }) => {
          const cardProps = favoriteToPosterCard(item)
          const isSelected = selectedIds.has(item.id)

          return (
            <ContextMenu key={item.id}>
              <ContextMenuTrigger asChild>
                <div className="relative">
                  {/* 多选模式的复选框 */}
                  {selectionMode && (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={checked => {
                        const next = new Set(selectedIds)
                        if (checked) {
                          next.add(item.id)
                        } else {
                          next.delete(item.id)
                        }
                        onSelectionChange(next)
                      }}
                      onClick={e => {
                        e.stopPropagation()
                      }}
                      className="pointer-events-auto absolute top-2 left-2 z-10 size-8 rounded-md shadow-sm md:size-7"
                    />
                  )}

                  {/* 海报卡片容器 */}
                  <div
                    className={cn(
                      'cursor-pointer',
                      selectionMode && '[&_a]:pointer-events-none',
                    )}
                  >
                    <div onClick={selectionMode ? () => toggleItemSelection(item) : undefined}>
                      <MediaPosterCard {...cardProps} />
                    </div>
                  </div>

                  {/* 选中状态的边框高亮 */}
                  {isSelected && (
                    <div className="ring-primary ring-offset-background pointer-events-none absolute left-0 right-0 top-0 overflow-hidden rounded-lg ring-2 ring-offset-2" style={{ aspectRatio: '2/3' }} />
                  )}
                </div>
              </ContextMenuTrigger>

              <ContextMenuContent>
                {/* 更改观看状态子菜单 */}
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <Eye className="mr-2 size-4" />
                    观看状态
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    {watchStatusOptions.map(option => {
                      const Icon = option.icon
                      return (
                        <ContextMenuItem
                          key={option.value}
                          disabled={item.watchStatus === option.value}
                          onClick={() => {
                            onUpdateWatchStatus?.(item.id, option.value)
                            toast.success(`已标记为「${option.label}」`)
                          }}
                        >
                          <Icon className="mr-2 size-4" />
                          {option.label}
                          {item.watchStatus === option.value && (
                            <span className="text-muted-foreground ml-auto text-xs">当前</span>
                          )}
                        </ContextMenuItem>
                      )
                    })}
                  </ContextMenuSubContent>
                </ContextMenuSub>

                <ContextMenuSeparator />

                {/* 删除收藏 — 触发确认弹窗 */}
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => setDeleteConfirmId(item.id)}
                >
                  <Trash2 className="mr-2 size-4" />
                  删除收藏
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
        </div>
        {windowedGrid.bottomPadding > 0 && <div style={{ height: windowedGrid.bottomPadding }} />}
      </div>

      {/* 单项删除确认弹窗 */}
      <AlertDialog
        open={deleteConfirmId !== null}
        onOpenChange={open => {
          if (!open) setDeleteConfirmId(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除该收藏项吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteConfirmId) {
                  onRemoveFavorite?.(deleteConfirmId)
                  setDeleteConfirmId(null)
                  toast.success('已删除收藏')
                }
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
