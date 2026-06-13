type RouteKey = string | ((pathname: string) => string)

/**
 * 计算动画容器的 key。
 *
 * 抽成纯函数以便单测和复用：把「自定义 routeKey 回调」「字符串覆盖」
 * 「默认回退到 pathname 本身」三种情况收敛到一处。
 */
export const resolveAnimationKey = (pathname: string, routeKey?: RouteKey): string => {
  if (typeof routeKey === 'function') return routeKey(pathname)
  if (typeof routeKey === 'string') return routeKey
  return pathname
}

export type { RouteKey }