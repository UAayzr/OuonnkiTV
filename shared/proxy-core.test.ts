import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getProxyTimeoutMs,
  getTargetUrl,
  handleProxyRequest,
  parseProxyError,
} from './proxy-core.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('统一代理核心', () => {
  it('读取并限制超时时间范围', () => {
    expect(getProxyTimeoutMs(undefined)).toBe(15000)
    expect(getProxyTimeoutMs('100')).toBe(1000)
    expect(getProxyTimeoutMs('2500.9')).toBe(2500)
    expect(getProxyTimeoutMs('999999')).toBe(120000)
    expect(getProxyTimeoutMs('not-number')).toBe(15000)
  })

  it('从请求地址提取目标地址', () => {
    expect(getTargetUrl('/proxy?url=https%3A%2F%2Fexample.com%2Fapi')).toBe('https://example.com/api')
    expect(() => getTargetUrl('/proxy')).toThrow('URL parameter is required')
  })

  it('保留底层错误说明', () => {
    const error = new Error('fetch failed', {
      cause: { name: 'ConnectTimeoutError', code: 'UND_ERR_CONNECT_TIMEOUT', message: 'timeout' },
    })
    expect(parseProxyError(error)).toEqual({
      message: 'fetch failed',
      cause: {
        name: 'ConnectTimeoutError',
        code: 'UND_ERR_CONNECT_TIMEOUT',
        message: 'timeout',
      },
    })
    expect(parseProxyError('bad')).toEqual({ message: 'Unknown error' })
  })

  it('拒绝错误地址，并用固定请求头访问合法地址', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(handleProxyRequest('not-a-url')).rejects.toThrow('Invalid URL format')
    await expect(handleProxyRequest('https://example.com/data')).resolves.toBeInstanceOf(Response)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/data',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json, text/plain, */*' }),
        signal: expect.any(AbortSignal),
      }),
    )
  })
})
