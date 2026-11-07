/**
 * 统一代理核心逻辑（供 Vercel/Netlify/本地中间件复用）
 * 使用 JS 文件确保 Serverless 运行时可直接解析，不依赖 TS 源文件转译。
 *
 * 播放加速：在保留原有纯转发 handleProxyRequest 的同时，新增带缓存的
 * streamWithCache —— 按目标 URL 分类（json/m3u8/ts），磁盘 LRU 缓存 + 流式透传：
 * - 未命中：onHeaders 立即回调（客户端 TTFB = 上游 TTFB），分块 onChunk 透传，
 *   同时累积落盘（异步写，不阻塞响应）；全程二进制无损（不经 text()）。
 * - 命中：读缓存直接分块下发，X-Cache: HIT，毫秒级。
 * - Range：命中切片回 206；未命中透传上游且不写缓存（避免部分缓存碎片化）。
 * - m3u8：原始写盘，服务时经 rewriteM3u8Uris 重写子 URL 指向本代理（Safari
 *   原生播放链路也能进缓存）。
 */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const DEFAULT_PROXY_TIMEOUT_MS = 15000
const MIN_PROXY_TIMEOUT_MS = 1000
const MAX_PROXY_TIMEOUT_MS = 120000

export const CACHE_CLASS = {
  JSON: 'json',
  M3U8: 'm3u8',
  TS: 'ts',
  OTHER: 'other',
}

/** 各分类默认 TTL（秒），可用 PROXY_CACHE_TTL_<CLASS> 覆盖 */
const DEFAULT_CACHE_TTL = {
  [CACHE_CLASS.JSON]: 600,
  [CACHE_CLASS.M3U8]: 900,
  [CACHE_CLASS.TS]: 604800,
  [CACHE_CLASS.OTHER]: 60,
}

const DEFAULT_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024 // 2GB(磁盘)
const DEFAULT_TS_MAX_ENTRIES = 1500
const DEFAULT_TOTAL_MAX_ENTRIES = 3000
const DEFAULT_MEMORY_MAX_BYTES = 16 * 1024 * 1024 // 16MB(内存模式,dev/Serverless)
const READ_CHUNK_SIZE = 64 * 1024

/** 模块级 in-flight 去重表：同 URL 并发只回源一次（播放器 + 帧预览器重叠场景） */
const inflight = new Map()

function getEnvNumber(name, fallback) {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * 解析代理超时配置（毫秒）
 */
export function getProxyTimeoutMs(rawTimeout = process.env.PROXY_TIMEOUT_MS) {
  const parsed = Number(rawTimeout)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PROXY_TIMEOUT_MS
  }
  return Math.min(MAX_PROXY_TIMEOUT_MS, Math.max(MIN_PROXY_TIMEOUT_MS, Math.floor(parsed)))
}

/**
 * 解析 fetch 异常，尽量透传底层 cause 信息
 */
export function parseProxyError(error) {
  const payload = {
    message: error instanceof Error ? error.message : 'Unknown error',
  }

  if (!(error instanceof Error) || !error.cause || typeof error.cause !== 'object') {
    return payload
  }

  const cause = error.cause
  const parsedCause = {}

  if (typeof cause.name === 'string') {
    parsedCause.name = cause.name
  }
  if (typeof cause.code === 'string' || typeof cause.code === 'number') {
    parsedCause.code = String(cause.code)
  }
  if (typeof cause.message === 'string') {
    parsedCause.message = cause.message
  }

  if (Object.keys(parsedCause).length > 0) {
    payload.cause = parsedCause
  }

  return payload
}

/**
 * 纯转发（零缓存）。保留给 Vercel/Netlify 入口与兼容场景。
 */
export async function handleProxyRequest(targetUrl) {
  try {
    new URL(targetUrl)
  } catch {
    throw new Error('Invalid URL format')
  }

  const timeoutMs = getProxyTimeoutMs()
  return fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
}

export function getTargetUrl(url) {
  const urlObj = new URL(url, 'http://localhost')
  // searchParams.get 已按 URL 规范解码一次;目标 URL 内部若再有编码序列
  // (如查询参数值里的 %2F),不能再 decode,否则会把参数值解坏
  const targetUrl = urlObj.searchParams.get('url')
  if (!targetUrl) {
    throw new Error('URL parameter is required')
  }
  return targetUrl
}

/**
 * 按 URL 判定缓存分类：m3u8 / ts（播放链路），其余按响应头兜底为 json / other。
 */
