import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  classifyPlaybackUrl,
  classifyResponse,
  createCacheStore,
  CACHE_CLASS,
  getProxyTimeoutMs,
  getTargetUrl,
  handleProxyRequest,
  parseProxyError,
  rewriteM3u8Uris,
  streamWithCache,
} from './proxy-core.js'

/** 本轮测试用到的临时目录(磁盘模式用例) */
let tempDirs: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  // 清理磁盘模式用例的临时目录
  await Promise.all(tempDirs.map(dir => fs.rm(dir, { recursive: true, force: true })))
  tempDirs = []
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

  it('目标 URL 含编码参数时只解码一次,不解坏参数值', () => {
    // searchParams.get 已解码一次;参数值里的 %E4%B8%AD(中)不能再被二次解码
    expect(getTargetUrl('/proxy?url=' + encodeURIComponent('https://example.com/api?q=%E4%B8%AD'))).toBe(
      'https://example.com/api?q=%E4%B8%AD',
    )
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

describe('播放链路分类', () => {
  it('按 URL 后缀分类 m3u8 / ts', () => {
    expect(classifyPlaybackUrl('https://cdn.example.com/s1/index.m3u8')).toBe(CACHE_CLASS.M3U8)
    expect(classifyPlaybackUrl('https://cdn.example.com/3000k/hls/mixed.m3u8?token=1')).toBe(
      CACHE_CLASS.M3U8,
    )
    expect(classifyPlaybackUrl('https://cdn.example.com/hls/abc123.ts')).toBe(CACHE_CLASS.TS)
    expect(classifyPlaybackUrl('https://cdn.example.com/abc.ts?r=1')).toBe(CACHE_CLASS.TS)
    expect(classifyPlaybackUrl('https://cdn.example.com/api.php?ac=detail')).toBeNull()
  })

  it('按响应头兜底分类', () => {
    expect(classifyResponse('application/vnd.apple.mpegurl')).toBe(CACHE_CLASS.M3U8)
    expect(classifyResponse('video/mp2t')).toBe(CACHE_CLASS.TS)
    expect(classifyResponse('application/json; charset=utf-8')).toBe(CACHE_CLASS.JSON)
    expect(classifyResponse('text/html')).toBe(CACHE_CLASS.OTHER)
  })
})

describe('m3u8 内容重写', () => {
  const sample = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=800000',
    '3000k/hls/mixed.m3u8',
    '#EXTINF:10.0,',
    '/20261101/41978_249e668a/seg.ts',
    'https://vip.dytt-network.com/x/y.ts',
    '',
  ].join('\n')

  it('相对与绝对 URI 都重写为同源代理 URL,注释行不动', () => {
    const out = rewriteM3u8Uris(
      sample,
      'https://vip.dytt-network.com/20261101/41978_249e668a/index.m3u8',
      'https://uaayzr.dpdns.org',
    )
    const lines = out.split('\n')
    expect(lines[0]).toBe('#EXTM3U')
    expect(lines[1]).toContain('#EXT-X-STREAM-INF')
    expect(lines[2]).toBe(
      'https://uaayzr.dpdns.org/proxy?url=' +
        encodeURIComponent('https://vip.dytt-network.com/20261101/41978_249e668a/3000k/hls/mixed.m3u8'),
    )
    // 以 / 开头的绝对路径按目标源 resolve
    expect(lines[4]).toBe(
      'https://uaayzr.dpdns.org/proxy?url=' +
        encodeURIComponent('https://vip.dytt-network.com/20261101/41978_249e668a/seg.ts'),
    )
    expect(lines[5]).toBe(
      'https://uaayzr.dpdns.org/proxy?url=' + encodeURIComponent('https://vip.dytt-network.com/x/y.ts'),
    )
    expect(lines[6]).toBe('')
  })

  it('已是代理前缀的 URL 不重复包裹', () => {
    const proxied =
      'https://uaayzr.dpdns.org/proxy?url=' +
      encodeURIComponent('https://vip.dytt-network.com/x/seg.ts')
    const out = rewriteM3u8Uris(proxied, 'https://vip.dytt-network.com/index.m3u8', 'https://uaayzr.dpdns.org')
    expect(out).toBe(proxied)
  })

  it('无法解析目标源时原样返回', () => {
    const text = '#EXTM3U\nnot-a-url\n'
    expect(rewriteM3u8Uris(text, 'bad-url', 'https://x.com')).toBe(text)
  })

  it('重写 #EXT-X-KEY 引号内的 URI(AES-128 加密流的解密密钥,相对基失效修复)', () => {
    const input = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x00000000000000000000000000000000',
      '#EXTINF:7.750000,',
      'plist0.ts',
    ].join('\n')
    const out = rewriteM3u8Uris(
      input,
      'https://vv.jisuzyv.com/play/dJ68NQ9d/index.m3u8',
      'https://uaayzr.dpdns.org',
    )
    const lines = out.split('\n')
    // 相对 URI 按 URL 规范解析(目录 = 清单所在目录 /play/dJ68NQ9d/)
    expect(lines[1]).toBe(
      '#EXT-X-KEY:METHOD=AES-128,URI="https://uaayzr.dpdns.org/proxy?url=' +
        encodeURIComponent('https://vv.jisuzyv.com/play/dJ68NQ9d/enc.key') +
        '",IV=0x00000000000000000000000000000000',
    )
    // 独立 URI 行(分片)同样重写,且同样按清单目录解析
    expect(lines[3]).toBe(
      'https://uaayzr.dpdns.org/proxy?url=' +
        encodeURIComponent('https://vv.jisuzyv.com/play/dJ68NQ9d/plist0.ts'),
    )
    // #EXTINF 行原样保留
    expect(lines[2]).toBe('#EXTINF:7.750000,')
  })

  it('KEY 的 URI 已是代理地址时不重复包裹', () => {
    const input =
      '#EXT-X-KEY:METHOD=AES-128,URI="https://uaayzr.dpdns.org/proxy?url=' +
      encodeURIComponent('https://vv.jisuzyv.com/play/enc.key') +
      '",IV=0x0'
    const out = rewriteM3u8Uris(
      input,
      'https://vv.jisuzyv.com/play/dJ68NQ9d/index.m3u8',
      'https://uaayzr.dpdns.org',
    )
    expect(out).toBe(input)
  })
})

