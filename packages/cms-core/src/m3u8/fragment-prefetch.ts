/**
 * 分片并发预取队列。
 *
 * 背景：hls.js 本身串行下载分片，部分影视 CDN 对单连接限速，4x 倍速下
 * 下载与消耗贴平必然卡顿；同一 CDN 并发拉片可提升总吞吐。
 *
 * 但并发必须有预算：慢网下 12~32 条并发会挤占当前播放分片的带宽，
 * seek 后表现为长时间无法加载。因此这里采用「总并发预算」：
 *   预取在途数 + 外部前台加载数 <= maxInflight（默认 2）
 * 并且 hls.js 真正请求的分片一旦命中排队中的条目，立即插队启动，
 * 不受预算限制——当前播放分片永远优先。
 *
 * 队列 = 实例级内存缓冲，上限 maxQueueSize 片；播放器在 FRAG_LOADED、
 * ratechange、seek 后调用 ensurePrefetchWindow 补充窗口。
 */

const QUEUE_TIMEOUT_MS = 30_000
const DEFAULT_MAX_INFLIGHT = 2

/** 队列条目：区分「排队中 / 下载中 / 已完成」三态 */
interface QueueEntry {
  promise: Promise<ArrayBuffer> | null
  started: boolean
  settled: boolean
  timedOut: boolean
  cancelled: boolean
  /** clear 代际：旧条目的 finally 不能改新一批的计数 */
  epoch: number
  startedAt: number
  firstByteAt: number
  controller?: AbortController
  onFirstByte?: (at: number) => void
}

/** 模块级队列：分片请求 URL → 排队中/下载中/已就绪的二进制内容 */
const queue = new Map<string, QueueEntry>()

/** 所有已开始的下载（含已被 loader 取走、已不在 queue 中的条目） */
const activeDownloads = new Set<QueueEntry>()

/** 由调用方注入的 URL 重写器（播放链路代理包裹） */
let activeTransformer: ((url: string) => string) | null = null

/** 目标窗口：队列片数低于它时补拉（播放器按倍速计算传入） */
let targetWindowSize = 6

/** 队列硬上限：超出时释放已就绪的最旧条目，在途/排队中的条目保留 */
let maxQueueSize = 32

/** 总并发预算：预取在途 + 外部前台加载 */
let maxInflight = DEFAULT_MAX_INFLIGHT
let inflightCount = 0
let externalForegroundCount = 0

/** 清空代际：clear 后旧 promise 的 finally 不再影响新计数 */
let epoch = 0

/** 统计用：当前队列状态 */
export function getFragmentPrefetchStats(): {
  queued: number
  inflight: number
  resolved: number
  waiting: number
  targetWindow: number
  maxInflight: number
  foreground: number
} {
  let resolved = 0
  let waiting = 0
  for (const entry of queue.values()) {
    if (entry.settled) resolved += 1
    else if (!entry.started) waiting += 1
  }
  return {
    queued: queue.size,
    // 包含已被 loader 取走但仍在下载的条目
    inflight: inflightCount,
    resolved,
    waiting,
    targetWindow: targetWindowSize,
    maxInflight,
    foreground: externalForegroundCount,
  }
}

/**
 * 配置预取（播放器挂载/卸载时调用）。
 * transformer 把原始分片 URL 重写为实际请求地址（代理中转），与 loader 的
 * urlTransformer 保持一致；传 null 表示停用并清空队列。
 */
export function configureFragmentPrefetch(
  transformer: ((url: string) => string) | null,
  options: { windowSize?: number; maxQueueSize?: number; maxInflight?: number } = {},
): void {
  activeTransformer = transformer
  if (options.windowSize && options.windowSize > 0) targetWindowSize = options.windowSize
  if (options.maxQueueSize && options.maxQueueSize > 0) maxQueueSize = options.maxQueueSize
  if (typeof options.maxInflight === 'number' && options.maxInflight >= 0) {
    maxInflight = Math.floor(options.maxInflight)
  }
  if (!transformer) {
    clearFragmentPrefetch()
    return
  }
  pumpPrefetch()
}

/**
 * 清空队列（播放器销毁/seek 跳转/切档时调用）。
 * 所有未完成的下载都会中止，包括已被 loader 取走、正在等待的条目：
 * 它们已经不会再被使用，继续占着连接只会拖慢新位置的目标分片。
 */
export function clearFragmentPrefetch(): void {
  epoch += 1
  for (const entry of activeDownloads) {
    entry.cancelled = true
    entry.controller?.abort()
  }
  activeDownloads.clear()
  queue.clear()
  inflightCount = 0
  externalForegroundCount = 0
}

