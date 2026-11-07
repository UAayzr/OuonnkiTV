import type { Plugin } from 'vite'
import {
  getProxyTimeoutMs,
  getSharedCacheStore,
  getTargetUrl,
  parseProxyError,
  streamWithCache,
} from '../shared/lib/proxy'

/**
 * 开发环境代理中间件：与生产 proxy-server 共用 streamWithCache 缓存管道
 * （dev 无 PROXY_CACHE_DIR,走进程内存缓存），行为与线上一致。
 */
export function proxyMiddleware(): Plugin {
  return {
    name: 'proxy-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/proxy')) {
          return next()
        }

        try {
          const targetUrl = getTargetUrl(req.url)
          const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
          const proxyBaseUrl = `http://${req.headers.host || 'localhost:3000'}`

          /*
           * streamWithCache 保证 onHeaders 先于任何 onChunk（416 只发 onHeaders），
           * 因此 onChunk 时响应头必定已就位,直接写字节能到正确状态码。
           */
          await streamWithCache(targetUrl, {
            range,
            proxyBaseUrl,
            cache: getSharedCacheStore(),
            onHeaders: (status, headers) => {
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.writeHead(status, headers)
            },
            onChunk: chunk => res.write(chunk),
          })
          res.end()
        } catch (error) {
          // 响应头已发出(流式中途断流/超时)时不能再写 500,直接断开连接避免二次写头崩溃
          if (res.headersSent) {
            res.destroy()
            return
          }
          const { message, cause } = parseProxyError(error)
          const timeoutMs = getProxyTimeoutMs()
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Proxy request failed', message, cause, timeoutMs }))
        }
      })
    },
  }
}