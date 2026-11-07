/**
 * 分片并发预取队列。
 *
 * 背景：hls.js 本身串行下载分片,部分影视 CDN 对单连接限速(实测极速资源单连接
 * ≈2Mbps,4x 倍速耗流 ≈2Mbps,下载与消耗贴平,任何抖动都会卡)。同一 CDN 并发
 * 拉片实测总吞吐提升约 3 倍(单连接限速型 CDN)。
 *
 * 机制：播放器侧监听 LEVEL_LOADED / FRAG_LOADING / ratechange,调
 * ensurePrefetchWindow 把「播放头之后的后续分片」按目标窗口并行下载入队;
 * 自定义 loader 收到对应分片请求时先从队列取结果直接投喂,命中则不重新下载。
 * 暂停时 hls.js 默认继续拉缓冲(FRAG_LOADING 持续触发),预取也随之持续;
 * 清单刚解析完也会立即预取一个窗口。队列 = 实例级内存缓冲,上限 maxQueueSize 片。
 */

const QUEUE_TIMEOUT_MS = 30_000

/** 队列条目：promise 为下载结果,settled 标记下载是否已结束 */
interface QueueEntry {
  promise: Promise<ArrayBuffer> | null
  settled: boolean
}

/** 模块级队列:分片请求 URL → 下载中/已就绪的二进制内容 */
const queue = new Map<string, QueueEntry>()

/** 由调用方注入的 URL 重写器(播放链路代理包裹) */
let activeTransformer: ((url: string) => string) | null = null

/** 目标窗口:队列片数低于它时补拉(播放器按倍速计算传入) */
let targetWindowSize = 6

/** 队列硬上限:超出时释放已就绪的最旧条目,在途下载保留 */
let maxQueueSize = 32

/** 统计用:当前队列状态(inflight = 未下载完的条目数) */
export function getFragmentPrefetchStats(): {
  queued: number
  inflight: number
  resolved: number
  targetWindow: number
} {
  let resolved = 0
  for (const entry of queue.values()) {
    if (entry.settled) resolved += 1
  }
  return {
    queued: queue.size,
    inflight: queue.size - resolved,
    resolved,
    targetWindow: targetWindowSize,
  }
}

/**
 * 配置预取(播放器挂载/卸载时调用)。
 * transformer 把原始分片 URL 重写为实际请求地址(代理中转),与 loader 的
 * urlTransformer 保持一致;传 null 表示停用并清空队列。
 */
export function configureFragmentPrefetch(
  transformer: ((url: string) => string) | null,
  options: { windowSize?: number; maxQueueSize?: number } = {},
): void {
  activeTransformer = transformer
  if (options.windowSize && options.windowSize > 0) targetWindowSize = options.windowSize
  if (options.maxQueueSize && options.maxQueueSize > 0) maxQueueSize = options.maxQueueSize
  if (!transformer) clearFragmentPrefetch()
}

/** 清空队列(播放器销毁时调用;在途下载不被中断,完成后自然失效) */
export function clearFragmentPrefetch(): void {
  queue.clear()
}

/**
 * 补拉窗口:把播放头 currentSn 之后的后续分片逐个入队,直到队列片数达到
 * targetWindow 或清单里没有更多可预取的片为止。幂等(已入队的片不重复
 * 下载),播放器每次 FRAG_LOADING / LEVEL_LOADED / ratechange 都可安全调用。
 * @param fragments 当前档位的完整分片列表(来自 LEVEL_LOADED 的 details.fragments)
 * @param currentSn 播放头所在分片序号;-1 表示清单刚加载、从头补拉
 */
export function ensurePrefetchWindow(
  fragments: { sn: string | number; url?: string }[],
  currentSn: number,
): void {
  if (!activeTransformer || fragments.length === 0) return

  // 从播放头之后第一片开始逐个尝试入队;find 找不到下一片(清单尽头)
  // 或队列已达目标窗口时自然终止,无需额外防御计数
  let offset = 1
  while (queue.size < targetWindowSize) {
    const next = fragments.find(fragment => fragment.sn === currentSn + offset)
    if (!next?.url) break
    prefetchFragment(next.url)
    offset += 1
  }

  // 护栏:队列超过硬上限时,把已就绪(settled)的最旧条目移出释放内存;
  // 在途下载不打断,让其自然完成
  if (queue.size > maxQueueSize) {
    for (const [url, entry] of queue) {
      if (queue.size <= maxQueueSize) break
      if (entry.settled) queue.delete(url)
    }
  }
}

/**
 * 把「预计即将被请求」的分片原始 URL 入队,立即并行下载。
 * 幂等:同一 URL 只下载一次(队列以转换后的请求 URL 为 key,
 * 与 loader 查询时 context.url 的形态一致)。
 */
export function prefetchFragment(rawUrl: string): void {
  if (!rawUrl || !activeTransformer) return

  const requestUrl = activeTransformer(rawUrl)
  if (queue.has(requestUrl)) return

  const entry: QueueEntry = { promise: null, settled: false }
  entry.promise = startDownload(requestUrl, entry)
  queue.set(requestUrl, entry)
}

/**
 * loader 查询:队列里有该分片则取出(删除条目,避免重复消费)。
 * 参数 requestUrl 即 loader 重写后的 context.url。
 * 返回 Promise(下载中或已完成)——真正消费时 await,失败会 reject。
 */
export function tryTakeFragment(requestUrl: string): Promise<ArrayBuffer> | null {
  const entry = queue.get(requestUrl)
  if (!entry) return null
  queue.delete(requestUrl)
  return entry.promise
}

function startDownload(requestUrl: string, entry: QueueEntry): Promise<ArrayBuffer> {
  const pending = fetch(requestUrl, { signal: AbortSignal.timeout(QUEUE_TIMEOUT_MS) })
    .then(response => {
      if (!response.ok) throw new Error(`prefetch failed: ${response.status}`)
      return response.arrayBuffer()
    })
    .finally(() => {
      entry.settled = true
    })
  // 下载失败且无人消费时,避免 unhandled rejection;消费方仍能收到同一个错误
  pending.catch(() => {})
  return pending
}

/** hls.js 兼容的响应统计(用于带宽估算),按实际耗时填充 */
export function buildPrefetchStats(trequest: number, tload: number): Record<string, number> {
  return {
    trequest,
    tfirst: trequest,
    tload,
    total: Math.max(1, tload - trequest),
    loading: Math.max(1, tload - trequest),
    parsing: 0,
    aborted: 0,
    error: 0,
    loaded: 1,
  }
}