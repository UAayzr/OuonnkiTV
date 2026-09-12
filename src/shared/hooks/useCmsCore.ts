import { useEffect, useState, useMemo } from 'react'
import {
  createCmsClient,
  createDirectStrategy,
  createUrlPrefixProxyStrategy,
  type CmsClient,
  type VideoSource,
  type VideoItem,
  type SearchResult,
  type CmsClientConfig,
} from '@ouonnki/cms-core'
import { useSettingStore } from '@/shared/store/settingStore'
import { normalizeProxyPrefix } from '@/shared/config/api.config'

let globalClient: CmsClient | null = null
let globalNetworkKey: string | null = null

function getCmsClient(config?: CmsClientConfig): CmsClient {
  const { network } = useSettingStore.getState()
  const normalizedProxyUrl = normalizeProxyPrefix(network.proxyUrl)
  const networkKey = [
    network.concurrencyLimit,
    network.isProxyEnabled ? 'proxy' : 'direct',
    network.isProxyEnabled ? normalizedProxyUrl : '',
  ].join('|')

  // 当网络设置变化时重建单例
  if (globalClient && globalNetworkKey !== networkKey) {
    globalClient.destroy()
    globalClient = null
  }

  if (!globalClient) {
    globalNetworkKey = networkKey
    globalClient = createCmsClient({
      proxyStrategy: network.isProxyEnabled
        ? createUrlPrefixProxyStrategy(normalizedProxyUrl)
        : createDirectStrategy(),
      concurrencyLimit: network.concurrencyLimit,
      ...config,
    })
  }
  return globalClient
}

/**
 * 获取CmsClient实例的Hook
 * @param config 可选的客户端配置
 */
export function useCmsClient(config?: CmsClientConfig): CmsClient {
  const networkKey = useSettingStore(
    state =>
      `${state.network.concurrencyLimit}|${state.network.isProxyEnabled}|${state.network.proxyUrl}`,
  )
  return useMemo(() => {
    void networkKey
    return getCmsClient(config)
  }, [config, networkKey])
}

interface CmsVideoListState {
  /** 视频列表 */
  items: VideoItem[]
  /** 是否正在加载 */
  loading: boolean
  /** 错误信息 */
  error: string | null
}

/**
 * CMS 视频列表 Hook
 * 从指定视频源获取推荐/最新视频列表（不带搜索关键词）
 */
export function useCmsVideoList(source: VideoSource | null, config?: CmsClientConfig): CmsVideoListState {
  const networkKey = useSettingStore(
    state =>
      `${state.network.concurrencyLimit}|${state.network.isProxyEnabled}|${state.network.proxyUrl}`,
  )
  const client = useMemo(() => {
    void networkKey
    return getCmsClient(config)
  }, [config, networkKey])

  const [state, setState] = useState<CmsVideoListState>({
    items: [],
    loading: false,
    error: null,
  })

  useEffect(() => {
    if (!source || !source.isEnabled) {
      setState({ items: [], loading: false, error: null })
      return
    }

    let cancelled = false

    const fetchList = async () => {
      setState(prev => ({ ...prev, loading: true, error: null }))

      try {
        const result: SearchResult = await client.listVideos(source)

        if (cancelled) return

        if (result.success) {
          setState({ items: result.items, loading: false, error: null })
        } else {
          setState({ items: [], loading: false, error: result.error || '获取列表失败' })
        }
      } catch (error) {
        if (cancelled) return
        setState({
          items: [],
          loading: false,
          error: error instanceof Error ? error.message : '请求失败',
        })
      }
    }

    fetchList()

    return () => {
      cancelled = true
    }
  }, [client, source])

  return state
}
