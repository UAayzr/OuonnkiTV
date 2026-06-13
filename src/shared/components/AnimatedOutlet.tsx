import { useLocation, useOutlet } from 'react-router'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import { useDeferredValue, useRef } from 'react'
import { pageVariants } from '@/shared/lib/animationVariants'

import { resolveAnimationKey, type RouteKey } from './animatedOutletKey'

/**
 * AnimatedOutlet - 带页面过渡动画的 Outlet 包装组件
 *
 * 使用 framer-motion 的 AnimatePresence 实现路由切换时的平滑过渡动画。
 * 动画效果：淡入淡出 + 轻微的垂直位移 + 模糊效果
 *
 * 通过 useDeferredValue 把动画 key 解耦于实时 pathname：当目标路由仍处于
 * Suspense fallback 阶段时，deferred 值不会推进，AnimatePresence 因此不会
 * 启动 exit/enter 序列，从根上避免「lazy chunk 加载中再切下一路由」造成
 * 的 DOM 失步崩溃。
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

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={deferredPathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="h-full"
      >
        {outlet || outletRef.current}
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * 可配置的动画 Outlet 组件
 * 支持自定义动画变体和类名
 */
interface CustomAnimatedOutletProps {
  variants?: Variants
  className?: string
  /** 是否启用动画，默认 true */
  enabled?: boolean
  /** 自定义路由动画 key，用于控制哪些路径共享同一动画容器 */
  routeKey?: RouteKey
}

export function CustomAnimatedOutlet({
  variants = pageVariants,
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

  // 如果禁用动画，直接返回 outlet
  if (!enabled) {
    return <>{outlet || outletRef.current}</>
  }

  const animationKey = resolveAnimationKey(deferredPathname, routeKey)

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={animationKey}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        className={className}
      >
        {outlet || outletRef.current}
      </motion.div>
    </AnimatePresence>
  )
}