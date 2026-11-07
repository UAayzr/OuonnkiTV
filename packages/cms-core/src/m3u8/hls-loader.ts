/* eslint-disable @typescript-eslint/no-explicit-any */
import type { M3u8Processor } from './processor'
import { buildPrefetchStats, tryTakeFragment } from './fragment-prefetch'

/**
 * HLS加载器配置
 */
export interface HlsLoaderConfig {
  /** M3U8处理器(可选:仅广告过滤等文本改写场景提供) */
  m3u8Processor?: M3u8Processor | null
  /** URL 重写器(可选):对 manifest/level/frag 全部请求统一改写,
   * 用于把播放流量中转进代理缓存。已含代理前缀的 URL 由重写器自行防重复。 */
  urlTransformer?: (url: string) => string
  /** HLS.js 模块引用，用于获取默认加载器 */
  Hls: any
}

/**
 * 创建HLS.js兼容的加载器类
 * 注意：此函数返回一个类，需要在HLS.js配置中使用
 *
 * @example
 * ```typescript
 * import Hls from 'hls.js'
 * import { createM3u8Processor, createHlsLoaderClass } from '@ouonnki/cms-core/m3u8'
 *
 * const processor = createM3u8Processor({ filterAds: true })
 * const CustomLoader = createHlsLoaderClass({ m3u8Processor: processor, Hls })
 *
 * const hls = new Hls({
 *   loader: CustomLoader
 * })
 * ```
 */
export function createHlsLoaderClass(config: HlsLoaderConfig): any {
  const { m3u8Processor, urlTransformer, Hls } = config

  // 获取默认加载器类
  const DefaultLoader = Hls.DefaultConfig.loader

  // 创建继承默认加载器的自定义类
  return class CustomHlsLoader extends DefaultLoader {
    constructor(hlsConfig: any) {
      super(hlsConfig)

      // 保存原始load方法
      const originalLoad = this.load.bind(this)

      // 重写load方法
      this.load = (context: any, loadConfig: any, callbacks: any) => {
        // 统一 URL 重写：manifest/level/frag 全覆盖（播放链路代理中转）
        if (urlTransformer && context && typeof context.url === 'string') {
          context.url = urlTransformer(context.url)
        }

        // 分片:优先消费预取队列(并发预取的后续分片),命中则跳过网络直接投喂。
        // 下载失败时 reject,这里交由 hls.js 自身的重试机制处理。
        if (context?.type === 'frag') {
          const prefetched = tryTakeFragment(context.url)
          if (prefetched) {
            const trequest = performance.now()
            prefetched.then(
              data => {
                callbacks?.onSuccess?.(
                  { url: context.url, data },
                  buildPrefetchStats(trequest, performance.now()),
                  context,
                  null,
                )
              },
              () => {
                // 预取失败:退回默认加载路径(不重复入队)
                originalLoad(context, loadConfig, callbacks)
              },
            )
            return
          }
        }

        // 只对 manifest / level 的响应文本做 m3u8 处理（广告过滤等）
        if (
          m3u8Processor &&
          (context.type === 'manifest' || context.type === 'level') &&
          callbacks?.onSuccess
        ) {
          const originalOnSuccess = callbacks.onSuccess

          callbacks.onSuccess = (response: any, stats: any, ctx: any, networkDetails: unknown) => {
            // 处理M3U8内容
            if (response.data && typeof response.data === 'string') {
              response.data = m3u8Processor.process(response.data)
            }
            return originalOnSuccess(response, stats, ctx, networkDetails)
          }
        }

        originalLoad(context, loadConfig, callbacks)
      }
    }
  }
}

/**
 * 创建简化的M3U8处理回调
 * 用于不使用类继承的场景
 */
export function createM3u8LoaderCallback(
  m3u8Processor: M3u8Processor,
): (response: { data?: string }) => void {
  return response => {
    if (response.data && typeof response.data === 'string') {
      response.data = m3u8Processor.process(response.data)
    }
  }
}