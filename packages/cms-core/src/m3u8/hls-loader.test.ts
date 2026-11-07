import { describe, expect, it, vi } from 'vitest'
import { createHlsLoaderClass } from './hls-loader'

/** 模拟 hls.js 默认加载器基类 */
class DefaultLoader {
  load = vi.fn()
}

const FakeHls = {
  DefaultConfig: { loader: DefaultLoader },
}

const fakeProcessor = {
  process: vi.fn((text: string) => `filtered:${text}`),
}

function createLoader(
  overrides: { m3u8Processor?: unknown; urlTransformer?: (url: string) => string } = {},
) {
  const CustomLoader = createHlsLoaderClass({
    m3u8Processor: overrides.m3u8Processor === undefined ? fakeProcessor : (overrides.m3u8Processor as never),
    ...(overrides.urlTransformer ? { urlTransformer: overrides.urlTransformer } : {}),
    Hls: FakeHls,
  })
  const instance = new CustomLoader({})
  const context = {} as { type: string; url: string }
  const callbacks = { onSuccess: vi.fn() }
  return { instance, context, callbacks }
}

describe('createHlsLoaderClass', () => {
  it('urlTransformer 对 manifest/level/frag 全部生效', () => {
    const transformer = vi.fn((url: string) => `proxy:${url}`)
    const { instance, context, callbacks } = createLoader({ urlTransformer: transformer })

    for (const type of ['manifest', 'level', 'frag']) {
      context.type = type
      context.url = `https://cdn.example.com/${type}.m3u8`
      instance.load(context, {}, callbacks)
      expect(transformer).toHaveBeenCalledWith(`https://cdn.example.com/${type}.m3u8`)
      expect(context.url).toBe(`proxy:https://cdn.example.com/${type}.m3u8`)
    }
  })

  it('未提供 urlTransformer 时 URL 原样', () => {
    const { instance, context, callbacks } = createLoader()
    context.type = 'frag'
    context.url = 'https://cdn.example.com/a.ts'
    instance.load(context, {}, callbacks)
    expect(context.url).toBe('https://cdn.example.com/a.ts')
  })

  it('m3u8 文本处理仅当 processor 存在且类型为 manifest/level', () => {
    const { instance, context } = createLoader()
    fakeProcessor.process.mockClear()

    // manifest: 处理
    context.type = 'manifest'
    context.url = 'https://cdn.example.com/index.m3u8'
    const manifestCallbacks = { onSuccess: vi.fn() }
    instance.load(context, {}, manifestCallbacks)
    const manifestResponse = { data: '#EXTM3U\n' }
    manifestCallbacks.onSuccess(manifestResponse, {}, context, null)
    expect(manifestResponse.data).toBe('filtered:#EXTM3U\n')

    // level: 处理
    context.type = 'level'
    context.url = 'https://cdn.example.com/mixed.m3u8'
    const levelCallbacks = { onSuccess: vi.fn() }
    instance.load(context, {}, levelCallbacks)
    const levelResponse = { data: '#EXTM3U\n#EXTINF:10,' }
    levelCallbacks.onSuccess(levelResponse, {}, context, null)
    expect(levelResponse.data).toBe('filtered:#EXTM3U\n#EXTINF:10,')

    // frag: 不处理文本
    context.type = 'frag'
    context.url = 'https://cdn.example.com/a.ts'
    const fragCallbacks = { onSuccess: vi.fn() }
    instance.load(context, {}, fragCallbacks)
    const fragResponse = { data: 'ts-bytes' }
    fragCallbacks.onSuccess(fragResponse, {}, context, null)
    expect(fragResponse.data).toBe('ts-bytes')
  })

  it('未传入 m3u8Processor 时不做文本处理,URL 重写仍生效', () => {
    const transformer = (url: string) => `proxy:${url}`
    const { instance, context, callbacks } = createLoader({ m3u8Processor: null, urlTransformer: transformer })

    context.type = 'manifest'
    context.url = 'https://cdn.example.com/index.m3u8'
    instance.load(context, {}, callbacks)
    expect(context.url).toBe('proxy:https://cdn.example.com/index.m3u8')
    expect(callbacks.onSuccess).not.toHaveBeenCalled()
  })

  it('无 onSuccess 回调时 URL 重写仍执行且不报错', () => {
    const { instance, context } = createLoader({ urlTransformer: url => `proxy:${url}` })
    context.type = 'frag'
    context.url = 'https://cdn.example.com/a.ts'
    expect(() => instance.load(context, {}, {})).not.toThrow()
    expect(context.url).toBe('proxy:https://cdn.example.com/a.ts')
  })
})