export function classifyPlaybackUrl(targetUrl) {
  try {
    const pathname = new URL(targetUrl).pathname.toLowerCase()
    if (pathname.endsWith('.m3u8')) return CACHE_CLASS.M3U8
    if (pathname.endsWith('.ts')) return CACHE_CLASS.TS
  } catch {
    // 非法 URL 容错
  }
  return null
}

/**
 * 按响应 Content-Type 兜底分类（优先级低于 classifyPlaybackUrl 的 URL 判定）。
 */
export function classifyResponse(contentType = '') {
  const type = contentType.toLowerCase()
  if (
    type.includes('application/vnd.apple.mpegurl') ||
    type.includes('application/x-mpegurl') ||
    type.includes('application/mpegurl')
  ) {
    return CACHE_CLASS.M3U8
  }
  if (type.includes('video/mp2t') || type.includes('video/ts')) {
    return CACHE_CLASS.TS
  }
  if (type.includes('json')) {
    return CACHE_CLASS.JSON
  }
  return CACHE_CLASS.OTHER
}

const getTtlMs = klass =>
  getEnvNumber(`PROXY_CACHE_TTL_${klass.toUpperCase()}`, DEFAULT_CACHE_TTL[klass] ?? 60) * 1000

const hashKey = key => createHash('sha1').update(key).digest('hex')

/**
 * 创建缓存仓库。
 * - 未设置 PROXY_CACHE_DIR 时：内存仓库（dev / Serverless 场景，重启即空，
 *   简单 MRU 淘汰防止无限膨胀）。
 * - 设置了 PROXY_CACHE_DIR：磁盘仓库（索引 index.json + 按类子目录存正文），
 *   正文不常驻内存，512M 容器安全；重启时从 index.json 恢复。
 * 返回 { get, put, readBody, stats }。
 */
export function createCacheStore() {
  const diskDir = process.env.PROXY_CACHE_DIR || ''
  const maxBytes = getEnvNumber('PROXY_CACHE_MAX_BYTES', diskDir ? DEFAULT_CACHE_MAX_BYTES : DEFAULT_MEMORY_MAX_BYTES)
  const tsMaxEntries = getEnvNumber('PROXY_CACHE_TS_MAX_ENTRIES', DEFAULT_TS_MAX_ENTRIES)
  const totalMaxEntries = getEnvNumber('PROXY_CACHE_TOTAL_MAX_ENTRIES', DEFAULT_TOTAL_MAX_ENTRIES)

  /** key -> { klass, contentType, size, createdAt, lastAccess, expiresAt, file? body? } */
  const index = new Map()

  if (diskDir) {
    // 启动时异步加载历史索引（失败静默，缓存从零开始可接受）
    const indexPath = path.join(diskDir, 'index.json')
    void fs
      .readFile(indexPath, 'utf8')
      .then(text => {
        try {
          const loaded = JSON.parse(text)
          if (!loaded || typeof loaded !== 'object') return
          for (const [key, entry] of Object.entries(loaded)) {
            if (entry && typeof entry === 'object' && entry.klass && entry.file) {
              // 文件可能已被淘汰删除,保留无害(读失败即缓存 miss)
              index.set(key, entry)
            }
          }
        } catch {
          /* 损坏索引直接放弃 */
        }
      })
      .catch(() => {
        /* 无历史索引 */
      })
  }

  let writeIndexTimer = null
  const persistIndex = () => {
    if (!diskDir) return
    // 节流聚合写盘（缓存写入峰值时多次 put/touch 只落一次）
    if (writeIndexTimer) return
    writeIndexTimer = setTimeout(() => {
      writeIndexTimer = null
      const payload = {}
      for (const [key, entry] of index.entries()) {
        payload[key] = entry
      }
      const indexPath = path.join(diskDir, 'index.json')
      const tmpPath = `${indexPath}.tmp-${process.pid}-${Date.now()}`
      void fs
        .writeFile(tmpPath, JSON.stringify(payload))
        .then(() => fs.rename(tmpPath, indexPath))
        .catch(() => fs.rm(tmpPath, { force: true }).catch(() => {}))
    }, 200)
  }

  const entryFilePath = (klass, key) => path.join(diskDir, klass, `${hashKey(key)}.bin`)

  /** 淘汰:按 lastAccess 升序,直到总字节 / 总数 / ts 条数均达标 */
  const evictIfNeeded = () => {
    let totalBytes = 0
    let tsCount = 0
    for (const entry of index.values()) {
      totalBytes += entry.size || 0
      if (entry.klass === CACHE_CLASS.TS) tsCount += 1
    }
    if (totalBytes <= maxBytes && index.size <= totalMaxEntries && tsCount <= tsMaxEntries) {
      return
    }

    const ordered = [...index.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess)
    for (const [key, entry] of ordered) {
      if (totalBytes <= maxBytes && index.size <= totalMaxEntries && tsCount <= tsMaxEntries) {
        break
      }
      totalBytes -= entry.size || 0
      if (entry.klass === CACHE_CLASS.TS) tsCount -= 1
      index.delete(key)
      if (entry.file) void fs.rm(entry.file, { force: true }).catch(() => {})
    }
    persistIndex()
  }

  return {
    get(key) {
      const entry = index.get(key)
      if (!entry) return null
      if (Date.now() > entry.expiresAt) {
        index.delete(key)
        if (entry.file) void fs.rm(entry.file, { force: true }).catch(() => {})
        persistIndex()
        return null
      }
      entry.lastAccess = Date.now()
      return entry
    },
    async put(key, { klass, contentType, body, size }) {
      const expiresAt = Date.now() + getTtlMs(klass)
      if (diskDir) {
        const dir = path.join(diskDir, klass)
        await fs.mkdir(dir, { recursive: true })
        const file = entryFilePath(klass, key)
        await fs.writeFile(file, body)
        index.set(key, {
          klass,
          contentType,
          size: size ?? (body ? body.byteLength || body.length : 0),
          createdAt: Date.now(),
          lastAccess: Date.now(),
          expiresAt,
          file,
        })
      } else {
        index.set(key, {
          klass,
          contentType,
          size: size ?? (body ? body.byteLength || body.length : 0),
          createdAt: Date.now(),
          lastAccess: Date.now(),
          expiresAt,
          body,
        })
      }
      // 两种模式统一在写入后按容量/条数淘汰(磁盘模式此前漏调,缓存会无限增长)
      evictIfNeeded()
      persistIndex()
    },
    async readBody(entry) {
      if (entry.body) return entry.body
      return fs.readFile(entry.file)
    },
    stats() {
      let totalBytes = 0
      let tsCount = 0
      for (const entry of index.values()) {
        totalBytes += entry.size || 0
        if (entry.klass === CACHE_CLASS.TS) tsCount += 1
      }
      return { entries: index.size, totalBytes, tsCount }
    },
  }
}

