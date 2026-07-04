import { History, Trash2 } from 'lucide-react'
import { ViewingHistoryCard } from '@/shared/components/common'
import { Badge } from '@/shared/components/ui/badge'
import { useWindowedGrid } from '@/shared/hooks/useWindowedGrid'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/shared/components/ui/context-menu'
import type { ViewingHistoryItem } from '@/shared/types'
import {
  getHistoryItemKey,
  HISTORY_SECTION_BADGE_CLASS_MAP,
  HISTORY_SECTION_LABEL_MAP,
  HISTORY_SECTION_ORDER,
  type HistorySectionKey,
} from '../utils/history'

const HISTORY_GRID_BREAKPOINTS = [
  { minWidth: 1536, columns: 5 },
  { minWidth: 1280, columns: 4 },
  { minWidth: 1024, columns: 3 },
  { minWidth: 640, columns: 2 },
  { minWidth: 0, columns: 1 },
]

const HISTORY_GRID_GAP = 12
const estimateHistoryRowHeight = (cardWidth: number) =>
  cardWidth < 320 ? 112 : cardWidth * 0.5625 + HISTORY_GRID_GAP

function HistorySection({
  sectionKey,
  sectionItems,
  selectedKeys,
  selectionMode,
  onToggleItemSelected,
  onEnableSelectionMode,
  onRequestDeleteItem,
}: {
  sectionKey: HistorySectionKey
  sectionItems: ViewingHistoryItem[]
  selectedKeys: Set<string>
  selectionMode: boolean
  onToggleItemSelected: (item: ViewingHistoryItem) => void
  onEnableSelectionMode: () => void
  onRequestDeleteItem: (item: ViewingHistoryItem) => void
}) {
  const windowedGrid = useWindowedGrid({
    items: sectionItems,
    minItems: 50,
    breakpoints: HISTORY_GRID_BREAKPOINTS,
    estimateItemHeight: estimateHistoryRowHeight,
    gap: HISTORY_GRID_GAP,
    overscanRows: 4,
  })

  return (
    <section className="relative pl-0 sm:pl-6">
      <div className="bg-primary absolute top-1.5 left-[5px] hidden size-[6px] rounded-full sm:block" />

      <div className="mb-4">
        <div className="flex items-end justify-between sm:hidden">
          <span className="text-muted-foreground text-base font-semibold">
            {HISTORY_SECTION_LABEL_MAP[sectionKey]}
          </span>
          <span className="text-muted-foreground text-xs">{sectionItems.length} 项</span>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <Badge variant="secondary" className={HISTORY_SECTION_BADGE_CLASS_MAP[sectionKey]}>
            {HISTORY_SECTION_LABEL_MAP[sectionKey]}
          </Badge>
          <span className="text-muted-foreground text-sm">{sectionItems.length} 项</span>
        </div>
      </div>

      <div ref={windowedGrid.containerRef}>
        {windowedGrid.topPadding > 0 && <div style={{ height: windowedGrid.topPadding }} />}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {windowedGrid.visibleItems.map(({ item }) => {
            const itemKey = getHistoryItemKey(item)
            const selected = selectedKeys.has(itemKey)

            return (
              <ContextMenu key={itemKey}>
                <ContextMenuTrigger asChild>
                  <div>
                    <ViewingHistoryCard
                      item={item}
                      mobileListLayout
                      selectionMode={selectionMode}
                      selected={selected}
                      onToggleSelect={onToggleItemSelected}
                    />
                  </div>
                </ContextMenuTrigger>

                <ContextMenuContent>
                  <ContextMenuItem
                    onClick={() => {
                      if (!selectionMode) {
                        onEnableSelectionMode()
                      }
                      onToggleItemSelected(item)
                    }}
                  >
                    {selected ? '取消选中' : '选中此项'}
                  </ContextMenuItem>

                  <ContextMenuSeparator />

                  <ContextMenuItem variant="destructive" onClick={() => onRequestDeleteItem(item)}>
                    <Trash2 className="mr-2 size-4" />
                    删除记录
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )
          })}
        </div>
        {windowedGrid.bottomPadding > 0 && <div style={{ height: windowedGrid.bottomPadding }} />}
      </div>
    </section>
  )
}

interface HistoryTimelineProps {
  hasHistory: boolean
  sectionedHistory: Record<HistorySectionKey, ViewingHistoryItem[]>
  selectedKeys: Set<string>
  selectionMode: boolean
  onToggleItemSelected: (item: ViewingHistoryItem) => void
  onEnableSelectionMode: () => void
  onRequestDeleteItem: (item: ViewingHistoryItem) => void
}

export function HistoryTimeline({
  hasHistory,
  sectionedHistory,
  selectedKeys,
  selectionMode,
  onToggleItemSelected,
  onEnableSelectionMode,
  onRequestDeleteItem,
}: HistoryTimelineProps) {
  return (
    <main className="relative px-3 py-6 sm:px-4">
      {hasHistory && (
        <div className="bg-border pointer-events-none absolute top-6 bottom-0 left-6 hidden w-px sm:block" />
      )}

      {!hasHistory ? (
        <div className="flex flex-col items-center justify-center py-28">
          <History className="text-muted-foreground/30 size-24" />
          <p className="text-muted-foreground mt-4 text-sm">暂无观看历史</p>
        </div>
      ) : (
        <div className="relative space-y-8 pb-6">
          {HISTORY_SECTION_ORDER.map(sectionKey => {
            const sectionItems = sectionedHistory[sectionKey]
            if (sectionItems.length === 0) return null

            return (
              <HistorySection
                key={sectionKey}
                sectionKey={sectionKey}
                sectionItems={sectionItems}
                selectedKeys={selectedKeys}
                selectionMode={selectionMode}
                onToggleItemSelected={onToggleItemSelected}
                onEnableSelectionMode={onEnableSelectionMode}
                onRequestDeleteItem={onRequestDeleteItem}
              />
            )
          })}
        </div>
      )}
    </main>
  )
}
