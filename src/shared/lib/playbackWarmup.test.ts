import { afterEach, describe, expect, it, vi } from 'vitest'
import { warmNextEpisodeMaster, warmPlaybackChain } from './playbackWarmup'

afterEach(() => {
  vi.unstubAllGlobals()
})

const enc = encodeURIComponent

describe('playbackWarmup 暖链', () => {
  it('三级链:master→档位清单→首段分片,全部经代理,返回 true', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        calls.push(String(input))
        const proxyUrl = String(input)
        // 通过 /proxy?url= 参数拿目标 URL
        const target = decodeURIComponent(proxyUrl.split('url=')[1])
        if (target.endsWith('index.m3u8')) {
          return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\n3000k/hls/mixed.m3u8\n')
        }
        if (target.endsWith('mixed.m3u8')) {
          return new Response('#EXTM3U\n#EXTINF:10.0,\nseg-001.ts\n#EXT-X-ENDLIST\n')
        }
        return new Response('ts-bytes')
      }),
    )

    const ok = await warmPlaybackChain('https://cdn.example.com/s/index.m3u8', '/proxy?url=')

    expect(ok).toBe(true)
    expect(calls).toHaveLength(3)
    expect(calls[0]).toBe('/proxy?url=' + enc('https://cdn.example.com/s/index.m3u8'))
    expect(calls[1]).toBe('/proxy?url=' + enc('https://cdn.example.com/s/3000k/hls/mixed.m3u8'))
    expect(calls[2]).toBe('/proxy?url=' + enc('https://cdn.example.com/s/3000k/hls/seg-001.ts'))
  })

  it('首级失败返回 false(不继续)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    const ok = await warmPlaybackChain('https://cdn.example.com/s/index.m3u8', '/proxy?url=')
    expect(ok).toBe(false)
  })

  it('解析不到分片返回 false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('#EXTM3U\n#EXT-X-ENDLIST\n')),
    )
    const ok = await warmPlaybackChain('https://cdn.example.com/s/index.m3u8', '/proxy?url=')
    expect(ok).toBe(false)
  })

  it('网络异常静默失败返回 false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const ok = await warmPlaybackChain('https://cdn.example.com/s/index.m3u8', '/proxy?url=')
    expect(ok).toBe(false)
  })

  it('warmNextEpisodeMaster 只拉 master', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        calls.push(String(input))
        return new Response('#EXTM3U\n')
      }),
    )

    const ok = await warmNextEpisodeMaster('https://cdn.example.com/e2/index.m3u8', '/proxy?url=')

    expect(ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe('/proxy?url=' + enc('https://cdn.example.com/e2/index.m3u8'))
  })
})