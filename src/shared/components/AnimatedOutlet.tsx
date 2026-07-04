import { useLocation, useOutlet } from 'react-router'
import { useDeferredValue, useRef } from 'react'

import { resolveAnimationKey, type RouteKey } from './animatedOutletKey'

/**
 * AnimatedOutlet - 带页面过渡动画的 Outlet 包装组件
 *
 * 使用 CSS 实现路由进入动画。
 * 动画效果：淡入 + 轻微的垂直位移 + 模糊效果
 *
 * 通过 useDeferredValue 把动画 key 解耦于实时 pathname：当目标路由仍处于
 * Suspense fallback 阶段时，deferred 值不会推进，内容也继续显示旧 outlet。
 * 这里不再使用路由级 exit 动画，避免旧路由 DOM 延迟卸载时与 React commit
 * 删除阶段发生 removeChild 竞态。
 */
export default function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()

  // deferred pathname：Suspense 暂停期间会停留在旧值
  const deferredPathname = useDeferredValue(location.pathname)
  const isReady = deferredPathname === location.pathname

  // 缓存「就绪态」的 outlet，供 exit 动画期间继续渲染
  const outletRef = useRef(outlet)
  if (outlet && isReady) {
    outletRef.current = outlet
  }
  const displayedOutlet = isReady ? outlet : outletRef.current

  return (
    <div
      key={deferredPathname}
      className="h-full animate-[route-fade-in_180ms_ease-out] motion-reduce:animate-none"
    >
      {displayedOutlet}
    </div>
  )
}

/**
 * 可配置的动画 Outlet 组件
 * 支持自定义动画变体和类名
 */
interface CustomAnimatedOutletProps {
  variants?: unknown
  className?: string
  /** 是否启用动画，默认 true */
  enabled?: boolean
  /** 自定义路由动画 key，用于控制哪些路径共享同一动画容器 */
  routeKey?: RouteKey
}

export function CustomAnimatedOutlet({
  className = 'h-full',
  enabled = true,
  routeKey,
}: CustomAnimatedOutletProps) {
  const location = useLocation()
  const outlet = useOutlet()

  const deferredPathname = useDeferredValue(location.pathname)
  const isReady = deferredPathname === location.pathname

  const outletRef = useRef(outlet)
  if (outlet && isReady) {
    outletRef.current = outlet
  }
  const displayedOutlet = isReady ? outlet : outletRef.current

  // 如果禁用动画，直接返回 outlet
  if (!enabled) {
    return <>{displayedOutlet}</>
  }

  const animationKey = resolveAnimationKey(deferredPathname, routeKey)

  return (
    <div
      key={animationKey}
      className={`${className} animate-[route-fade-in_180ms_ease-out] motion-reduce:animate-none`}
    >
      {displayedOutlet}
    </div>
  )
}
