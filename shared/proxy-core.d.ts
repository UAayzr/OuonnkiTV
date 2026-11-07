export interface ProxyErrorCause {
  name?: string
  code?: string
  message?: string
}

export interface ParsedProxyError {
  message: string
  cause?: ProxyErrorCause
}

export type CacheClass = 'json' | 'm3u8' | 'ts' | 'other'

export const CACHE_CLASS: {
  JSON: 'json'
  M3U8: 'm3u8'
  TS: 'ts'
  OTHER: 'other'
}

export interface CacheEntry {
  klass: CacheClass
  contentType: string | null
  size: number
  expiresAt: number
  lastAccess: number
  file?: string
  body?: unknown
}

export interface CacheStore {
  get(key: string): CacheEntry | null
  put(
    key: string,
    entry: {
      klass: CacheClass
      contentType: string | null
      body: Uint8Array | string
      size?: number
    },
  ): Promise<void>
  readBody(entry: CacheEntry): Promise<Buffer>
  stats(): { entries: number; totalBytes: number; tsCount: number }
}

export interface StreamWithCacheResult {
  fromCache: boolean
  status: number
  contentType: string | null
  klass: CacheClass | null
}

export function getProxyTimeoutMs(rawTimeout?: string | number | null | undefined): number
export function parseProxyError(error: unknown): ParsedProxyError
export function handleProxyRequest(targetUrl: string): Promise<Response>
export function getTargetUrl(url: string): string
export function classifyPlaybackUrl(targetUrl: string): CacheClass | null
export function classifyResponse(contentType?: string): CacheClass
export function createCacheStore(): CacheStore
export function getSharedCacheStore(): CacheStore
export function rewriteM3u8Uris(text: string, targetUrl: string, proxyBaseUrl: string): string
export function parseRangeHeader(range: string): { start: number | null; end: number | null } | null
export function streamWithCache(
  targetUrl: string,
  options: {
    range?: string
    proxyBaseUrl?: string
    onHeaders: (status: number, headers: Record<string, string>) => void
    onChunk: (chunk: Uint8Array | string) => void
    cache?: CacheStore
    signal?: AbortSignal
  },
): Promise<StreamWithCacheResult>