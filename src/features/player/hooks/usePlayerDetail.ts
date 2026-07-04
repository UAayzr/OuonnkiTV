import { useEffect, useRef, useState } from 'react'
import type { CmsClient, DetailResult, VideoSource } from '@ouonnki/cms-core'

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
      if (detailRef.current) setIsDetailRefreshing(true)
      else setLoading(true)
      setError(null)

      try {
        if (!sourceConfig) {
          throw new Error('未找到对应视频源配置，请检查源设置')
        }

        const response = await cmsClient.getDetail(vodId, sourceConfig)
        if (!canCommit()) return
        if (response.success && response.episodes && response.episodes.length > 0) {
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
