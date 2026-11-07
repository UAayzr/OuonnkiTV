import { useEffect, useRef, useState } from 'react'
import type { CmsClient, DetailResult, VideoSource } from '@ouonnki/cms-core'
import { cacheDetailResult, getCachedDetail, prefetchCmsDetail } from '@/shared/lib/detailCache'

interface UsePlayerDetailParams {
  cmsClient: CmsClient
  routeError: string | null
  sourceCode: string
  vodId: string
  sourceConfig?: VideoSource
}

const buildDetailRequestKey = (sourceCode: string, vodId: string) => `${sourceCode}::${vodId}`

export function usePlayerDetail({
  cmsClient,
  routeError,
  sourceCode,
  vodId,
  sourceConfig,
}: UsePlayerDetailParams) {
  const detailRef = useRef<DetailResult | null>(null)
  const detailRequestSeqRef = useRef(0)
  const loadedDetailKeyRef = useRef('')

  const [detail, setDetail] = useState<DetailResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDetailRefreshing, setIsDetailRefreshing] = useState(false)

  useEffect(() => {
    detailRef.current = detail
  }, [detail])

  useEffect(() => {
    const requestSeq = detailRequestSeqRef.current + 1
    detailRequestSeqRef.current = requestSeq
    let disposed = false
    const canCommit = () => !disposed && detailRequestSeqRef.current === requestSeq

    const fetchVideoDetail = async () => {
      if (routeError) {
        if (!canCommit()) return
        setDetail(null)
        setLoading(false)
        setIsDetailRefreshing(false)
        setError(routeError)
        return
      }

      if (!sourceCode || !vodId) {
        if (!canCommit()) return
        setDetail(null)
        setLoading(false)
        setIsDetailRefreshing(false)
        setError('缺少必要的播放参数')
        return
      }

      const detailRequestKey = buildDetailRequestKey(sourceCode, vodId)
      const hasLoadedCurrentDetail = Boolean(
        detailRef.current && loadedDetailKeyRef.current === detailRequestKey,
      )
      if (hasLoadedCurrentDetail) return

      if (!canCommit()) return

      // 缓存优先：列表页 hover/点击已预取,或本会话看过,直接呈现
      const cached = getCachedDetail(sourceCode, vodId)
      if (cached) {
        loadedDetailKeyRef.current = detailRequestKey
        setDetail(cached)
        setError(null)
        setLoading(false)
        setIsDetailRefreshing(false)
        return
      }

      if (detailRef.current) setIsDetailRefreshing(true)
      else setLoading(true)
      setError(null)

      try {
        if (!sourceConfig) {
          throw new Error('未找到对应视频源配置，请检查源设置')
        }

        // 与列表页预取共用 in-flight 去重,避免重复请求
        let response = await prefetchCmsDetail(sourceCode, vodId)
        if (!response) response = await cmsClient.getDetail(vodId, sourceConfig)
        if (!canCommit()) return
        if (response.success && response.episodes && response.episodes.length > 0) {
          cacheDetailResult(sourceCode, vodId, response)
          loadedDetailKeyRef.current = detailRequestKey
          setDetail(response)
          setError(null)
          return
        }

        throw new Error(response.error || '获取视频详情失败')
      } catch (fetchError) {
        if (!canCommit()) return
        console.error('获取视频详情失败:', fetchError)
        setDetail(null)
        setError(fetchError instanceof Error ? fetchError.message : '获取视频详情失败')
      } finally {
        if (canCommit()) {
          setLoading(false)
          setIsDetailRefreshing(false)
        }
      }
    }

    void fetchVideoDetail()

    return () => {
      disposed = true
    }
  }, [cmsClient, routeError, sourceCode, sourceConfig, vodId])

  return {
    detail,
    loading,
    error,
    isDetailRefreshing,
  }
}
