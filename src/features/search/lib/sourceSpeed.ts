import { create } from 'zustand'
import type { VideoItem, VideoSource } from '@ouonnki/cms-core'
import { createConcurrencyLimiter } from '@ouonnki/cms-core'
import { buildProxyRequestUrl } from '@/shared/config/api.config'
import { useSettingStore } from '@/shared/store/settingStore'

/*
 * 搜索源测速：对参与搜索的源做受限下载测速（吞吐为主、TTFB 为次），
 * 结果存会话级速度表（10 分钟 TTL），搜索结果按来源站速度重排并展示。
 *
 * 测速/排序为纯逻辑（fetchFn/getNetwork/now 全部可注入，便于单测），
 * 文件尾部提供 UI 层 zustand store（useSourceSpeedStore）做增量发布。
 */

/** 单源受限下载字节上限 */
export const SPEED_MAX_BYTES = 512 * 1024
/** 单源下载时长上限（读超时按已收字节算部分成功） */
export const SPEED_MAX_READ_MS = 4000
/** 首字节硬超时 */
export const SPEED_TTFB_TIMEOUT_MS = 2500
/** 速度表 TTL：会话内复用 */
export const SPEED_TTL_MS = 10 * 60 * 1000
/** 测速并发上限（不挤占搜索自身的 3 并发） */
export const SPEED_CONCURRENCY = 2

export interface SourceSpeedEntry {
  /** 携带 id/name/url，UI 与缓存复用 */
  source: VideoSource
  /** 吞吐测量成功（读超时部分成功也算） */
  ok: boolean
  /** 实测吞吐（MB/s）；ok 时有值 */
  throughputMBps: number | null
  /** 首字节耗时（ms）；有响应时记录 */
  ttfbMs: number | null
  /** 实际接收字节数 */
  bytesReceived: number
  errorMessage?: string | null
  /** 被外部 signal 中止——不缓存不展示 */
  aborted?: boolean
  checkedAt: number
}

export interface SpeedMeasureDeps {
  fetchFn?: typeof fetch
  /** 测试注入网络配置，默认读 settingStore */
  getNetwork?: () => { isProxyEnabled: boolean; proxyUrl: string }
  /** 测试注入时钟，默认 performance.now */
  now?: () => number
  maxBytes?: number
  maxReadMs?: number
  ttfbTimeoutMs?: number
}

const readNetwork = (deps?: SpeedMeasureDeps) =>
  deps?.getNetwork?.() ?? useSettingStore.getState().network

/** 测速 URL：与搜索同链路（health-check 同款代理分支），保证各源相对可比 */
const resolveSpeedUrl = (source: VideoSource, network: { isProxyEnabled: boolean; proxyUrl: string }) =>
  network.isProxyEnabled
    ? buildProxyRequestUrl(source.url, network.proxyUrl)
    : source.url

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError'

/**
 * 对单个源做受限下载测速：
 * - TTFB 超时（2.5s）→ 失败「连接超时」；
 * - 读流超时（4s）→ 按已收字节算部分成功（慢速源的真实表达）；
 * - 512KB 封顶，`cache: 'no-store'` 强制回源。
 */
