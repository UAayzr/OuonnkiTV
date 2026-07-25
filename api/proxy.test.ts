import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handler from './proxy'

function createResponse() {
  const headers = new Map<string, string>()
  let statusCode = 200
  let body: unknown
  const response = {
    setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
    status: vi.fn((code: number) => {
      statusCode = code
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
    end: vi.fn(() => response),
  }
  return {
    response: response as unknown as VercelResponse,
    getStatus: () => statusCode,
    getBody: () => body,
    headers,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Vercel 代理入口', () => {
  it('处理预检请求和缺少地址', async () => {
    const preflight = createResponse()
    await handler({ method: 'OPTIONS', query: {} } as VercelRequest, preflight.response)
    expect(preflight.getStatus()).toBe(200)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*')

    const missing = createResponse()
    await handler({ method: 'GET', query: {} } as VercelRequest, missing.response)
    expect(missing.getStatus()).toBe(400)
    expect(missing.getBody()).toEqual({ error: 'URL parameter is required' })
  })

  it('保留上游状态、内容类型和正文', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('upstream', { status: 206, headers: { 'content-type': 'application/x-mpegURL' } }),
      ),
    )
    const result = createResponse()

    await handler(
      { method: 'GET', query: { url: encodeURIComponent('https://example.com/video.m3u8') } } as VercelRequest,
      result.response,
    )

    expect(result.getStatus()).toBe(206)
    expect(result.getBody()).toBe('upstream')
    expect(result.headers.get('Content-Type')).toBe('application/x-mpegURL')
    expect(result.headers.get('Cache-Control')).toBe('public, max-age=60')
  })

  it('把请求失败转换成可读错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('network down'))))
    const result = createResponse()

    await handler(
      { method: 'GET', query: { url: encodeURIComponent('https://example.com') } } as VercelRequest,
      result.response,
    )

    expect(result.getStatus()).toBe(500)
    expect(result.getBody()).toMatchObject({
      error: 'Proxy request failed',
      message: 'network down',
      timeoutMs: 15000,
    })
  })
})