/**
 * 补拉窗口：把 currentSn 之后的后续分片逐个入队，直到队列片数达到
 * targetWindow 或清单里没有更多可预取的片为止。幂等（已入队的片不重复
 * 入队），播放器在 FRAG_LOADED / ratechange / seek 后可安全调用。
 * 实际下载由 pumpPrefetch 按并发预算启动，不在这里直接发请求。
 * @param fragments 当前档位的完整分片列表（来自 LEVEL_LOADED 的 details.fragments）
 * @param currentSn 基准分片序号，只预取它之后的分片（通常传刚加载完成的分片）
 */
export function ensurePrefetchWindow(
  fragments: { sn: string | number; url?: string }[],
  currentSn: number,
): void {
  if (!activeTransformer || fragments.length === 0) return

  // 从播放头之后第一片开始逐个尝试入队；find 找不到下一片（清单尽头）
  // 或队列已达目标窗口时自然终止，无需额外防御计数
  let offset = 1
  while (queue.size < targetWindowSize) {
    const next = fragments.find(fragment => fragment.sn === currentSn + offset)
    if (!next?.url) break
    prefetchFragment(next.url)
    offset += 1
  }

  // 护栏:队列超过硬上限时,把已就绪(settled)的最旧条目移出释放内存;
  // 排队中/在途下载不打断
  if (queue.size > maxQueueSize) {
    for (const [url, entry] of queue) {
      if (queue.size <= maxQueueSize) break
      if (entry.settled) queue.delete(url)
    }
  }
}

/**
 * 把「预计即将被请求」的分片原始 URL 入队，由 pumpPrefetch 按预算并发下载。
 * 幂等:同一 URL 只入队一次(队列以转换后的请求 URL 为 key,
 * 与 loader 查询时 context.url 的形态一致)。
 */
export function prefetchFragment(rawUrl: string): void {
  if (!rawUrl || !activeTransformer) return

  const requestUrl = activeTransformer(rawUrl)
  if (queue.has(requestUrl)) return

  queue.set(requestUrl, createEntry())
  pumpPrefetch()
}

/**
 * 前台分片加载的记账（loader 走真实网络时调用）。
 * 返回幂等 release：调用方在 success/error/timeout/abort 任一终止回调里
 * 调用一次即可。clear 之后旧 release 不会误减新计数。
 */
export function noteForegroundLoadStart(): () => void {
  const myEpoch = epoch
  externalForegroundCount += 1
  // 前台请求优先：预算被预取占满时，中止最老的预取下载，把连接让给当前分片
  trimInflight()
  pumpPrefetch()
  let released = false
  return () => {
    if (released) return
    released = true
    if (myEpoch !== epoch) return
    externalForegroundCount = Math.max(0, externalForegroundCount - 1)
    pumpPrefetch()
  }
}

/** 由 loader 消费时持有的预取句柄 */
export interface FragmentPrefetchHandle {
  promise: Promise<ArrayBuffer>
  readonly startedAt: number
  readonly firstByteAt: number
  readonly timedOut: boolean
  readonly cancelled: boolean
  /** headers 已到达则同步回调；否则在首字节到达时回调一次 */
  watchFirstByte(listener: (at: number) => void): void
  abort(): void
}

/**
 * loader 查询:队列里有该分片则取出(删除条目,避免重复消费)并返回句柄。
 * 若条目仍在排队,立即启动下载(插队):这是 hls.js 当前真正需要的分片,
 * 不受并发预算限制。
 * 参数 requestUrl 即 loader 重写后的 context.url。
 */
export function tryTakeFragment(requestUrl: string): FragmentPrefetchHandle | null {
  const entry = queue.get(requestUrl)
  if (!entry) return null
  queue.delete(requestUrl)

  if (!entry.started && !entry.settled) {
    entry.promise = startDownload(requestUrl, entry)
  }
  if (!entry.promise) return null

  return {
    promise: entry.promise,
    get startedAt() {
      return entry.startedAt
    },
    get firstByteAt() {
      return entry.firstByteAt
    },
    get timedOut() {
      return entry.timedOut
    },
    get cancelled() {
      return entry.cancelled
    },
    watchFirstByte(listener) {
      if (entry.firstByteAt > 0) {
        listener(entry.firstByteAt)
      } else if (!entry.settled) {
        entry.onFirstByte = listener
      }
    },
    abort() {
      if (entry.settled) return
      entry.cancelled = true
      entry.controller?.abort()
    },
  }
}