export async function measureSourceSpeed(
  source: VideoSource,
  signal?: AbortSignal,
  deps?: SpeedMeasureDeps,
): Promise<SourceSpeedEntry> {
  const {
    fetchFn = fetch,
    now = () => performance.now(),
    maxBytes = SPEED_MAX_BYTES,
    maxReadMs = SPEED_MAX_READ_MS,
    ttfbTimeoutMs = SPEED_TTFB_TIMEOUT_MS,
  } = deps ?? {}

  const controller = new AbortController()
  if (signal?.aborted) {
    return {
      source,
      ok: false,
      throughputMBps: null,
      ttfbMs: null,
      bytesReceived: 0,
      aborted: true,
      errorMessage: '已取消',
      checkedAt: Date.now(),
    }
  }
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })

  const url = resolveSpeedUrl(source, readNetwork(deps))
  const ttfbTimer = setTimeout(() => controller.abort(), ttfbTimeoutMs)

  const t0 = now()
  let response: Response
  try {
    response = await fetchFn(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json, text/plain, */*' },
    })
  } catch (error) {
    clearTimeout(ttfbTimer)
    signal?.removeEventListener('abort', onAbort)
    if (isAbortError(error) && !signal?.aborted) {
      return {
        source,
        ok: false,
        throughputMBps: null,
        ttfbMs: null,
        bytesReceived: 0,
        errorMessage: '连接超时',
        checkedAt: Date.now(),
      }
    }
    return {
      source,
      ok: false,
      throughputMBps: null,
      ttfbMs: null,
      bytesReceived: 0,
      aborted: signal?.aborted || undefined,
      errorMessage: signal?.aborted
        ? '已取消'
        : error instanceof Error
          ? error.message
          : '网络请求失败',
      checkedAt: Date.now(),
    }
  }
  clearTimeout(ttfbTimer)
  const ttfbMs = now() - t0

  if (!response.ok || !response.body) {
    signal?.removeEventListener('abort', onAbort)
    return {
      source,
      ok: false,
      throughputMBps: null,
      ttfbMs,
      bytesReceived: 0,
      errorMessage: `HTTP ${response.status}`,
      checkedAt: Date.now(),
    }
  }

  const reader = response.body.getReader()
  let received = 0
  const readStart = now()
  const readTimer = setTimeout(() => controller.abort(), maxReadMs)
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received >= maxBytes) break
    }
  } catch (error) {
    // 读流中断：外部取消 vs 读超时（部分成功按已收字节计吞吐）
    if (!isAbortError(error) || signal?.aborted) {
      return {
        source,
        ok: false,
        throughputMBps: null,
        ttfbMs,
        bytesReceived: received,
        aborted: signal?.aborted || undefined,
        errorMessage: signal?.aborted ? '已取消' : '下载中断',
        checkedAt: Date.now(),
      }
    }
  } finally {
    clearTimeout(readTimer)
    reader.cancel().catch(() => {})
    controller.abort()
    signal?.removeEventListener('abort', onAbort)
  }

  const elapsedMs = Math.max(now() - readStart, 1)
  return {
    source,
    ok: received > 0,
    ttfbMs,
    bytesReceived: received,
    throughputMBps: received > 0 ? received / 1024 / 1024 / (elapsedMs / 1000) : null,
    errorMessage: received > 0 ? undefined : '未收到数据',
    checkedAt: Date.now(),
  }
}

/* 会话级速度表：网络配置变化时整体失效（代理/直连切换后旧值不可比） */

const speedCache = new Map<string, { entry: SourceSpeedEntry; expiresAt: number }>()
const pendingSpeed = new Map<string, Promise<SourceSpeedEntry>>()
let cachedNetworkKey: string | null = null

const networkKeyOf = (network: { isProxyEnabled: boolean; proxyUrl: string }) =>
  `${network.isProxyEnabled}|${network.proxyUrl}`

export function getSourceSpeed(sourceId: string): SourceSpeedEntry | null {
  const cached = speedCache.get(sourceId)
  if (!cached) return null
  if (Date.now() >= cached.expiresAt) {
    speedCache.delete(sourceId)
    return null
  }
  return cached.entry
}

export function setSourceSpeed(sourceId: string, entry: SourceSpeedEntry): void {
  speedCache.set(sourceId, { entry, expiresAt: Date.now() + SPEED_TTL_MS })
}

/**
 * 确保参与源的速度就绪：查表只补测缺失/过期的源（in-flight 去重，并发 ≤2）。
 * 返回参与源全集的表（缓存命中 + 本次新测；失败也进表供 UI 显示，aborted 不入）。
 * onEntry 可选：每个【新测完成】与【缓存命中】的条目都立即回调，
 * 供调用方增量发布——不用等整批 settle 才出标签/排序。
 */
export async function ensureSourceSpeeds(
  sources: VideoSource[],
  signal?: AbortSignal,
  deps?: SpeedMeasureDeps,
  onEntry?: (entry: SourceSpeedEntry) => void,
): Promise<Map<string, SourceSpeedEntry>> {
  const result = new Map<string, SourceSpeedEntry>()
  if (sources.length === 0) return result

  const network = readNetwork(deps)
  const networkKey = networkKeyOf(network)
  if (networkKey !== cachedNetworkKey) {
    speedCache.clear()
    cachedNetworkKey = networkKey
  }

  const limiter = createConcurrencyLimiter(SPEED_CONCURRENCY)
  const tasks: Array<Promise<void>> = []

  for (const source of sources) {
    const cached = getSourceSpeed(source.id)
    if (cached) {
      result.set(source.id, cached)
      // 缓存命中也即时发布:翻页时调用方的速度表立即完整,无需等 settle
      onEntry?.(cached)
      continue
    }

    const task = (pendingSpeed.get(source.id) ??
      limiter(() => measureSourceSpeed(source, signal, deps))) as Promise<SourceSpeedEntry>
    pendingSpeed.set(source.id, task)
    task.finally(() => {
      if (pendingSpeed.get(source.id) === task) {
        pendingSpeed.delete(source.id)
      }
    })
    tasks.push(
      task.then(entry => {
        if (entry.aborted) return
        // 失败也进返回表（UI 显示状态），只有成功才入缓存（失败下次重试）
        result.set(source.id, entry)
        if (entry.ok && entry.throughputMBps !== null) {
          setSourceSpeed(source.id, entry)
        }
        onEntry?.(entry)
      }),
    )
  }

  await Promise.allSettled(tasks)
  return result
}

/**
 * 搜索结果按来源站速度稳定排序：快的源的结果在前，同源内部保持原顺序；
 * 吞吐为主键，吞吐差 <10% 时按 TTFB 升序（测下载 > 测速）；
 * 未测/失败的源沉底且相互保持原顺序。
 */
export function sortResultsBySourceSpeed(
  items: VideoItem[],
  speedMap: Map<string, SourceSpeedEntry>,
): VideoItem[] {
  if (items.length < 2 || speedMap.size === 0) return items

  // 一次遍历分桶：桶 = source_code 分组，桶内保持原顺序（Map 保留插入序）
  const groups = new Map<string, VideoItem[]>()
  for (const item of items) {
    const key = item.source_code || ''
    const list = groups.get(key)
    if (list) {
      list.push(item)
    } else {
      groups.set(key, [item])
    }
  }

  const order = [...groups.keys()]
  order.sort((keyA, keyB) => {
    const a = speedMap.get(keyA)
    const b = speedMap.get(keyB)
    const okA = Boolean(a?.ok && a.throughputMBps !== null)
    const okB = Boolean(b?.ok && b.throughputMBps !== null)
    if (okA !== okB) return okA ? -1 : 1
    if (!okA) return 0 // 双未测/失败：保持相对顺序（ES2019+ 稳定排序）
    const ta = a?.throughputMBps as number
    const tb = b?.throughputMBps as number
    if (Math.abs(ta - tb) / Math.max(ta, tb) < 0.1) {
      return (a?.ttfbMs ?? 0) - (b?.ttfbMs ?? 0)
    }
    return tb - ta
  })

  return order.flatMap(key => groups.get(key) ?? [])
}

/** 速度展示格式：1 位小数 MB/s */
export const formatSpeed = (mbps: number): string => `${mbps.toFixed(1)} MB/s`

/*
 * UI 层速度表（zustand 单轨）：
 * 模块级 speedCache 是唯一真相，store 只做「增量发布」——
 * 每个条目（新测/缓存命中）即时合并进 entries 并通知订阅者，
 * UI 标签与重排由订阅天然驱动，无需调用方手动桥接 state。
 */
export const useSourceSpeedStore = create<{
  /** 源 id → 速度条目（会话级） */
  entries: Map<string, SourceSpeedEntry>
  /** 确保源速度就绪：每次回调即时合并进 entries（增量发布） */
  ensure: (
    sources: VideoSource[],
    signal?: AbortSignal,
  ) => Promise<Map<string, SourceSpeedEntry>>
}>((set) => ({
  entries: new Map(),
  ensure: (sources, signal) =>
    ensureSourceSpeeds(sources, signal, undefined, (entry) => {
      set((state) => ({ entries: new Map(state.entries).set(entry.source.id, entry) }))
    }),
}))
