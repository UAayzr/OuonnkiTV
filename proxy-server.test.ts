import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface ProxyServerResponse {
  setHeader: (name: string, value: string) => void
  status: (code: number) => ProxyServerResponse
  json: (value: unknown) => ProxyServerResponse
  send: (value: unknown) => ProxyServerResponse
}

type RouteHandler = (
  req: { query: Record<string, string | undefined> },
  res: ProxyServerResponse,
) => Promise<unknown>

const mocks = vi.hoisted(() => ({
  routeHandler: undefined as RouteHandler | undefined,
  use: vi.fn(),
  get: vi.fn(),
  listen: vi.fn(),
  handleProxyRequest: vi.fn(),
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
  handleProxyRequest: mocks.handleProxyRequest,
  parseProxyError: mocks.parseProxyError,
  getProxyTimeoutMs: mocks.getProxyTimeoutMs,
}))

function createResponse() {
  let status = 200
  let body: unknown
  const headers = new Map<string, string>()
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
    send: vi.fn((value: unknown) => {
      body = value
      return response
    }),
  }
  return { response, getStatus: () => status, getBody: () => body, headers }
}

beforeAll(async () => {
  await import('./proxy-server.js')
})

beforeEach(() => {
  mocks.handleProxyRequest.mockReset()
})

describe('Docker 代理入口', () => {
  it('注册可执行的代理路由', () => {
    expect(mocks.routeHandler).toEqual(expect.any(Function))
  })

  it('缺少地址时返回 400', async () => {
    const result = createResponse()
    await mocks.routeHandler?.({ query: {} }, result.response)
    expect(result.getStatus()).toBe(400)
    expect(result.getBody()).toEqual({ error: 'URL parameter is required' })
  })

  it('成功时保留状态、内容类型和正文', async () => {
    mocks.handleProxyRequest.mockResolvedValue(
      new Response('docker', { status: 206, headers: { 'content-type': 'video/mp2t' } }),
    )
    const result = createResponse()
    await mocks.routeHandler?.(
      { query: { url: encodeURIComponent('https://example.com/video.ts') } },
      result.response,
    )

    expect(result.getStatus()).toBe(206)
    expect(result.getBody()).toBe('docker')
    expect(result.headers.get('Content-Type')).toBe('video/mp2t')
  })

  it('失败时返回统一错误结构', async () => {
    mocks.handleProxyRequest.mockRejectedValue(new Error('docker offline'))
    const result = createResponse()
    await mocks.routeHandler?.(
      { query: { url: encodeURIComponent('https://example.com') } },
      result.response,
    )

    expect(result.getStatus()).toBe(500)
    expect(result.getBody()).toMatchObject({
      error: 'Proxy request failed',
      message: 'docker offline',
      timeoutMs: 15000,
    })
  })
})
