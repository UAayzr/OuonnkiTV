import { useCallback, useEffect, useRef, useState } from 'react'

export interface PlayerTransientNotice {
  id: string
  message: string
  duration: number
  progress: number
  /** 创建时间戳，供兜底巡检判断是否已超期（见下方 sweep effect） */
  createdAt: number
}

/** 兜底巡检间隔 */
const NOTICE_SWEEP_INTERVAL_MS = 1000
/** 超过 duration 后额外宽限的时间，避免与正常移除路径抢跑 */
const NOTICE_SWEEP_GRACE_MS = 1000

export function usePlayerNotices() {
  const noticeTimersRef = useRef<Map<string, number>>(new Map())
  const noticeAnimationFramesRef = useRef<Map<string, number>>(new Map())
  const [transientNotices, setTransientNotices] = useState<PlayerTransientNotice[]>([])

  const showPlayerNotice = useCallback((message: string, duration = 2200) => {
    const noticeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    setTransientNotices(prev => [
      ...prev,
      { id: noticeId, message, duration, progress: 100, createdAt: Date.now() },
    ])

    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => {
        setTransientNotices(prev =>
          prev.map(notice => (notice.id === noticeId ? { ...notice, progress: 0 } : notice)),
        )
        noticeAnimationFramesRef.current.delete(noticeId)
      })
      noticeAnimationFramesRef.current.set(noticeId, secondFrame)
    })
    noticeAnimationFramesRef.current.set(noticeId, firstFrame)

    const timerId = window.setTimeout(() => {
      setTransientNotices(prev => prev.filter(notice => notice.id !== noticeId))
      noticeTimersRef.current.delete(noticeId)
      const frameId = noticeAnimationFramesRef.current.get(noticeId)
      if (frameId) {
        window.cancelAnimationFrame(frameId)
        noticeAnimationFramesRef.current.delete(noticeId)
      }
    }, duration)
    noticeTimersRef.current.set(noticeId, timerId)
  }, [])

  /*
   * 兜底巡检：正常情况下每条通知由自己的 setTimeout 移除，但那个定时器可能被意外取消
   * （组件重挂且 state 被保留、HMR 热替换等），此时通知会永久卡在界面上不再消失。
   * 这里按 createdAt 定期巡检，保证任何通知的存活时间都不会超过 duration + 宽限。
   */
  useEffect(() => {
    if (transientNotices.length === 0) return

    const intervalId = window.setInterval(() => {
      const now = Date.now()
      setTransientNotices(prev => {
        const next = prev.filter(
          notice => now - notice.createdAt < notice.duration + NOTICE_SWEEP_GRACE_MS,
        )
        // 没有超期项时返回原引用，避免无谓重渲染
        return next.length === prev.length ? prev : next
      })
    }, NOTICE_SWEEP_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [transientNotices.length])

  useEffect(() => {
    const noticeTimers = noticeTimersRef.current
    const noticeAnimationFrames = noticeAnimationFramesRef.current

    return () => {
      noticeTimers.forEach(timerId => window.clearTimeout(timerId))
      noticeTimers.clear()
      noticeAnimationFrames.forEach(frameId => window.cancelAnimationFrame(frameId))
      noticeAnimationFrames.clear()
    }
  }, [])

  return {
    transientNotices,
    showPlayerNotice,
  }
}
