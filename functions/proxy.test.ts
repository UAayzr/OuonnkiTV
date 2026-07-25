import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from './proxy'

afterEach(() => {
  vi.unstubAllGlobals()
})

function context(url: string, method = 'GET', env: unknown = {}) {
  return { request: new Request(url, { method }), env, params: {} }
}

describe('Cloudflare 代理入口', () => {
  it('处理预检请求和缺少地址', async () => {
    const preflight = await onRequest(context('https://site.example/proxy', 'OPTIONS'))
    expect(preflight.status).toBe(200)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*')

    const missing = await onRequest(context('https://site.example/proxy'))
    expect(missing.status).toBe(400)
    await expect(missing.json()).resolves.toEqual({ error: 'URL parameter is required' })
  })

  it('保留上游状态和返回头并补上跨域头', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('content', { status: 201, headers: { 'content-type': 'text/plain', 'x-upstream': 'yes' } }),
      ),
    )

    const response = await onRequest(
      context('https://site.example/proxy?url=https%3A%2F%2Fexample.com%2Fdata'),
    )

    expect(response.status).toBe(201)
    expect(response.headers.get('content-type')).toBe('text/plain')
    expect(response.headers.get('x-upstream')).toBe('yes')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    await expect(response.text()).resolves.toBe('content')
  })

  it('返回环境指定的超时时间', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('failed'))))
    const response = await onRequest(
      context('https://site.example/proxy?url=https%3A%2F%2Fexample.com', 'GET', {
        PROXY_TIMEOUT_MS: '2500',
      }),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({ message: 'failed', timeoutMs: 2500 })
  })
})
