import { describe, expect, it, vi } from 'vitest'
import { resolveAnimationKey } from './animatedOutletKey'

describe('resolveAnimationKey', () => {
  it('falls back to the pathname when no routeKey is provided', () => {
    expect(resolveAnimationKey('/search')).toBe('/search')
  })

  it('returns the static string override as-is', () => {
    expect(resolveAnimationKey('/settings/source', '/settings')).toBe('/settings')
  })

  it('delegates to the function override when provided', () => {
    const routeKey = vi.fn((pathname: string) =>
      pathname === '/settings' || pathname.startsWith('/settings/') ? '/settings' : pathname,
    )
    expect(resolveAnimationKey('/settings/source', routeKey)).toBe('/settings')
    expect(resolveAnimationKey('/settings/playback', routeKey)).toBe('/settings')
    expect(resolveAnimationKey('/search', routeKey)).toBe('/search')
    expect(routeKey).toHaveBeenCalledTimes(3)
  })

  it('keeps the same key for paths that the routeKey collapses together', () => {
    const collapse = (p: string) =>
      p === '/settings' || p.startsWith('/settings/') ? '/settings' : p

    // 模拟 deferred pathname 在 settings 子路由间切换时不应推进动画 key
    expect(resolveAnimationKey('/settings/source', collapse)).toBe(
      resolveAnimationKey('/settings/playback', collapse),
    )
  })

  it('lets sibling top-level routes own distinct keys', () => {
    expect(resolveAnimationKey('/search')).not.toBe(resolveAnimationKey('/favorites'))
  })
})