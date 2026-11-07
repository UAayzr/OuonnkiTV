import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxyMiddleware } from './proxy.dev'

interface MockRequest {
  url?: string
  headers?: Record<string, string>
}

interface MockResponse {
  setHeader: (name: string, value: string) => void
  writeHead: (code: number, headers?: Record<string, string>) => void
  write: (chunk: unknown) => void
  end: (value?: string) => void
}

type Middleware = (req: MockRequest, res: MockResponse, next: () => void) => Promise<void> | void

afterEach(() => {
  vi.unstubAllGlobals()
})

function setupMiddleware() {
  let middleware: Middleware | undefined
  const server = {
    middlewares: {
      use: vi.fn((handler: typeof middleware) => {
        middleware = handler
      }),
    },
  }
  const configureServer = proxyMiddleware().configureServer
  if (typeof configureServer !== 'function') {
    throw new Error('configureServer hook was not callable')
  }
  configureServer(server as never)
  if (!middleware) throw new Error('middleware was not registered')
  return middleware
}

function createResponse() {
  const headers = new Map<string, string>()
  let status = 0
  const chunks: Buffer[] = []
  const response = {
    headersSent: false,
    setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
    writeHead: vi.fn((code: number, h?: Record<string, string>) => {
      response.headersSent = true
      status = code
      if (h) for (const [k, v] of Object.entries(h)) headers.set(k, v)
    }),
    write: vi.fn((chunk: unknown) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array))
    }),
    end: vi.fn((value?: string) => {
      if (value) chunks.push(Buffer.from(value))
    }),
    destroy: vi.fn(),
  }
  return {
    response,
    headers,
    getStatus: () => status,
    getBody: () => Buffer.concat(chunks).toString(),
  }
}

describe('本地开发代理入口', () => {
  it('非代理请求交给后续处理', async () => {
    const middleware = setupMiddleware()
    const next = vi.fn()
    await middleware({ url: '/assets/app.js' }, createResponse().response, next)
    expect(next).toHaveBeenCalled()
  })

  it('代理成功时保留状态、正文和内容类型(流式管道)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('local', { status: 203, headers: { 'content-type': 'text/plain' } }),
      ),
    )
    const middleware = setupMiddleware()
    const result = createResponse()

    await middleware(
      { url: '/proxy?url=https%3A%2F%2Fexample.com%2Fdata', headers: { host: 'localhost:3000' } },
      result.response,
      vi.fn(),
    )

    expect(result.getStatus()).toBe(203)
    expect(result.getBody()).toBe('local')
    expect(result.headers.get('Content-Type')).toBe('text/plain')
  })

  it('二次请求命中缓存不再回源', async () => {
    const fetchMock = vi.fn(async () => new Response('cached-body'))
    vi.stubGlobal('fetch', fetchMock)
    const middleware = setupMiddleware()
    const req = { url: '/proxy?url=https%3A%2F%2Fexample.com%2Fcached', headers: { host: 'localhost:3000' } }

    const first = createResponse()
    await middleware(req, first.response, vi.fn())
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const second = createResponse()
    await middleware(req, second.response, vi.fn())
    expect(second.getBody()).toBe('cached-body')
    expect(second.headers.get('X-Cache')).toBe('HIT')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('缺少地址时返回标准错误', async () => {
    const middleware = setupMiddleware()
    const result = createResponse()
    await middleware({ url: '/proxy', headers: { host: 'localhost:3000' } }, result.response, vi.fn())

    expect(result.getStatus()).toBe(500)
    expect(JSON.parse(result.getBody())).toMatchObject({
      error: 'Proxy request failed',
      message: 'URL parameter is required',
    })
  })

  it('响应头已发出后中途失败:断开连接,不再写 500(防 ERR_HTTP_HEADERS_SENT 崩溃)', async () => {
    // 制造「onHeaders 已调用、随后上游流中断」的上游行为
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([0x47, 0x40]))
            controller.error(new Error('upstream aborted'))
          },
        })
        return new Response(body, { headers: { 'content-type': 'video/mp2t' } })
      }),
    )
    const middleware = setupMiddleware()
    const result = createResponse()
    await middleware(
      { url: '/proxy?url=' + encodeURIComponent('https://cdn.example.com/hls/broken.ts'), headers: { host: 'localhost:3000' } },
      result.response,
      vi.fn(),
    )
    // 头在 onHeaders 阶段已发出(200),随后异常被吞,不再尝试写 500
    expect(result.getStatus()).toBe(200)
    expect(result.response.destroy).toHaveBeenCalled()
  })
})