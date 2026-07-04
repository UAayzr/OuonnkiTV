import { useEffect, useMemo, useRef, useState } from 'react'

interface GridBreakpoint {
  minWidth: number
  columns: number
}

interface UseWindowedGridOptions<T> {
  items: T[]
  minItems?: number
  breakpoints: GridBreakpoint[]
  estimateItemHeight: (columnWidth: number) => number
  gap?: number
  overscanRows?: number
}

interface VirtualState {
  containerWidth: number
  viewportHeight: number
  scrollTop: number
  gridTop: number
}

const DEFAULT_MIN_ITEMS = 60
const DEFAULT_OVERSCAN_ROWS = 3

const findScrollViewport = (element: HTMLElement | null): HTMLElement | null => {
  return element?.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null
}

const resolveGridColumns = (breakpoints: GridBreakpoint[], width: number) => {
  return [...breakpoints]
    .sort((a, b) => b.minWidth - a.minWidth)
    .find(breakpoint => width >= breakpoint.minWidth)?.columns ?? 1
}

export function useWindowedGrid<T>({
  items,
  minItems = DEFAULT_MIN_ITEMS,
  breakpoints,
  estimateItemHeight,
  gap = 0,
  overscanRows = DEFAULT_OVERSCAN_ROWS,
}: UseWindowedGridOptions<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [virtualState, setVirtualState] = useState<VirtualState>({
    containerWidth: 0,
    viewportHeight: 0,
    scrollTop: 0,
    gridTop: 0,
  })

  const hasItems = items.length > 0

  useEffect(() => {
    if (!hasItems) return
    const grid = containerRef.current
    if (!grid) return

    const scrollViewport = findScrollViewport(grid)
    const scrollElement = scrollViewport ?? window

    const updateVirtualState = () => {
      const rect = grid.getBoundingClientRect()
      const viewportRect = scrollViewport?.getBoundingClientRect()
      const nextViewportHeight = viewportRect?.height ?? window.innerHeight
      const nextScrollTop = scrollViewport?.scrollTop ?? window.scrollY
      const nextGridTop = scrollViewport
        ? rect.top - (viewportRect?.top ?? 0) + nextScrollTop
        : rect.top + window.scrollY

      setVirtualState(prev => {
        const next = {
          containerWidth: rect.width,
          viewportHeight: nextViewportHeight,
          scrollTop: nextScrollTop,
          gridTop: nextGridTop,
        }

        if (
          Math.abs(prev.containerWidth - next.containerWidth) < 1 &&
          Math.abs(prev.viewportHeight - next.viewportHeight) < 1 &&
          Math.abs(prev.scrollTop - next.scrollTop) < 1 &&
          Math.abs(prev.gridTop - next.gridTop) < 1
        ) {
          return prev
        }

        return next
      })
    }

    updateVirtualState()
    scrollElement.addEventListener('scroll', updateVirtualState, { passive: true })
    window.addEventListener('resize', updateVirtualState, { passive: true })

    const resizeObserver = new ResizeObserver(updateVirtualState)
    resizeObserver.observe(grid)

    return () => {
      scrollElement.removeEventListener('scroll', updateVirtualState)
      window.removeEventListener('resize', updateVirtualState)
      resizeObserver.disconnect()
    }
  }, [hasItems])

  const virtualGrid = useMemo(() => {
    const columns = resolveGridColumns(breakpoints, virtualState.containerWidth)
    const columnWidth =
      columns > 0
        ? (virtualState.containerWidth - gap * (columns - 1)) / columns
        : virtualState.containerWidth
    const rowHeight = Math.max(1, estimateItemHeight(Math.max(1, columnWidth)))
    const rowCount = Math.ceil(items.length / columns)
    const shouldVirtualize = items.length >= minItems && virtualState.containerWidth > 0

    if (!shouldVirtualize) {
      return {
        shouldVirtualize,
        columns,
        rowHeight,
        rowCount,
        topPadding: 0,
        bottomPadding: 0,
        visibleItems: items.map((item, index) => ({ item, index })),
      }
    }

    const viewportStart = Math.max(0, virtualState.scrollTop - virtualState.gridTop)
    const viewportEnd = viewportStart + virtualState.viewportHeight
    const startRow = Math.max(0, Math.floor(viewportStart / rowHeight) - overscanRows)
    const endRow = Math.min(rowCount, Math.ceil(viewportEnd / rowHeight) + overscanRows)
    const startIndex = startRow * columns
    const endIndex = Math.min(items.length, endRow * columns)

    return {
      shouldVirtualize,
      columns,
      rowHeight,
      rowCount,
      topPadding: startRow * rowHeight,
      bottomPadding: Math.max(0, (rowCount - endRow) * rowHeight),
      visibleItems: items
        .slice(startIndex, endIndex)
        .map((item, offset) => ({ item, index: startIndex + offset })),
    }
  }, [breakpoints, estimateItemHeight, gap, items, minItems, overscanRows, virtualState])

  return {
    containerRef,
    ...virtualGrid,
  }
}