/**
 * 写入 hls.js 的 LoadStats（原地修改）。
 * 注意：frag.stats === loader.stats，ABR 直接读取该对象，不能替换引用；
 * 且 loading/parsing/buffering 必须是嵌套对象，不能是数字。
 */
export interface PrefetchStatsLike {
  aborted: boolean
  loaded: number
  retry: number
  total: number
  chunkCount: number
  bwEstimate: number
  loading: { start: number; first: number; end: number }
  parsing: { start: number; end: number }
  buffering: { start: number; first: number; end: number }
}

export function applyPrefetchStats(
  stats: PrefetchStatsLike,
  timing: { startedAt: number; firstByteAt: number; loadedAt: number; bytes: number },
): void {
  const start = timing.startedAt > 0 ? timing.startedAt : timing.loadedAt
  const first = timing.firstByteAt > 0 ? Math.max(timing.firstByteAt, start) : start
  const end = Math.max(timing.loadedAt, first)
  const bytes = Math.max(0, timing.bytes)

  stats.aborted = false
  stats.loaded = bytes
  stats.total = bytes
  stats.retry = 0
  stats.chunkCount = 0
  stats.loading.start = start
  stats.loading.first = first
  stats.loading.end = end
  stats.bwEstimate = end > first ? (bytes * 8000) / (end - first) : 0
  stats.parsing.start = 0
  stats.parsing.end = 0
  stats.buffering.start = 0
  stats.buffering.first = 0
  stats.buffering.end = 0
}

function createEntry(): QueueEntry {
  return {
    promise: null,
    started: false,
    settled: false,
    timedOut: false,
    cancelled: false,
    epoch,
    startedAt: 0,
    firstByteAt: 0,
  }
}

/** 在并发预算内启动排队中的预取；Map 保持插入顺序，sn+1 优先 */
function pumpPrefetch(): void {
  if (!activeTransformer) return
  const budget = Math.max(0, maxInflight - externalForegroundCount)
  if (inflightCount >= budget) return

  for (const [url, entry] of queue) {
    if (inflightCount >= budget) break
    if (entry.started || entry.settled || entry.epoch !== epoch) continue
    entry.promise = startDownload(url, entry)
  }
}

/**
 * 把在途预取压回预算：前台加载到来时中止最老的下载。
 * 被中止的条目会从队列移除，下一次 ensurePrefetchWindow 仍可重新入队。
 */
function trimInflight(): void {
  const budget = Math.max(0, maxInflight - externalForegroundCount)
  if (inflightCount <= budget) return

  const inflight = [...activeDownloads]
    .filter(entry => !entry.settled && entry.controller && entry.startedAt > 0)
    .sort((a, b) => a.startedAt - b.startedAt)

  // finally 是异步递减计数的，这里用本地计数控制本轮中止数量
  let remaining = inflightCount
  for (const entry of inflight) {
    if (remaining <= budget) break
    entry.cancelled = true
    entry.controller?.abort()
    remaining -= 1
  }
}

function startDownload(requestUrl: string, entry: QueueEntry): Promise<ArrayBuffer> {
  entry.started = true
  entry.startedAt = performance.now()
  entry.epoch = epoch

  const controller = new AbortController()
  entry.controller = controller
  const timer = setTimeout(() => {
    if (entry.settled) return
    entry.timedOut = true
    controller.abort()
  }, QUEUE_TIMEOUT_MS)

  inflightCount += 1
  activeDownloads.add(entry)

  const pending = fetch(requestUrl, { signal: controller.signal })
    .then(response => {
      entry.firstByteAt = performance.now()
      const listener = entry.onFirstByte
      entry.onFirstByte = undefined
      listener?.(entry.firstByteAt)
      if (!response.ok) throw new Error(`prefetch failed: ${response.status}`)
      return response.arrayBuffer()
    })
    .finally(() => {
      clearTimeout(timer)
      const wasCancelled = entry.cancelled
      entry.settled = true
      entry.controller = undefined
      entry.onFirstByte = undefined
      activeDownloads.delete(entry)
      // 被前台抢占中止的条目移出队列，后续 ensurePrefetchWindow 可重新入队
      if (wasCancelled && queue.get(requestUrl) === entry) {
        queue.delete(requestUrl)
      }
      // clear 之后旧条目的 finally 不再影响新一批的计数
      if (entry.epoch === epoch) {
        inflightCount = Math.max(0, inflightCount - 1)
        pumpPrefetch()
      }
    })

  // 下载失败且无人消费时,避免 unhandled rejection;消费方仍能收到同一个错误
  pending.catch(() => {})
  return pending
}
