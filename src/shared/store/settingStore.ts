import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { DEFAULT_SETTINGS } from '@/shared/config/settings.config'

interface NetworkSettings {
  defaultTimeout: number
  defaultRetry: number
  concurrencyLimit: number
  isProxyEnabled: boolean
  proxyUrl: string
}

interface SearchSettings {
  isSearchHistoryEnabled: boolean
  isSearchHistoryVisible: boolean
  maxSearchHistoryCount: number
}

interface PlaybackSettings {
  isViewingHistoryEnabled: boolean
  isViewingHistoryVisible: boolean
  isAutoPlayEnabled: boolean
  defaultEpisodeOrder: 'asc' | 'desc'
  defaultVolume: number
  playerThemeColor: string
  maxViewingHistoryCount: number
  isLoopEnabled: boolean
  isPipEnabled: boolean
  isAutoMiniEnabled: boolean
  isScreenshotEnabled: boolean
  isMobileGestureEnabled: boolean
  longPressPlaybackRate: number
  isFullscreenProgressHidden: boolean
}

interface SystemSettings {
  isUpdateLogEnabled: boolean
  isScrollChromeAnimationEnabled: boolean
}

interface SettingState {
  network: NetworkSettings
  search: SearchSettings
  playback: PlaybackSettings
  system: SystemSettings
}

interface SettingActions {
  // Network
  setNetworkSettings: (settings: Partial<NetworkSettings>) => void

  // Search
  setSearchSettings: (settings: Partial<SearchSettings>) => void

  // Playback
  setPlaybackSettings: (settings: Partial<PlaybackSettings>) => void

  // System
  setSystemSettings: (settings: Partial<SystemSettings>) => void

  // Reset
  resetSettings: () => void
}

type SettingStore = SettingState & SettingActions

const pickKnownSettings = <T extends Record<string, unknown>>(
  defaults: T,
  value: unknown,
): T => {
  const persisted = (value ?? {}) as Record<string, unknown>
  const next = { ...defaults }

  Object.keys(defaults).forEach(key => {
    if (Object.prototype.hasOwnProperty.call(persisted, key)) {
      next[key as keyof T] = persisted[key] as T[keyof T]
    }
  })

  return next
}

export const useSettingStore = create<SettingStore>()(
  devtools(
    persist(
      immer<SettingStore>(set => ({
        network: DEFAULT_SETTINGS.network,
        search: DEFAULT_SETTINGS.search,
        playback: DEFAULT_SETTINGS.playback,
        system: DEFAULT_SETTINGS.system,

        setNetworkSettings: settings => {
          set(state => {
            state.network = { ...state.network, ...settings }
          })
        },

        setSearchSettings: settings => {
          set(state => {
            state.search = { ...state.search, ...settings }
          })
        },

        setPlaybackSettings: settings => {
          set(state => {
            state.playback = { ...state.playback, ...settings }
          })
        },

        setSystemSettings: settings => {
          set(state => {
            state.system = { ...state.system, ...settings }
          })
        },

        resetSettings: () => {
          set(state => {
            state.network = DEFAULT_SETTINGS.network
            state.search = DEFAULT_SETTINGS.search
            state.playback = DEFAULT_SETTINGS.playback
            state.system = DEFAULT_SETTINGS.system
          })
        },
      })),
      {
        name: 'ouonnki-tv-setting-store',
        version: 15,
        migrate: (persistedState: unknown, version: number) => {
          const state = (persistedState ?? {}) as Record<string, unknown>
          if (version < 2 && state.playback) {
            delete (state.playback as Record<string, unknown>).adFilteringEnabled
          }
          if (version < 3) {
            const playback = (state.playback ?? {}) as Record<string, unknown>
            playback.defaultVolume ??= DEFAULT_SETTINGS.playback.defaultVolume
            playback.playerThemeColor ??= DEFAULT_SETTINGS.playback.playerThemeColor
            playback.maxViewingHistoryCount ??= DEFAULT_SETTINGS.playback.maxViewingHistoryCount
            state.playback = playback

            const network = (state.network ?? {}) as Record<string, unknown>
            network.concurrencyLimit ??= DEFAULT_SETTINGS.network.concurrencyLimit
            state.network = network

          }
          if (version < 4) {
            // v3→v4: 搜索历史上限 + 播放器功能开关
            const search = (state.search ?? {}) as Record<string, unknown>
            search.maxSearchHistoryCount ??= DEFAULT_SETTINGS.search.maxSearchHistoryCount
            state.search = search

            const playback = (state.playback ?? {}) as Record<string, unknown>
            playback.isLoopEnabled ??= DEFAULT_SETTINGS.playback.isLoopEnabled
            playback.isPipEnabled ??= DEFAULT_SETTINGS.playback.isPipEnabled
            playback.isAutoMiniEnabled ??= DEFAULT_SETTINGS.playback.isAutoMiniEnabled
            playback.isScreenshotEnabled ??= DEFAULT_SETTINGS.playback.isScreenshotEnabled
            state.playback = playback
          }
          if (version < 5) {
            const network = (state.network ?? {}) as Record<string, unknown>
            network.isProxyEnabled ??= DEFAULT_SETTINGS.network.isProxyEnabled
            network.proxyUrl ??= DEFAULT_SETTINGS.network.proxyUrl
            state.network = network
          }
          if (version < 7) {
            const playback = (state.playback ?? {}) as Record<string, unknown>
            playback.isMobileGestureEnabled ??= DEFAULT_SETTINGS.playback.isMobileGestureEnabled
            state.playback = playback
          }
          if (version < 11) {
            const system = (state.system ?? {}) as Record<string, unknown>
            system.isScrollChromeAnimationEnabled ??= DEFAULT_SETTINGS.system.isScrollChromeAnimationEnabled
            state.system = system
          }
          if (version < 12) {
            const playback = (state.playback ?? {}) as Record<string, unknown>
            playback.longPressPlaybackRate ??= DEFAULT_SETTINGS.playback.longPressPlaybackRate
            state.playback = playback
          }
          if (version < 13) {
            const playback = (state.playback ?? {}) as Record<string, unknown>
            playback.isFullscreenProgressHidden ??= DEFAULT_SETTINGS.playback.isFullscreenProgressHidden
            state.playback = playback
          }
          return {
            network: pickKnownSettings(DEFAULT_SETTINGS.network, state.network),
            search: pickKnownSettings(DEFAULT_SETTINGS.search, state.search),
            playback: pickKnownSettings(DEFAULT_SETTINGS.playback, state.playback),
            system: pickKnownSettings(DEFAULT_SETTINGS.system, state.system),
          }
        },
      },
    ),
    {
      name: 'SettingStore',
    },
  ),
)
