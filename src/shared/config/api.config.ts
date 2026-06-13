// API 配置
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export const API_CONFIG = {
  search: {
    path: '/api.php/provide/vod/?ac=videolist&wd=',
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/json',
    },
  },
  detail: {
    path: '/api.php/provide/vod/?ac=videolist&ids=',
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/json',
    },
  },
}

// 代理地址前缀（可在设置页被覆盖）
export const DEFAULT_PROXY_URL = '/proxy?url='
export const PROXY_URL = DEFAULT_PROXY_URL
export const M3U8_PATTERN = /\$https?:\/\/[^"'\s]+?\.m3u8/g

export const normalizeProxyPrefix = (proxyUrl?: string | null): string => {
  const value = typeof proxyUrl === 'string' ? proxyUrl.trim() : ''
  const base = value || DEFAULT_PROXY_URL

  if (base.includes('{url}')) return base
  if (/[?&]url=$/i.test(base)) return base
  if (/[?&]url=[^&]*$/i.test(base)) {
    return base.replace(/([?&]url=)[^&]*$/i, '$1')
  }
  return base.includes('?') ? `${base}&url=` : `${base}?url=`
}

export const buildProxyRequestUrl = (targetUrl: string, proxyUrl?: string | null): string => {
  const normalized = normalizeProxyPrefix(proxyUrl)
  if (normalized.includes('{url}')) {
    return normalized.split('{url}').join(encodeURIComponent(targetUrl))
  }
  return normalized + encodeURIComponent(targetUrl)
}

import type { VideoApi } from '@/shared/types/video'
import { INITIAL_CONFIG } from './initialConfig'
import { DEFAULT_SETTINGS } from './settings.config'
import builtinSources from './builtin-sources.json'

/**
 * 获取应用内置的初始视频源。
 *
 * 这些源等同于「用户首次启动时已经手动添加好」的源，写入 store 后形态、
 * 行为、删除 / 启用 / 排序逻辑均与用户自行添加的源完全一致；首次初始化
 * 完成后用户的修改会被持久化保留，删除后不会复活。
 */
const getBuiltinVideoSources = (): VideoApi[] => parseVideoSources(builtinSources)

// 从环境变量 + 内置 JSON 获取初始视频源
export const getInitialVideoSources = async (): Promise<VideoApi[]> => {
  // 1. 最高优先级：完整配置导入（OKI_INITIAL_CONFIG）
  //    用户提供完整配置时，认为其期望「从零」恢复一份指定状态，
  //    内置源不再追加，避免污染用户的导出 / 导入数据。
  if (INITIAL_CONFIG?.videoSources && Array.isArray(INITIAL_CONFIG.videoSources)) {
    return parseVideoSources(INITIAL_CONFIG.videoSources)
  }

  // 2. 内置源 + 环境变量源：两者地位等同，统一交给上层 importSources 去重
  const builtin = getBuiltinVideoSources()
  const envSources = await loadEnvVideoSources()
  return [...builtin, ...envSources]
}

/**
 * 解析 OKI_INITIAL_VIDEO_SOURCES（支持内联 JSON 或远程 JSON URL）。
 * 解析失败或未配置时返回空数组，不影响内置源加载。
 */
const loadEnvVideoSources = async (): Promise<VideoApi[]> => {
  let raw = import.meta.env.OKI_INITIAL_VIDEO_SOURCES

  if (!raw || typeof raw !== 'string') {
    return []
  }

  // 若是 URL，则通过代理拉取远程 JSON 文本
  try {
    new URL(raw.trim())
    const response = await fetch(buildProxyRequestUrl(raw.trim()))
    if (!response.ok) {
      console.error(`无法获取远程视频源，HTTP状态: ${response.status}`)
      return []
    }
    raw = await response.text()
  } catch {
    // 不是 URL，按内联 JSON 处理
  }

  try {
    const cleaned = raw
      .replace(/^\s*['"`]/, '')
      .replace(/['"`]\s*$/, '')
      .trim()

    if (!cleaned) return []

    const parsed = JSON.parse(cleaned)
    return parseVideoSources(Array.isArray(parsed) ? parsed : [parsed])
  } catch (error) {
    console.error('解析 OKI_INITIAL_VIDEO_SOURCES 失败:', error)
    console.error('环境变量内容:', raw)
    return []
  }
}

// Helper to parse and validate video sources
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseVideoSources = (sources: any[]): VideoApi[] => {
  return sources
    .map((source, index) => {
      if (!source.name || !source.url) {
        console.warn(`跳过无效的视频源配置: ${JSON.stringify(source)}`)
        return null
      }

      return {
        id: (source.id as string) || `env_source_${index}`,
        name: source.name as string,
        url: source.url as string,
        detailUrl: (source.detailUrl as string) || source.url,
        isEnabled: source.isEnabled !== undefined ? (source.isEnabled as boolean) : true,
        updatedAt: source.updatedAt ? new Date(source.updatedAt) : new Date(),
        timeout: (source.timeout as number) || DEFAULT_SETTINGS.network.defaultTimeout,
        retry: (source.retry as number) || DEFAULT_SETTINGS.network.defaultRetry,
      } as VideoApi
    })
    .filter((source): source is VideoApi => source !== null)
}
