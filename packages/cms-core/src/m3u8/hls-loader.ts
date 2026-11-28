/* eslint-disable @typescript-eslint/no-explicit-any */
import type { M3u8Processor } from './processor'
import {
  applyPrefetchStats,
  noteForegroundLoadStart,
  tryTakeFragment,
  type FragmentPrefetchHandle,
  type PrefetchStatsLike,
} from './fragment-prefetch'

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

/** 包装 loader 回调：任一终止回调先释放前台预算，再透传原回调 */
const wrapCallbacks = (callbacks: any, finish: () => void) => ({
  ...(callbacks || {}),
  onSuccess: (response: any, stats: any, context: any, networkDetails: unknown) => {
    finish()
    callbacks?.onSuccess?.(response, stats, context, networkDetails)
  },
  onError: (error: any, context: any, networkDetails: unknown, stats: any) => {
    finish()
    callbacks?.onError?.(error, context, networkDetails, stats)
  },
  onTimeout: (stats: any, context: any, networkDetails: unknown) => {
    finish()
    callbacks?.onTimeout?.(stats, context, networkDetails)
  },
  onAbort: (stats: any, context: any, networkDetails: unknown) => {
    finish()
    callbacks?.onAbort?.(stats, context, networkDetails)
  },
})

/**
 * 创建HLS.js兼容的加载器类
 * 注意：此函数返回一个类，需要在HLS.js配置中使用
 *
 * @example
 * ```ts
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
      const self = this as any

      // 保存基类方法：预取路径需要绕过默认 load，但仍要保留取消/销毁能力
      const originalLoad = self.load.bind(self)
      const originalAbort = typeof self.abort === 'function' ? self.abort.bind(self) : null
      const originalDestroy = typeof self.destroy === 'function' ? self.destroy.bind(self) : null

      /** 非预取前台加载的 release（只释放一次） */
      let externalRelease: (() => void) | null = null
      /** 当前预取请求是否已结束（success/timeout/abort/fallback 后置位） */
      let prefetchSettled = false
      let prefetchTimer: ReturnType<typeof setTimeout> | null = null
      let prefetchHandle: FragmentPrefetchHandle | null = null
      let abortPrefetch: (() => void) | null = null

      const clearTimer = () => {
        if (prefetchTimer !== null) {
          clearTimeout(prefetchTimer)
          prefetchTimer = null
        }
      }

      /** 真实网络加载：登记前台预算，回调只释放一次 */
      const loadOriginal = (context: any, loadConfig: any, callbacks: any) => {
        const release = noteForegroundLoadStart()
        externalRelease = release
        let released = false
        const done = () => {
          if (released) return
          released = true
          if (externalRelease === release) externalRelease = null
          release()
        }
        try {
          originalLoad(context, loadConfig, wrapCallbacks(callbacks, done))
        } catch (error) {
          done()
          throw error
        }
      }

      self.load = (context: any, loadConfig: any, callbacks: any) => {
        // 统一 URL 重写：manifest/level/frag 全覆盖（播放链路代理中转）
        if (urlTransformer && context && typeof context.url === 'string') {
          context.url = urlTransformer(context.url)
        }

        // 分片:优先消费预取队列(并发预取的后续分片),命中则跳过网络直接投喂。
        // 注意:hls.js 的 FragmentLoaderContext 没有 type 字段(type 只属于清单/档位
        // context),必须用 context.frag 判定;保留 type 判断以兼容旧版形态。
        const isFragmentContext = Boolean(context?.frag) || context?.type === 'frag'
        if (isFragmentContext) {
          // EXT-X-BYTERANGE 分片不能只按 URL 复用整段内容，绕过预取
          const rangeEnd = context?.rangeEnd ?? context?.frag?.rangeEnd
          const handle = rangeEnd ? null : tryTakeFragment(context?.url)

          if (!handle) {
            loadOriginal(context, loadConfig, callbacks)
            return
          }

          /*
           * 预取命中：补齐 hls.js Loader 契约。
           * - frag.stats === loader.stats，必须原地写统计（ABR 直接读取）；
           * - 支持 abort()/destroy()：hls.js 取消后不能再回调 onSuccess；
           * - 两段式超时与 hls.js 一致：TTFB 用 maxTimeToFirstByteMs，
           *   首字节到达后用 maxLoadTimeMs。
           */
          self.context = context
          self.config = loadConfig
          self.callbacks = callbacks
          prefetchHandle = handle
          prefetchSettled = false

          const stats = self.stats as PrefetchStatsLike | undefined
          const policy = loadConfig?.loadPolicy || {}
          const ttfbMs = Number(policy.maxTimeToFirstByteMs) || 10_000
          const totalMs = Number(policy.maxLoadTimeMs) || Number(loadConfig?.timeout) || 120_000

          const finish = (
            mode: 'success' | 'timeout' | 'abort' | 'fallback' | 'silent',
            data?: ArrayBuffer,
          ) => {
            if (prefetchSettled) return
            prefetchSettled = true
            clearTimer()
            const current = prefetchHandle
            prefetchHandle = null
            abortPrefetch = null

            if (mode === 'success' && data) {
              if (stats) {
                applyPrefetchStats(stats, {
                  startedAt: handle.startedAt,
                  firstByteAt: handle.firstByteAt,
                  loadedAt: performance.now(),
                  bytes: data.byteLength,
                })
              }
              callbacks?.onSuccess?.(
                { url: context.url, data, code: 200 },
                stats,
                context,
                null,
              )
              return
            }

            if (mode === 'timeout') {
              if (stats) stats.aborted = true
              callbacks?.onTimeout?.(stats, context, null)
              return
            }

            if (mode === 'abort') {
              if (stats) stats.aborted = true
              callbacks?.onAbort?.(stats, context, null)
              return
            }

            if (mode === 'fallback') {
              /*
               * 下载失败：退回默认加载器。必须先复位统计，否则 XhrLoader.load
               * 会命中 "Loader can only be used once."（stats.loading.start 非 0）。
               */
              if (stats) {
                stats.aborted = false
                stats.loaded = 0
                stats.total = 0
                stats.retry = 0
                stats.loading.start = 0
                stats.loading.first = 0
                stats.loading.end = 0
              }
              loadOriginal(context, loadConfig, callbacks)
            }
            // 'silent': destroy 场景，不回调
            void current
          }

          const armTimer = (ms: number) => {
            clearTimer()
            if (!Number.isFinite(ms) || ms <= 0) return
            prefetchTimer = setTimeout(() => {
              if (prefetchSettled) return
              handle.abort()
              finish('timeout')
            }, ms)
          }

          abortPrefetch = () => finish('abort')

          if (handle.firstByteAt > 0) {
            armTimer(totalMs)
          } else {
            armTimer(ttfbMs)
            handle.watchFirstByte(() => {
              if (!prefetchSettled) armTimer(totalMs)
            })
          }

          handle.promise.then(
            data => finish('success', data),
            () => {
              if (handle.cancelled) finish('abort')
              else if (handle.timedOut) finish('timeout')
              else finish('fallback')
            },
          )
          return
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

        loadOriginal(context, loadConfig, callbacks)
      }

      self.abort = () => {
        if (prefetchHandle && !prefetchSettled) {
          prefetchHandle.abort()
          abortPrefetch?.()
          return
        }
        originalAbort?.()
        // 基类 abort 在 callbacks 未就绪时不会回调，这里兜底释放前台预算
        externalRelease?.()
        externalRelease = null
      }

      self.destroy = () => {
        if (prefetchHandle && !prefetchSettled) {
          prefetchHandle.abort()
          prefetchSettled = true
          clearTimer()
          prefetchHandle = null
          abortPrefetch = null
        }
        externalRelease?.()
        externalRelease = null
        originalDestroy?.()
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
