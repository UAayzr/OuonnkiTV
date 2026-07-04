import { Edit3, CheckSquare, Square, Trash2, X, XCircle } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
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
  AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog'
import { useIsMobile } from '@/shared/hooks/use-mobile'

export interface ManagementPanelProps {
  isOpen: boolean
  selectedCount: number
  totalCount: number
  isAllSelected: boolean
  onExit: () => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onClearAll: () => void
  onDeleteSelected: () => void
}

/**
 * ManagementPanel - 管理面板组件
 * 多选模式时显示在右下角，提供批量操作功能
 * 展开时宽度弹性扩展、元素从右侧交错进入；收缩时反向退出、笔图标从左侧滑入
 */
export function ManagementPanel({
  isOpen,
  selectedCount,
  totalCount,
  isAllSelected,
  onExit,
  onSelectAll,
  onDeselectAll,
  onClearAll,
  onDeleteSelected,
}: ManagementPanelProps) {
  const isMobile = useIsMobile()

  return (
    <div
      className="absolute z-50"
      style={
        isMobile
          ? {
              bottom: '1.25rem',
              right: '0.75rem',
              left: isOpen ? '0.75rem' : undefined,
            }
          : {
              bottom: '2rem',
              right: isOpen ? '50%' : '2rem',
              transform: isOpen ? 'translateX(50%)' : 'translateX(0)',
              maxWidth: isOpen ? 'calc(100% - 3rem)' : undefined,
              transition:
                'right 0.35s cubic-bezier(0.25, 0.1, 0.25, 1), transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)',
            }
      }
    >
      {isOpen ? (
          <div
            key="expanded-panel"
            className="bg-background/95 border-border flex h-12 animate-[management-panel-in_250ms_ease-out] items-center gap-1 overflow-hidden rounded-3xl border px-3 shadow-2xl backdrop-blur-md motion-reduce:animate-none"
          >
            {/* 全选/取消 */}
            <div className="animate-[management-item-in_220ms_40ms_ease-out_both] motion-reduce:animate-none">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-2.5 text-sm"
                onClick={isAllSelected ? onDeselectAll : onSelectAll}
              >
                {isAllSelected ? (
                  <>
                    <CheckSquare className="mr-1 size-4" />
                    取消
                  </>
                ) : (
                  <>
                    <Square className="mr-1 size-4" />
                    全选
                  </>
                )}
              </Button>
            </div>

            {/* 计数 */}
            <span
              className="text-muted-foreground animate-[management-item-in_220ms_80ms_ease-out_both] shrink-0 text-sm tabular-nums motion-reduce:animate-none"
            >
              {selectedCount}/{totalCount}
            </span>

            {/* 清空 */}
            <div className="animate-[management-item-in_220ms_120ms_ease-out_both] motion-reduce:animate-none">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive h-8 rounded-full px-2.5 text-sm"
                  >
                    <XCircle className="mr-1 size-4" />
                    清空
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                      <Trash2 />
                    </AlertDialogMedia>
                    <AlertDialogTitle>确认清空</AlertDialogTitle>
                    <AlertDialogDescription>
                      确定要清空当前分类下的所有收藏项吗？此操作无法撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel variant="outline">取消</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={onClearAll}>
                      确认清空
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* 分隔线 */}
            <div
              className="bg-border mx-1 h-4 w-px shrink-0 animate-[management-item-in_220ms_160ms_ease-out_both] motion-reduce:animate-none"
            />

            {/* 删除选中 */}
            <div className="animate-[management-item-in_220ms_200ms_ease-out_both] motion-reduce:animate-none">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 w-8 rounded-full p-0"
                    disabled={selectedCount === 0}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                      <Trash2 />
                    </AlertDialogMedia>
                    <AlertDialogTitle>确认删除</AlertDialogTitle>
                    <AlertDialogDescription>
                      确定要删除选中的 {selectedCount} 个收藏项吗？此操作无法撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel variant="outline">取消</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={onDeleteSelected}>
                      确认删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* 退出按钮 */}
            <div className="animate-[management-item-in_220ms_240ms_ease-out_both] motion-reduce:animate-none">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-full p-0"
                onClick={onExit}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div
            key="collapsed-button"
            className="animate-[management-collapsed-in_180ms_ease-out] motion-reduce:animate-none"
          >
            <Button
              size="lg"
              className="bg-background text-foreground border-border hover:bg-accent h-12 w-12 rounded-full border shadow-lg"
              onClick={onExit}
            >
              <Edit3 className="size-5" />
            </Button>
          </div>
        )}
    </div>
  )
}