describe('缓存仓库', () => {
  it('内存模式:写入可读,TTL 过期后失效', async () => {
    vi.stubEnv('PROXY_CACHE_TTL_JSON', '0.01') // 10ms
    const store = createCacheStore()
    await store.put('https://x.com/a.json', {
      klass: CACHE_CLASS.JSON,
      contentType: 'application/json',
      body: Buffer.from('{"a":1}'),
    })
    expect(store.get('https://x.com/a.json')).not.toBeNull()
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(store.get('https://x.com/a.json')).toBeNull()
  })

  it('内存模式:条目上限淘汰最久未访问的', () => {
    vi.stubEnv('PROXY_CACHE_TOTAL_MAX_ENTRIES', '2')
    const store = createCacheStore()
    void store.put('https://x.com/1.ts', { klass: CACHE_CLASS.TS, contentType: 'video/mp2t', body: Buffer.from('a') })
      .then(() => store.get('https://x.com/1.ts'))
      .then(() => store.put('https://x.com/2.ts', { klass: CACHE_CLASS.TS, contentType: 'video/mp2t', body: Buffer.from('b') }))
      .then(() => store.put('https://x.com/3.ts', { klass: CACHE_CLASS.TS, contentType: 'video/mp2t', body: Buffer.from('c') }))
      .then(() => {
        expect(store.get('https://x.com/1.ts')).toBeNull()
        expect(store.get('https://x.com/3.ts')).not.toBeNull()
      })
  })

  it('磁盘模式:超出条目上限时淘汰最久未访问的,正文文件同步删除', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'proxy-cache-test-'))
    tempDirs.push(dir)
    vi.stubEnv('PROXY_CACHE_DIR', dir)
    vi.stubEnv('PROXY_CACHE_TOTAL_MAX_ENTRIES', '2')

    const store = createCacheStore()
    const putEntry = (url: string) =>
      store.put(url, { klass: CACHE_CLASS.TS, contentType: 'video/mp2t', body: Buffer.from(url) })
    // 间隔 10ms 写入,让 lastAccess(毫秒粒度)能区分先后
    const tick = () => new Promise(resolve => setTimeout(resolve, 10))

    await putEntry('https://x.com/1.ts')
    await tick()
    await putEntry('https://x.com/2.ts')
    await tick()
    // 触达 1,使其成为最近访问者(2 保持最旧)
    store.get('https://x.com/1.ts')
    await tick()
    await putEntry('https://x.com/3.ts')

    // 2 被淘汰:索引与正文文件都应消失;1、3 保留
    expect(store.get('https://x.com/2.ts')).toBeNull()
    expect(store.get('https://x.com/1.ts')).not.toBeNull()
    expect(store.get('https://x.com/3.ts')).not.toBeNull()

    // 文件删除是异步的,轮询等待正文文件收敛到 2 个
    let tsFiles: string[] = []
    for (let attempt = 0; attempt < 50; attempt += 1) {
      tsFiles = await fs.readdir(path.join(dir, CACHE_CLASS.TS))
      if (tsFiles.length === 2) break
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    expect(tsFiles).toHaveLength(2)
  })
})

