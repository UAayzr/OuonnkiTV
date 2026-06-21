import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/shared/config/settings.config'
import { useSettingStore } from './settingStore'

describe('settingStore migrate', () => {
  it('v6 -> v7 会补齐 isMobileGestureEnabled 默认值', async () => {
    const migrate = useSettingStore.persist.getOptions().migrate

    const legacyState = {
      network: DEFAULT_SETTINGS.network,
      search: DEFAULT_SETTINGS.search,
      playback: {
        ...DEFAULT_SETTINGS.playback,
      },
      system: DEFAULT_SETTINGS.system,
    }
    delete (legacyState.playback as Record<string, unknown>).isMobileGestureEnabled

    const migrated = (await Promise.resolve(migrate?.(legacyState, 6))) as {
      playback: { isMobileGestureEnabled?: boolean }
    }

    expect(migrated.playback.isMobileGestureEnabled).toBe(true)
  })

  it('已有 isMobileGestureEnabled 时不覆盖', async () => {
    const migrate = useSettingStore.persist.getOptions().migrate

    const legacyState = {
      network: DEFAULT_SETTINGS.network,
      search: DEFAULT_SETTINGS.search,
      playback: {
        ...DEFAULT_SETTINGS.playback,
        isMobileGestureEnabled: false,
      },
      system: DEFAULT_SETTINGS.system,
    }

    const migrated = (await Promise.resolve(migrate?.(legacyState, 6))) as {
      playback: { isMobileGestureEnabled?: boolean }
    }

    expect(migrated.playback.isMobileGestureEnabled).toBe(false)
  })

  it('v10 -> v11 会补齐 isScrollChromeAnimationEnabled 默认值', async () => {
    const migrate = useSettingStore.persist.getOptions().migrate

    const legacyState = {
      network: DEFAULT_SETTINGS.network,
      search: DEFAULT_SETTINGS.search,
      playback: DEFAULT_SETTINGS.playback,
      system: {
        ...DEFAULT_SETTINGS.system,
      },
    }
    delete (legacyState.system as Record<string, unknown>).isScrollChromeAnimationEnabled

    const migrated = (await Promise.resolve(migrate?.(legacyState, 10))) as {
      system: { isScrollChromeAnimationEnabled?: boolean }
    }

    expect(migrated.system.isScrollChromeAnimationEnabled).toBe(false)
  })

  it('v11 -> v12 会补齐 longPressPlaybackRate 默认值', async () => {
    const migrate = useSettingStore.persist.getOptions().migrate

    const legacyState = {
      network: DEFAULT_SETTINGS.network,
      search: DEFAULT_SETTINGS.search,
      playback: {
        ...DEFAULT_SETTINGS.playback,
      },
      system: DEFAULT_SETTINGS.system,
    }
    delete (legacyState.playback as Record<string, unknown>).longPressPlaybackRate

    const migrated = (await Promise.resolve(migrate?.(legacyState, 11))) as {
      playback: { longPressPlaybackRate?: number }
    }

    expect(migrated.playback.longPressPlaybackRate).toBe(DEFAULT_SETTINGS.playback.longPressPlaybackRate)
  })

  it('v12 -> v13 会补齐 isFullscreenProgressHidden 默认值', async () => {
    const migrate = useSettingStore.persist.getOptions().migrate

    const legacyState = {
      network: DEFAULT_SETTINGS.network,
      search: DEFAULT_SETTINGS.search,
      playback: {
        ...DEFAULT_SETTINGS.playback,
      },
      system: DEFAULT_SETTINGS.system,
    }
    delete (legacyState.playback as Record<string, unknown>).isFullscreenProgressHidden

    const migrated = (await Promise.resolve(migrate?.(legacyState, 12))) as {
      playback: { isFullscreenProgressHidden?: boolean }
    }

    expect(migrated.playback.isFullscreenProgressHidden).toBe(
      DEFAULT_SETTINGS.playback.isFullscreenProgressHidden,
    )
  })

  it('迁移后会忽略旧配置中的未知字段', async () => {
    const migrate = useSettingStore.persist.getOptions().migrate
    const legacyState = {
      network: {
        ...DEFAULT_SETTINGS.network,
        legacyNetworkFlag: true,
      },
      search: DEFAULT_SETTINGS.search,
      playback: {
        ...DEFAULT_SETTINGS.playback,
        removedPlaybackFlag: 24,
      },
      system: {
        ...DEFAULT_SETTINGS.system,
        removedSystemFlag: 'legacy',
      },
    }

    const migrated = (await Promise.resolve(migrate?.(legacyState, 14))) as Record<string, unknown>

    expect(migrated.network).not.toHaveProperty('legacyNetworkFlag')
    expect(migrated.playback).not.toHaveProperty('removedPlaybackFlag')
    expect(migrated.system).not.toHaveProperty('removedSystemFlag')
  })
})
