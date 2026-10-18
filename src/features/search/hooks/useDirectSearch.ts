import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { type VideoItem, type SearchResultEvent, type Pagination, type VideoSource } from '@ouonnki/cms-core'
import { useApiStore } from '@/shared/store/apiStore'
import { useCmsClient } from '@/shared/hooks'
import { PaginationConfig } from '@/shared/config/video.config'
import {
  appendUniqueVideoItems,
  getSourcesToFetch,
  type SourcePaginationInfo,
} from './directSearch.utils'
import { sortResultsBySourceSpeed, useSourceSpeedStore } from '../lib/sourceSpeed'

export function useDirectSearch() {
  const [directResults, setDirectResults] = useState<VideoItem[]>([])
  const [directLoading, setDirectLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [cmsPagination, setCmsPagination] = useState<Pagination>({
    page: 1,
    totalPages: 0,
    totalResults: 0,
  })
  // 缓存每个源的分页信息，用于判断是否需要请求
  const sourcePaginationCacheRef = useRef<Map<string, SourcePaginationInfo>>(new Map())
  const abortCtrlRef = useRef<AbortController | null>(null)
  const timeOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentPageRef = useRef(1)
  const seenResultKeysRef = useRef<Set<string>>(new Set())
  // 新增：记录当前页需要请求的源列表
  const sourcesToFetchRef = useRef<VideoSource[]>([])
  // 新增：记录当前页已返回结果的源 ID 集合
  const [completedSourcesInCurrentPage, setCompletedSourcesInCurrentPage] = useState<Set<string>>(new Set())
  // 新增：记录当前页成功返回结果的源 ID 集合（有内容的源）
  const [successfulSourcesInCurrentPage, setSuccessfulSourcesInCurrentPage] = useState<Set<string>>(new Set())
  // 新增：请求版本号，用于处理竞态条件
  const requestVersionRef = useRef(0)
  // 本页进度分母（每次请求重置）
  const totalForPageRef = useRef(0)

  const { videoAPIs } = useApiStore()
  const cmsClient = useCmsClient()

  // 速度表：zustand 单轨订阅，测速条目增量 merge 时自动触发重渲染
  const sourceSpeeds = useSourceSpeedStore(state => state.entries)

  const selectedAPIs = useMemo(() => {
    return videoAPIs.filter(api => api.isEnabled)
  }, [videoAPIs])

  // 速度条目更新 → 对当前结果按新速度重排（幂等：结果为空/未测时跳过）
  useEffect(() => {
    if (sourceSpeeds.size === 0 || directResults.length === 0) return
    setDirectResults(prev =>
      prev.length > 0 ? sortResultsBySourceSpeed(prev, sourceSpeeds) : prev,
    )
  }, [sourceSpeeds, directResults.length])

  const fetchDirectSearch = useCallback(async (keyword: string, page: number = 1) => {
    if (!keyword || selectedAPIs.length === 0) return

    // 增加版本号，用于处理竞态条件
    const currentVersion = ++requestVersionRef.current

    abortCtrlRef.current?.abort()
    const controller = new AbortController()
    abortCtrlRef.current = controller
    currentPageRef.current = page

    setDirectLoading(true)

    // 第1页时清空现有结果
    if (page === 1) {
      setDirectResults([])
      seenResultKeysRef.current.clear()
      sourcePaginationCacheRef.current.clear()
      setCompletedSourcesInCurrentPage(new Set())
      setSuccessfulSourcesInCurrentPage(new Set())
    } else {
      // 翻页时清空当前页的已完成记录
      setCompletedSourcesInCurrentPage(new Set())
      setSuccessfulSourcesInCurrentPage(new Set())
    }

    // 根据缓存判断哪些源需要跳过
    const cachedSources = sourcePaginationCacheRef.current
    const sourcesToFetch = getSourcesToFetch(selectedAPIs, cachedSources, page)

    // 保存当前页需要请求的源列表
    sourcesToFetchRef.current = sourcesToFetch

    // 后台测速（不 await，不拖慢搜索）：store 每测完一个源增量发布，
    // 本 hook 的 useEffect 重排 + 组件速度标签由订阅即时响应
    useSourceSpeedStore.getState().ensure(sourcesToFetch)
    // 本页进度分母：全缓存命中时按全部源计
    totalForPageRef.current =
      sourcesToFetch.length > 0 ? sourcesToFetch.length : selectedAPIs.length
    if (sourcesToFetch.length === 0) {
      // 全部源命中分页缓存：直接标记完成（进度派生后即 100%）
      setCompletedSourcesInCurrentPage(new Set(selectedAPIs.map(source => source.id)))
      setDirectLoading(false)
      setHasMore(false)
      if (timeOutTimer.current) {
        clearTimeout(timeOutTimer.current)
        timeOutTimer.current = null
      }
      return
    }

    if (timeOutTimer.current) {
      clearTimeout(timeOutTimer.current)
      timeOutTimer.current = null
    }
    timeOutTimer.current = setTimeout(() => {
      setDirectLoading(false)
      // 超时时，将所有需要请求的源标记为已完成
      // 这样可以避免因为某些源无响应而卡住
      if (sourcesToFetchRef.current.length > 0) {
        setCompletedSourcesInCurrentPage(prev => {
          const newSet = new Set(prev)
          sourcesToFetchRef.current.forEach(source => {
            newSet.add(source.id)
          })
          return newSet
        })
        // 进度由 completedSourcesInCurrentPage 派生，无需在此更新
      }
      timeOutTimer.current = null
    }, PaginationConfig.maxRequestTimeout)

    // 用于累积分页信息
    const paginationMap = new Map<string, Pagination>()

    // Subscribe to search progress - 这是每个源完成（成功或失败）的可靠信号
    const unsubProgress = cmsClient.on('search:progress', (event) => {
      // Only process if this is the current request (handle race conditions)
      if (currentVersion !== requestVersionRef.current) return

      if (event.source?.id) {
        const sourceId = event.source.id
        const isInCurrentFetch = sourcesToFetchRef.current.some(s => s.id === sourceId)
        if (isInCurrentFetch) {
          setCompletedSourcesInCurrentPage(prev => {
            // 避免重复添加
            if (prev.has(sourceId)) return prev
            return new Set([...prev, sourceId])
          })
        }
      }
    })

    // Subscribe to incremental results
    const unsubResult = cmsClient.on('search:result', (event: SearchResultEvent) => {
      // If not the latest request, ignore results (handle race conditions)
      if (currentVersion !== requestVersionRef.current) return

      // 更新分页缓存
      if (event.pagination && event.source) {
        const cached = cachedSources.get(event.source.id)
        const paginationInfo: SourcePaginationInfo = {
          totalPages: event.pagination.totalPages,
          totalResults: event.pagination.totalResults,
        }
        // 只有当分页信息更新时才记录（处理空结果返回最后一页分页信息的情况）
        if (!cached || event.pagination.page <= event.pagination.totalPages) {
          cachedSources.set(event.source.id, paginationInfo)
        }
      }

      setDirectResults(prev => {
        const merged = appendUniqueVideoItems(prev, event.items, seenResultKeysRef.current)
        // 速度表已就绪（暖缓存/前序测速）→ 每事件重排（幂等）；冷启动只追加，由速度订阅重排
        const entries = useSourceSpeedStore.getState().entries
        return entries.size > 0 ? sortResultsBySourceSpeed(merged, entries) : merged
      })

      // 记录成功返回结果的源（有结果的源才算成功）
      if (event.source?.id && event.items.length > 0) {
        const sourceId = event.source.id
        const isInCurrentFetch = sourcesToFetchRef.current.some(s => s.id === sourceId)
        if (isInCurrentFetch) {
          setSuccessfulSourcesInCurrentPage(prev => {
            if (prev.has(sourceId)) return prev
            return new Set([...prev, sourceId])
          })
        }
      }

      // 注意：不在这里更新完成状态，由 search:progress 事件统一处理
      // 这样可以确保无论成功或失败（包括重试后），都只在一个地方标记完成

      // 收集分页信息
      if (event.pagination && event.source) {
        paginationMap.set(event.source.id, event.pagination)

        // 聚合分页信息：累加总数，取最大页数
        let totalResults = 0
        let maxTotalPages = 0
        // 合并缓存和新请求的分页信息
        const allSources = new Set([
          ...cachedSources.keys(),
          ...paginationMap.keys(),
        ])
        allSources.forEach(sourceId => {
          const pag =
            paginationMap.get(sourceId) ||
            (cachedSources.get(sourceId) as Pagination | undefined)
          if (pag) {
            totalResults += pag.totalResults
            if (pag.totalPages > maxTotalPages) {
              maxTotalPages = pag.totalPages
            }
          }
        })

        setCmsPagination({
          page: event.pagination.page,
          totalPages: maxTotalPages,
          totalResults,
        })

        // 判断是否还有更多页
        setHasMore(event.pagination.page < maxTotalPages)
      }
    })

    cmsClient
      .aggregatedSearch(keyword, sourcesToFetch, page, controller.signal)
      .then((allResults: VideoItem[]) => {
        // If no results returned and not on first page, there might be no more data
        // This handles the case where totalPages info is inconsistent with actual data
        if (allResults.length === 0 && page > 1) {
          setHasMore(false)
        }

        if (allResults.length === 0 && page === 1) {
          setHasMore(false)
        }
      })
      .catch(error => {
        if ((error as Error).name !== 'AbortError') {
          console.error('直连搜索失败:', error)
        }
      })
      .finally(() => {
        // 强制将所有本次请求的源标记为完成，防止因某些源无响应或错误信息不完整而卡住
        setCompletedSourcesInCurrentPage(prev => {
          const newSet = new Set(prev)
          sourcesToFetchRef.current.forEach(source => {
            newSet.add(source.id)
          })
          return newSet
        })

        unsubResult()
        unsubProgress()
        setDirectLoading(false)

        if (timeOutTimer.current) {
          clearTimeout(timeOutTimer.current)
          timeOutTimer.current = null
        }
      })

    // 移除toast提示
  }, [selectedAPIs, cmsClient])

  const abortDirectSearch = useCallback(() => {
    abortCtrlRef.current?.abort()
    abortCtrlRef.current = null
    if (timeOutTimer.current) {
      clearTimeout(timeOutTimer.current)
      timeOutTimer.current = null
    }
    setDirectLoading(false)
  }, [])

  const clearDirectSearchState = useCallback(() => {
    setDirectResults([])
    setCmsPagination({
      page: 1,
      totalPages: 0,
      totalResults: 0,
    })
    setHasMore(true)
    setCompletedSourcesInCurrentPage(new Set())
    setSuccessfulSourcesInCurrentPage(new Set())
    sourcesToFetchRef.current = []
    seenResultKeysRef.current.clear()
    sourcePaginationCacheRef.current.clear()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortDirectSearch()
      clearDirectSearchState()
      requestVersionRef.current = 0
    }
  }, [abortDirectSearch, clearDirectSearchState])

  // 搜索进度由「已完成源集合」派生，不再单独维护 state
  const searchProgress = useMemo(
    () => ({
      completed: completedSourcesInCurrentPage.size,
      total: totalForPageRef.current,
    }),
    [completedSourcesInCurrentPage],
  )

  // 计算当前页是否已完成（所有源都已返回）
  const isCurrentPageComplete = useMemo(() => {
    return completedSourcesInCurrentPage.size >= sourcesToFetchRef.current.length
  }, [completedSourcesInCurrentPage])

  // 计算是否允许加载下一页
  const canLoadMore = useMemo(() => {
    return isCurrentPageComplete && cmsPagination.page < cmsPagination.totalPages
  }, [isCurrentPageComplete, cmsPagination])

  return {
    directResults,
    directLoading,
    hasMore,
    searchProgress,
    cmsPagination,
    isCurrentPageComplete,
    canLoadMore,
    successfulSourcesInCurrentPage,
    startDirectSearch: fetchDirectSearch,
    abortDirectSearch,
    clearDirectSearchState,
  }
}
