import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface ProxyServerResponse {
  setHeader: (name: string, value: string) => void
  status: (code: number) => ProxyServerResponse
  json: (value: unknown) => ProxyServerResponse
  write: (value: unknown) => void
  end: () => void
  destroy: () => void
}

type RouteHandler = (
  req: {
    query: Record<string, string | undefined>
    headers: Record<string, string | undefined>
    protocol: string
    get: (name: string) => string | undefined
    on: (event: string, cb: () => void) => void
  },
  res: ProxyServerResponse,
) => Promise<unknown>

const mocks = vi.hoisted(() => ({
  routeHandler: undefined as RouteHandler | undefined,
  use: vi.fn(),
  get: vi.fn(),
  listen: vi.fn(),
  streamWithCache: vi.fn(),
  parseProxyError: vi.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : 'Unknown error',
  })),
  getProxyTimeoutMs: vi.fn(() => 15000),
}))

vi.mock('express', () => ({
  default: () => ({
    use: mocks.use,
    get: mocks.get.mockImplementation((_path: string, handler: RouteHandler) => {
      mocks.routeHandler = handler
    }),
    listen: mocks.listen,
  }),
}))

vi.mock('cors', () => ({ default: () => 'cors-middleware' }))
vi.mock('./shared/proxy-core.js', () => ({
  streamWithCache: mocks.streamWithCache,
  parseProxyError: mocks.parseProxyError,
  getProxyTimeoutMs: mocks.getProxyTimeoutMs,
}))

function createResponse() {
  let status = 200
  let body: unknown
  const headers = new Map<string, string>()
  let ended = false
  const response = {
    setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
    status: vi.fn((code: number) => {
      status = code
      return response
    }),
    json: vi.fn((value: unknown) => {
      body = value
      return response
    }),
    write: vi.fn((value: unknown) => {
      body = value
    }),
    end: vi.fn(() => {
      ended = true
    }),
    destroy: vi.fn(),
  }
  return {
    response,
    getStatus: () => status,
    getBody: () => body,
    headers,
    isEnded: () => ended,
  }
}

// 模拟真实 express 的 req.query:已按 URL 规范解码过一次(不再传编码值)
const defaultReq = {
  query: { url: 'https://example.com/video.ts' },
  headers: {},
  protocol: 'https',
  get: (name: string) => (name === 'host' ? 'uaayzr.dpdns.org' : undefined),
  on: () => {},
}

beforeAll(async () => {
  await import('./proxy-server.js')
})

beforeEach(() => {
  mocks.streamWithCache.mockReset()
})

describe('Docker 代理入口', () => {
  it('注册可执行的代理路由', () => {
    expect(mocks.routeHandler).toEqual(expect.any(Function))
  })

  it('缺少地址时返回 400', async () => {
    const result = createResponse()
    await mocks.routeHandler?.({ ...defaultReq, query: {} }, result.response)
    expect(result.getStatus()).toBe(400)
    expect(result.getBody()).toEqual({ error: 'URL parameter is required' })
  })

  it('成功时透传状态、头与二进制正文(流式管道)', async () => {
    const tsBytes = Buffer.from([0x47, 0x40, 0x11, 0x10, 0xff, 0x00, 0x9b])
    mocks.streamWithCache.mockImplementation(
      async (
        _targetUrl: string,
        {
          onHeaders,
          onChunk,
        }: {
          onHeaders: (status: number, headers: Record<string, string>) => void
          onChunk: (chunk: Uint8Array) => void
        },
      ) => {
        onHeaders(200, { 'Content-Type': 'video/mp2t', 'X-Cache': 'MISS' })
        onChunk(tsBytes)
        return { fromCache: false, status: 200, contentType: 'video/mp2t', klass: 'ts' }
      },
    )

    const result = createResponse()
    await mocks.routeHandler?.(defaultReq, result.response)

    expect(result.getStatus()).toBe(200)
    expect(result.headers.get('Content-Type')).toBe('video/mp2t')
    expect(result.headers.get('X-Cache')).toBe('MISS')
    // 二进制原样(0x47 = TS sync byte),无 text() 破坏
    expect(Buffer.isBuffer(result.getBody())).toBe(true)
    expect((result.getBody() as Buffer).equals(tsBytes)).toBe(true)
    expect(result.isEnded()).toBe(true)
  })

  it('命中缓存时透传 X-Cache: HIT', async () => {
    mocks.streamWithCache.mockImplementation(
      async (
        _targetUrl: string,
        {
          onHeaders,
          onChunk,
        }: {
          onHeaders: (status: number, headers: Record<string, string>) => void
          onChunk: (chunk: Uint8Array) => void
        },
      ) => {
        onHeaders(200, { 'X-Cache': 'HIT' })
        onChunk(Buffer.from('cached'))
        return { fromCache: true, status: 200, contentType: null, klass: null }
      },
    )

    const result = createResponse()
    await mocks.routeHandler?.(defaultReq, result.response)

    expect(result.headers.get('X-Cache')).toBe('HIT')
    expect(result.getBody()).toEqual(Buffer.from('cached'))
  })

  it('转发请求 Range 与代理基址(m3u8 重写用)', async () => {
    let captured: Record<string, unknown> = {}
    mocks.streamWithCache.mockImplementation(
      async (targetUrl: string, options: Record<string, unknown>) => {
        captured = { targetUrl, ...options }
        return { fromCache: false, status: 200, contentType: null, klass: null }
      },
    )

    const result = createResponse()
    await mocks.routeHandler?.(
      {
        ...defaultReq,
        headers: { range: 'bytes=0-1023' },
        get: (name: string) => (name === 'host' ? 'uaayzr.dpdns.org' : undefined),
      },
      result.response,
    )

    expect(captured.targetUrl).toBe('https://example.com/video.ts')
    expect(captured.range).toBe('bytes=0-1023')
    expect(captured.proxyBaseUrl).toBe('https://uaayzr.dpdns.org')
  })

  it('失败时返回统一错误结构', async () => {
    mocks.streamWithCache.mockRejectedValue(new Error('docker offline'))
    const result = createResponse()
    await mocks.routeHandler?.(defaultReq, result.response)

    expect(result.getStatus()).toBe(500)
    expect(result.getBody()).toMatchObject({
      error: 'Proxy request failed',
      message: 'docker offline',
      timeoutMs: 15000,
    })
  })
})