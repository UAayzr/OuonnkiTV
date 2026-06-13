import { useSettingStore } from '@/shared/store/settingStore'
import { hasTmdbApiToken } from '@/shared/lib/tmdb'

function hasConfiguredTmdbToken(userToken: string): boolean {
  return Boolean(userToken.trim() || import.meta.env.OKI_TMDB_API_TOKEN)
}

/** 获取当前 TMDB 模式是否启用（React hook） */
export function useTmdbEnabled(): boolean {
  return useSettingStore(state => state.system.tmdbEnabled && hasConfiguredTmdbToken(state.system.tmdbApiToken))
}

/** 非 hook 场景下获取 TMDB 模式状态 */
export function isTmdbEnabled(): boolean {
  return useSettingStore.getState().system.tmdbEnabled && hasTmdbApiToken()
}
