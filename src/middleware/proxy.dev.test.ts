import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxyMiddleware } from './proxy.dev'

interface MockRequest {
  url?: string
}

interface MockResponse {
  setHeader: (name: string, value: string) => void
  writeHead: (code: number, headers?: Record<string, string>) => void
  end: (value: string) => void
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
  let body = ''
  return {
    response: {
      setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
      writeHead: vi.fn((code: number) => {
        status = code
      }),
      end: vi.fn((value: string) => {
        body = value
      }),
    },
    headers,
    getStatus: () => status,
    getBody: () => body,
  }
}

describe('本地开发代理入口', () => {
  it('非代理请求交给后续处理', async () => {
    const middleware = setupMiddleware()
    const next = vi.fn()
    await middleware({ url: '/assets/app.js' }, createResponse().response, next)
    expect(next).toHaveBeenCalled()
  })

  it('代理成功时保留状态、正文和内容类型', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('local', { status: 203, headers: { 'content-type': 'text/plain' } }),
      ),
    )
    const middleware = setupMiddleware()
    const result = createResponse()

    await middleware(
      { url: '/proxy?url=https%3A%2F%2Fexample.com%2Fdata' },
      result.response,
      vi.fn(),
    )

    expect(result.getStatus()).toBe(203)
    expect(result.getBody()).toBe('local')
    expect(result.headers.get('Content-Type')).toBe('text/plain')
  })

  it('缺少地址时返回标准错误', async () => {
    const middleware = setupMiddleware()
    const result = createResponse()
    await middleware({ url: '/proxy' }, result.response, vi.fn())

    expect(result.getStatus()).toBe(500)
    expect(JSON.parse(result.getBody())).toMatchObject({
      error: 'Proxy request failed',
      message: 'URL parameter is required',
    })
  })
})