/** 模块级默认仓库（进程内共享),dev/Serverless 内存模式,生产磁盘模式由 env 决定 */
let sharedStore = null
export function getSharedCacheStore() {
  if (!sharedStore) sharedStore = createCacheStore()
  return sharedStore
}

const normalizeProxyBase = base => String(base || '').replace(/\/+$/, '')

/**
 * m3u8 内容重写:把子资源地址包上代理前缀,使播放器(含 Safari 原生等无 loader
 * 可挂的路径)对子清单/分片/加密 key 的请求也走本代理(进缓存)。
 * - 独立 URI 行(非 # 开头):整行重写
 * - 含 URI="..." 参数的 #EXT 行(KEY 加密密钥 / MEDIA 音轨字幕 / MAP 初始化片段):
 *   重写引号内的地址。若只跳过 # 行,主清单被包进 /proxy 后相对基失效,
 *   这些子资源会解析到错误地址。
 * 其余注释行原样保留;无法解析的 URI 原样保留。
 */
export function rewriteM3u8Uris(text, targetUrl, proxyBaseUrl) {
  const base = (() => {
    try {
      return new URL(targetUrl)
    } catch {
      return null
    }
  })()
  if (!base) return text
  const proxyPrefix = `${normalizeProxyBase(proxyBaseUrl)}/proxy?url=`

  /** 把一个 URI(相对或绝对)解析成代理 URL;解析失败或已是代理 URL 则原样返回 */
  const rewriteUri = uri => {
    let absolute
    try {
      absolute = new URL(uri, base).href
    } catch {
      return uri
    }
    if (absolute.includes('/proxy?url=')) return uri
    return `${proxyPrefix}${encodeURIComponent(absolute)}`
  }

  return text
    .split(/\r?\n/)
    .map(line => {
      const trimmed = line.trim()
      // 独立 URI 行:整行重写
      if (trimmed && !trimmed.startsWith('#')) {
        return line.replace(trimmed, rewriteUri(trimmed))
      }
      // #EXT 行内的 URI="..." 参数(KEY/MEDIA/MAP 等):只重写引号内的地址
      if (trimmed.startsWith('#EXT') && trimmed.includes('URI=')) {
        return line.replace(/URI="([^"]*)"/, (_match, uri) => `URI="${rewriteUri(uri)}"`)
      }
      return line
    })
    .join('\n')
}

