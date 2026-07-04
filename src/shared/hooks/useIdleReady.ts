import { useEffect, useState } from 'react'

interface IdleDeadlineLike {
  didTimeout: boolean
  timeRemaining: () => number
}

type RequestIdleCallback = (
  callback: (deadline: IdleDeadlineLike) => void,
  options?: { timeout?: number },
) => number

type CancelIdleCallback = (handle: number) => void

const getRequestIdleCallback = (): RequestIdleCallback | undefined => {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { requestIdleCallback?: RequestIdleCallback }).requestIdleCallback
}

const getCancelIdleCallback = (): CancelIdleCallback | undefined => {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { cancelIdleCallback?: CancelIdleCallback }).cancelIdleCallback
}

/**
 * Defers non-critical UI until the browser has had a chance to paint.
 */
export function useIdleReady(timeout = 1200) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (ready) return

    const requestIdleCallback = getRequestIdleCallback()
    const cancelIdleCallback = getCancelIdleCallback()

    if (requestIdleCallback) {
      const idleHandle = requestIdleCallback(() => setReady(true), { timeout })
      return () => cancelIdleCallback?.(idleHandle)
    }

    const timer = window.setTimeout(() => setReady(true), Math.min(timeout, 250))
    return () => window.clearTimeout(timer)
  }, [ready, timeout])

  return ready
}
