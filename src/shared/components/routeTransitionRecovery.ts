/**
 * 判断错误是否属于「Suspense × 路由切换」并发竞态抛出的、
 * 可通过重新挂载子树自愈的 DOM 失步错误。
 *
 * 仅识别明确包含以下特征之一的错误：
 *   - removeChild
 *   - NotFoundError
 *   - is not a child of this node
 *
 * 其他错误不识别，由上层错误边界处理。
 */
export const isRecoverableMotionError = (error: unknown): boolean => {
  if (!error) return false

  const message = error instanceof Error ? error.message : String(error)
  const name = error instanceof Error ? error.name : ''

  if (name === 'NotFoundError') return true
  if (/removeChild/i.test(message)) return true
  if (/NotFoundError/i.test(message)) return true
  if (/is not a child of this node/i.test(message)) return true

  return false
}