/**
 * 解析 Range 请求头,返回 { start, end }(含 end)或 null
 */
export function parseRangeHeader(range) {
  if (!range || typeof range !== 'string') return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  if (!match) return null
  const [, startStr, endStr] = match
  if (startStr === '' && endStr === '') return null
  return {
    start: startStr === '' ? null : Number(startStr),
    end: endStr === '' ? null : Number(endStr),
  }
}

/**
 * 按 Range 切 Buffer,返回切片与状态:
 * { status, start, end, total, body } —— 可满足时 status 206,越界 416。
 */
function sliceBody(body, range) {
  const total = body.length
  const parsed = parseRangeHeader(range)
  if (!parsed || total === 0) {
    return { status: 200, body, start: 0, end: total - 1, total }
  }
  const { start, end } = parsed
  let startIdx = start ?? 0
  let endIdx = end ?? total - 1
  if (start === null && end !== null) {
    // suffix range: bytes=-N,取末尾 N 字节
    startIdx = Math.max(0, total - end)
    endIdx = total - 1
  }
  if (startIdx >= total || endIdx < startIdx) {
    return { status: 416, body: Buffer.alloc(0), start, end, total }
  }
  endIdx = Math.min(endIdx, total - 1)
  return { status: 206, body: body.subarray(startIdx, endIdx + 1), start: startIdx, end: endIdx, total }
}

/**
 * 带缓存的流式代理 —— 播放加速核心管道。
 *
 * @param {string} targetUrl 上游目标地址
 * @param {object} options
 * @param {string} [options.range] 请求的 Range 头(原样)
 * @param {string} [options.proxyBaseUrl] 代理在公网的源(protocol+host),m3u8 重写用
 * @param {(status: number, headers: Record<string,string>) => void} options.onHeaders 响应头回调(TTFB 时机)
 * @param {(chunk: Uint8Array|string) => void} options.onChunk 响应体分块回调(文本类传 string)
 * @param {ReturnType<typeof createCacheStore>} [options.cache] 默认进程级共享仓库
 * @param {AbortSignal} [options.signal] 客户端断开时中止上游
 * @returns {Promise<{ fromCache: boolean, status: number, contentType: string|null, klass: string|null }>}
 */
