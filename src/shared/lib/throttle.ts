export interface ThrottledFunction<TArgs extends unknown[]> {
  (...args: TArgs): void
  cancel: () => void
}

export function throttle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  wait: number,
): ThrottledFunction<TArgs> {
  let lastRun = 0
  let timeoutId: number | undefined
  let trailingArgs: TArgs | null = null

  const invoke = (args: TArgs) => {
    lastRun = Date.now()
    trailingArgs = null
    fn(...args)
  }

  const throttled = (...args: TArgs) => {
    const remaining = wait - (Date.now() - lastRun)

    if (remaining <= 0 || remaining > wait) {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
        timeoutId = undefined
      }
      invoke(args)
      return
    }

    trailingArgs = args
    if (timeoutId !== undefined) return

    timeoutId = window.setTimeout(() => {
      timeoutId = undefined
      if (trailingArgs) {
        invoke(trailingArgs)
      }
    }, remaining)
  }

  throttled.cancel = () => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
      timeoutId = undefined
    }
    trailingArgs = null
  }

  return throttled
}
