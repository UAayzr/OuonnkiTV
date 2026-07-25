import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HandlerEvent, HandlerResponse } from '@netlify/functions'
import { handler } from './proxy'

afterEach(() => {
  vi.unstubAllGlobals()
})

function event(url?: string, method = 'GET') {
  return {
    httpMethod: method,
    queryStringParameters: url ? { url } : null,
  } as HandlerEvent
}

async function callHandler(input: HandlerEvent) {
  return (await handler(input, {} as never)) as HandlerResponse
}

describe('Netlify 代理入口', () => {
  it('处理预检请求和缺少地址', async () => {
    const preflight = await callHandler(event(undefined, 'OPTIONS'))
    expect(preflight.statusCode).toBe(200)

    const missing = await callHandler(event())
    expect(missing.statusCode).toBe(400)
    expect(JSON.parse(missing.body ?? '')).toEqual({ error: 'URL parameter is required' })
  })

  it('保留上游状态、内容类型和正文', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('netlify', { status: 202, headers: { 'content-type': 'application/json' } }),
      ),
    )

    const result = await callHandler(event('https://example.com/data'))
    expect(result.statusCode).toBe(202)
    expect(result.headers?.['Content-Type']).toBe('application/json')
    expect(result.body).toBe('netlify')
  })

  it('请求失败时返回标准错误正文', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    const result = await callHandler(event('https://example.com'))

    expect(result.statusCode).toBe(500)
    expect(JSON.parse(result.body ?? '')).toMatchObject({ message: 'offline', timeoutMs: 15000 })
  })
})