export async function streamWithCache(targetUrl, options = {}) {
  const { range, proxyBaseUrl, onHeaders, onChunk, signal } = options
  const cache = options.cache || getSharedCacheStore()

  let urlObj
  try {
    urlObj = new URL(targetUrl)
  } catch {
    throw new Error('Invalid URL format')
  }
  const key = urlObj.href

  /** 只做响应分块的下发:文本一次给,二进制按 64KB 分块给(Uint8Array,Buffer 是它的子类) */
  const emitBody = (body, status, headers) => {
    onHeaders(status, headers)
    if (typeof body === 'string') {
      onChunk(body)
      return
    }
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(body ?? [])
    for (let offset = 0; offset < bytes.length; offset += READ_CHUNK_SIZE) {
      onChunk(bytes.subarray(offset, Math.min(offset + READ_CHUNK_SIZE, bytes.length)))
    }
  }

  /** 命中缓存:读正文直接下发(X-Cache: HIT),m3u8 按当前部署基址重写子 URL */
  const serveFromCache = async () => {
    const entry = cache.get(key)
    if (!entry) return null
    const raw = await cache.readBody(entry)

    const headersBase = {
      'Content-Type': entry.contentType || 'application/octet-stream',
      'Cache-Control': entry.klass === CACHE_CLASS.TS ? 'public, max-age=3600' : 'no-cache',
      'Accept-Ranges': 'bytes',
      'X-Cache': 'HIT',
    }

    // m3u8 重写:让原生播放器(Safari 等无 loader 可挂的路径)的子请求也走本代理
    if (entry.klass === CACHE_CLASS.M3U8 && proxyBaseUrl && process.env.PROXY_M3U8_REWRITE !== 'off') {
      const rewritten = rewriteM3u8Uris(raw.toString('utf8'), key, proxyBaseUrl)
      emitBody(rewritten, 200, {
        ...headersBase,
        'Content-Length': String(Buffer.byteLength(rewritten)),
      })
      return { fromCache: true, status: 200, contentType: entry.contentType, klass: entry.klass }
    }

    // 无 Range 整包下发;带 Range 从缓存正文切片回 206
    const sliced = range ? sliceBody(raw, range) : { status: 200, body: raw, start: 0, end: raw.length - 1, total: raw.length }
    if (sliced.status === 416) {
      onHeaders(416, {
        'Content-Type': entry.contentType || 'application/octet-stream',
        'Content-Range': `bytes */${raw.length}`,
        'X-Cache': 'HIT',
      })
      return { fromCache: true, status: 416, contentType: entry.contentType, klass: entry.klass }
    }
    emitBody(sliced.body, sliced.status, {
      ...headersBase,
      'Content-Length': String(sliced.body.length),
      ...(sliced.status === 206 ? { 'Content-Range': `bytes ${sliced.start}-${sliced.end}/${sliced.total}` } : {}),
    })
    return { fromCache: true, status: sliced.status, contentType: entry.contentType, klass: entry.klass }
  }

  // 第一优先:命中缓存直接返回
  const hit = await serveFromCache()
  if (hit) return hit

  // 第二优先:同一 URL 并发请求已在进行(播放器与帧预览器会重叠),等它完成直接从缓存取
  if (inflight.has(key)) {
    try {
      await inflight.get(key)
    } catch {
      // 发起者失败,忽略,继续走本请求回源
    }
    const afterWait = await serveFromCache()
    if (afterWait) return afterWait
  }

  const timeoutMs = getProxyTimeoutMs()
  const upstreamHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
  }
  if (range) upstreamHeaders.Range = range

  const upstreamPromise = (async () => {
    const signals = [AbortSignal.timeout(timeoutMs)]
    if (signal) signals.push(signal)
    const response = await fetch(targetUrl, { headers: upstreamHeaders, signal: AbortSignal.any(signals) })
    const status = response.status
    const contentType = response.headers.get('content-type') || null
    const urlClass = classifyPlaybackUrl(targetUrl)
    const klass = urlClass || classifyResponse(contentType || '')

    // 非 2xx、带 Range 的请求:原样透传上游,不写缓存(部分响应会碎片化缓存)
    if (status < 200 || status >= 300 || range) {
      onHeaders(status, {
        'Content-Type': contentType || 'application/octet-stream',
        'X-Cache': 'MISS',
        'Accept-Ranges': 'bytes',
        ...(response.headers.get('content-length')
          ? { 'Content-Length': response.headers.get('content-length') }
          : {}),
      })
      await passStream(response, onChunk)
      return { fromCache: false, status, contentType, klass: klass || null }
    }

    // m3u8 是文本:整体读入、按需重写子 URL 后再下发,同时把原始文本写进缓存
    if (klass === CACHE_CLASS.M3U8) {
      const text = await response.text()
      const finalText =
        proxyBaseUrl && process.env.PROXY_M3U8_REWRITE !== 'off'
          ? rewriteM3u8Uris(text, key, proxyBaseUrl)
          : text
      onHeaders(status, {
        'Content-Type': contentType || 'application/vnd.apple.mpegurl',
        'Content-Length': String(Buffer.byteLength(finalText)),
        'Cache-Control': 'no-cache',
        'Accept-Ranges': 'bytes',
        'X-Cache': 'MISS',
      })
      onChunk(finalText)
      await cache.put(key, { klass, contentType, body: Buffer.from(text, 'utf8') })
      return { fromCache: false, status, contentType, klass }
    }

    // 其余二进制(分片/JSON):边透传边累积,完成后异步落盘(等写盘不阻塞响应收尾)
    const chunks = []
    let totalSize = 0
    onHeaders(status, {
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': klass === CACHE_CLASS.TS ? 'public, max-age=3600' : 'no-cache',
      'Accept-Ranges': 'bytes',
      'X-Cache': 'MISS',
    })
    await passStream(response, chunk => {
      totalSize += chunk.byteLength || chunk.length || 0
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      onChunk(chunk)
    })
    if (totalSize > 0) {
      await cache.put(key, { klass, contentType, body: Buffer.concat(chunks) })
    }
    return { fromCache: false, status, contentType, klass }
  })()

  inflight.set(key, upstreamPromise)
  try {
    return await upstreamPromise
  } finally {
    inflight.delete(key)
  }
}

async function passStream(response, onChunk) {
  if (!response.body) return
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      onChunk(value)
    }
  } finally {
    // 读流中途抛错(上游中断)也要释放 reader,避免连接泄漏
    reader.releaseLock()
  }
}