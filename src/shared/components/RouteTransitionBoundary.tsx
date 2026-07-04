import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react'
import { isRecoverableMotionError } from './routeTransitionRecovery'

interface RouteTransitionBoundaryProps {
  children: ReactNode
}

interface RouteTransitionBoundaryState {
  /** 每次自愈递增，作为子树重新挂载的 key */
  resetKey: number
  /** 不可恢复错误，render 阶段重新抛出交给外层错误边界 */
  fatalError: unknown
}

/**
 * 路由过渡兜底错误边界。
 *
 * 快速路由切换与 Suspense 组合时仍可能出现 DOM 失步风险（commit 阶段
 * React 想 removeChild 一个已经不在父级下的节点）。本边界仅吞下这一类
 * 可确定恢复的错误：bump 内部 resetKey 强制子树重新挂载，避免红屏。
 *
 * 不吞下其他错误：会在 render 阶段重新抛出，交由现有外层错误边界处理。
 */
export default class RouteTransitionBoundary extends Component<
  RouteTransitionBoundaryProps,
  RouteTransitionBoundaryState
> {
  state: RouteTransitionBoundaryState = { resetKey: 0, fatalError: null }

  static getDerivedStateFromError(error: unknown): Partial<RouteTransitionBoundaryState> {
    if (isRecoverableMotionError(error)) {
      // 在 componentDidCatch 里再 bump resetKey 触发子树重新挂载
      return {}
    }
    // 标记为不可恢复，render 阶段重新抛出
    return { fatalError: error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (!isRecoverableMotionError(error)) return

    if (import.meta.env.DEV) {
      console.warn(
        '[RouteTransitionBoundary] recovered from a route/Suspense DOM race:',
        error instanceof Error ? error.message : error,
        info.componentStack,
      )
    }

    this.setState(prev => ({ resetKey: prev.resetKey + 1 }))
  }

  render(): ReactNode {
    if (this.state.fatalError) {
      throw this.state.fatalError
    }
    // key 变化驱动 children 子树重新挂载，达到「自愈」效果
    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>
  }
}