describe('streamWithCache 流式缓存管道', () => {
  let cache: ReturnType<typeof createCacheStore>

  const createSink = () => {
    const headers: { status: number; headers: Record<string, string> }[] = []
    const chunks: Buffer[] = []
    let headerStatus = 0
    let headerMap: Record<string, string> = {}
    const sink = {
      onHeaders: (status: number, h: Record<string, string>) => {
        headerStatus = status
        headerMap = h
        headers.push({ status, headers: h })
      },
      onChunk: (chunk: Uint8Array | string) => {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk))
      },
      getStatus: () => headerStatus,
      getHeader: (name: string) => headerMap[name],
      body: () => Buffer.concat(chunks),
    }
    return sink
  }

  beforeEach(() => {
    cache = createCacheStore()
  })

  it('未命中:流式透传(onHeaders 先于 body),并写入缓存', async () => {
    const body = new Uint8Array([0x47, 0x40, 0x11, 0x10, 1, 2, 3])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { headers: { 'content-type': 'video/mp2t' } })))
    const sink = createSink()
    const result = await streamWithCache('https://cdn.example.com/hls/a.ts', {
      cache,
      onHeaders: sink.onHeaders,
      onChunk: sink.onChunk,
    })

    expect(result.fromCache).toBe(false)
    expect(sink.getHeader('X-Cache')).toBe('MISS')
    expect(sink.body().equals(Buffer.from(body))).toBe(true)
    // 已写入缓存,二进制原样
    const entry = cache.get('https://cdn.example.com/hls/a.ts')
    expect(entry).not.toBeNull()
    expect(entry!.klass).toBe(CACHE_CLASS.TS)
    expect((await cache.readBody(entry!)).equals(Buffer.from(body))).toBe(true)
  })

  it('二次访问命中缓存:不再回源,毫秒级 HIT', async () => {
    const fetchMock = vi.fn(async () => new Response('ts-bytes', { headers: { 'content-type': 'video/mp2t' } }))
    vi.stubGlobal('fetch', fetchMock)
    const sink1 = createSink()
    await streamWithCache('https://cdn.example.com/hls/a.ts', { cache, onHeaders: sink1.onHeaders, onChunk: sink1.onChunk })

    const sink2 = createSink()
    const result2 = await streamWithCache('https://cdn.example.com/hls/a.ts', { cache, onHeaders: sink2.onHeaders, onChunk: sink2.onChunk })

    expect(result2.fromCache).toBe(true)
    expect(sink2.getHeader('X-Cache')).toBe('HIT')
    expect(sink2.body().toString()).toBe('ts-bytes')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Range 命中缓存时切片回 206 + Content-Range', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('0123456789'), { headers: { 'content-type': 'video/mp2t' } })))
    const sink1 = createSink()
    await streamWithCache('https://cdn.example.com/hls/r.ts', { cache, onHeaders: sink1.onHeaders, onChunk: sink1.onChunk })

    const sink2 = createSink()
    const result2 = await streamWithCache('https://cdn.example.com/hls/r.ts', {
      cache,
      range: 'bytes=2-5',
      onHeaders: sink2.onHeaders,
      onChunk: sink2.onChunk,
    })

    expect(result2.status).toBe(206)
    expect(sink2.getHeader('Content-Range')).toBe('bytes 2-5/10')
    expect(sink2.body().toString()).toBe('2345')
  })

  it('Range 未命中:透传上游且不写缓存', async () => {
    const fetchMock = vi.fn(async () => new Response('partial', { status: 206, headers: { 'content-type': 'video/mp2t' } }))
    vi.stubGlobal('fetch', fetchMock)
    const sink = createSink()
    await streamWithCache('https://cdn.example.com/hls/r.ts', {
      cache,
      range: 'bytes=0-3',
      onHeaders: sink.onHeaders,
      onChunk: sink.onChunk,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.example.com/hls/r.ts',
      expect.objectContaining({ headers: expect.objectContaining({ Range: 'bytes=0-3' }) }),
    )
    expect(cache.get('https://cdn.example.com/hls/r.ts')).toBeNull()
  })

  it('上游非 2xx 不写缓存', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })))
    const sink = createSink()
    const result = await streamWithCache('https://cdn.example.com/hls/f.ts', { cache, onHeaders: sink.onHeaders, onChunk: sink.onChunk })

    expect(result.status).toBe(403)
    expect(sink.getStatus()).toBe(403)
    expect(cache.get('https://cdn.example.com/hls/f.ts')).toBeNull()
  })

  it('并发同 URL 只回源一次(in-flight 去重)', async () => {
    const fetchMock = vi.fn(async () => new Response('deduped', { headers: { 'content-type': 'video/mp2t' } }))
    vi.stubGlobal('fetch', fetchMock)
    const sinks = [createSink(), createSink()]
    const [a, b] = await Promise.all([
      streamWithCache('https://cdn.example.com/hls/d.ts', { cache, onHeaders: sinks[0].onHeaders, onChunk: sinks[0].onChunk }),
      streamWithCache('https://cdn.example.com/hls/d.ts', { cache, onHeaders: sinks[1].onHeaders, onChunk: sinks[1].onChunk }),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect([a.fromCache, b.fromCache].includes(true)).toBe(true)
    expect(sinks[0].body().toString()).toBe('deduped')
    expect(sinks[1].body().toString()).toBe('deduped')
  })

  it('m3u8:代理基址存在时重写子 URL,不提供时不重写;两者都写原始缓存', async () => {
    const master = '#EXTM3U\n#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=800000\n3000k/hls/mixed.m3u8\n'
    const fetchMock = vi.fn(async () => new Response(master, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }))
    vi.stubGlobal('fetch', fetchMock)

    const sink1 = createSink()
    const r1 = await streamWithCache('https://cdn.example.com/s/mixed.m3u8', {
      cache,
      proxyBaseUrl: 'https://uaayzr.dpdns.org',
      onHeaders: sink1.onHeaders,
      onChunk: sink1.onChunk,
    })
    expect(r1.fromCache).toBe(false)
    expect(sink1.body().toString()).toContain('uaayzr.dpdns.org/proxy?url=')
    // 缓存存的是原始文本
    const entry = cache.get('https://cdn.example.com/s/mixed.m3u8')
    expect(entry!.klass).toBe(CACHE_CLASS.M3U8)
    expect((await cache.readBody(entry!)).toString()).toBe(master)

    // 命中时同样按当前代理基址重写
    const sink2 = createSink()
    const r2 = await streamWithCache('https://cdn.example.com/s/mixed.m3u8', {
      cache,
      proxyBaseUrl: 'https://uaayzr.dpdns.org',
      onHeaders: sink2.onHeaders,
      onChunk: sink2.onChunk,
    })
    expect(r2.fromCache).toBe(true)
    expect(sink2.getHeader('X-Cache')).toBe('HIT')
    expect(sink2.body().toString()).toContain('uaayzr.dpdns.org/proxy?url=')
  })

  it('非法 URL 抛错', async () => {
    await expect(
      streamWithCache('not-a-url', { cache, onHeaders: () => {}, onChunk: () => {} }),
    ).rejects.toThrow('Invalid URL format')
  })

  it('上游流中途中断:正常抛错且不挂起,缓存不写入', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        // 先给一片数据,随后 error(模拟上游断流)
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([0x47, 0x40]))
            controller.error(new Error('upstream aborted'))
          },
        })
        return new Response(body, { headers: { 'content-type': 'video/mp2t' } })
      }),
    )
    const sink = createSink()
    await expect(
      streamWithCache('https://cdn.example.com/hls/abort.ts', { cache, onHeaders: sink.onHeaders, onChunk: sink.onChunk }),
    ).rejects.toThrow('upstream aborted')
    // 未完成的分片不写缓存
    expect(cache.get('https://cdn.example.com/hls/abort.ts')).toBeNull()
  })
})