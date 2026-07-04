import { useCallback, useEffect, useRef, useState } from 'react'

export interface PlayerTransientNotice {
  id: string
  message: string
  duration: number
  progress: number
}

export function usePlayerNotices() {
  const noticeTimersRef = useRef<Map<string, number>>(new Map())
  const noticeAnimationFramesRef = useRef<Map<string, number>>(new Map())
  const [transientNotices, setTransientNotices] = useState<PlayerTransientNotice[]>([])

  const showPlayerNotice = useCallback((message: string, duration = 2200) => {
    const noticeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    setTransientNotices(prev => [...prev, { id: noticeId, message, duration, progress: 100 }])

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
