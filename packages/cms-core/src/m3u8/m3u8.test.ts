import { describe, expect, it, vi } from 'vitest'
import { composeFilters, createDefaultAdFilter, createPatternFilter } from './filter'
import { createHlsLoaderClass, createM3u8LoaderCallback } from './hls-loader'
import { createM3u8Processor } from './processor'

const manifest = '#EXTM3U\n#EXT-X-DISCONTINUITY\nad.ts\nmain.ts'

describe('M3U8 过滤和处理', () => {
  it('去除广告分隔标记和自定义匹配行', () => {
    const filter = composeFilters(createDefaultAdFilter(), createPatternFilter([/^ad\.ts$/]))
    expect(filter(manifest)).toBe('#EXTM3U\nmain.ts')
  })

  it('可动态添加和移除过滤器', () => {
    const processor = createM3u8Processor({ filterAds: false })
    const custom = (content: string) => content.replace('main.ts', 'clean.ts')

    expect(processor.process(manifest)).toBe(manifest)
    processor.addFilter(custom)
    expect(processor.process(manifest)).toContain('clean.ts')
    expect(processor.getFilters()).toEqual([custom])
    processor.removeFilter(custom)
    expect(processor.getFilters()).toEqual([])
  })

  it('简化回调只处理字符串内容', () => {
    const callback = createM3u8LoaderCallback(createM3u8Processor())
    const response = { data: manifest }
    callback(response)
    expect(response.data).not.toContain('#EXT-X-DISCONTINUITY')
    expect(() => callback({})).not.toThrow()
  })

  it('HLS 加载器只改写清单请求', () => {
    const originalLoad = vi.fn()
    class DefaultLoader {
      load = originalLoad
      constructor() {}
    }
    const onSuccess = vi.fn()
    const CustomLoader = createHlsLoaderClass({
      m3u8Processor: createM3u8Processor(),
      Hls: { DefaultConfig: { loader: DefaultLoader } },
    })
    const loader = new CustomLoader({})
    const callbacks = { onSuccess }

    loader.load({ type: 'manifest' }, {}, callbacks)
    const wrappedSuccess = originalLoad.mock.calls[0][2].onSuccess
    const response = { data: manifest }
    wrappedSuccess(response, {}, {}, null)

    expect(response.data).not.toContain('#EXT-X-DISCONTINUITY')
    expect(onSuccess).toHaveBeenCalled()
  })
})
