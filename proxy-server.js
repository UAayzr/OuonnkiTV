import express from 'express'
import cors from 'cors'
import { getProxyTimeoutMs, parseProxyError, streamWithCache } from './shared/proxy-core.js'

const app = express()
const PORT = process.env.PROXY_PORT || 3001

app.use(cors({ origin: '*' }))

app.get('/proxy', async (req, res) => {
  const abortController = new AbortController()
  req.on('aborted', () => abortController.abort())
  req.on('close', () => {
    if (!res.writableEnded) abortController.abort()
  })

  try {
    const { url } = req.query
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' })
    }

    // express 的 req.query 已按 URL 规范解码一次,直接用;
    // 目标 URL 内部若再有编码序列(如查询参数值里的 %2F)不能再 decode
    const targetUrl = url
    const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
    const proxyBaseUrl = `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host') || 'localhost'}`

    /*
     * 播放加速核心管道(shared/proxy-core.js 的 streamWithCache):
     * - 命中磁盘缓存:onHeaders 携带 X-Cache: HIT,毫秒级下发
     * - 未命中:onHeaders 先回调(客户端 TTFB = 上游 TTFB),onChunk 流式透传,
     *   同时累积落盘;二进制全程无损(不再经 response.text())
     * - Range 命中切片 206;未命中透传不缓存
     */
    await streamWithCache(targetUrl, {
      range,
      proxyBaseUrl,
      signal: abortController.signal,
      onHeaders: (status, headers) => {
        if (res.headersSent) return
        res.status(status)
        for (const [name, value] of Object.entries(headers)) {
          res.setHeader(name, value)
        }
      },
      onChunk: chunk => res.write(chunk),
    })
    res.end()
  } catch (error) {
    if (res.headersSent) {
      res.destroy()
      return
    }
    const { message, cause } = parseProxyError(error)
    res.status(500).json({
      error: 'Proxy request failed',
      message,
      cause,
      timeoutMs: getProxyTimeoutMs(),
    })
  }
})

app.listen(PORT, () => console.log(`Proxy server on :${PORT}`))