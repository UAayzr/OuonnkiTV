import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { DEFAULT_COLOR_THEME, isColorTheme, type ColorTheme } from './colorThemes'

export interface ThemeState {
  /** 主题模式: system 跟随系统, light 亮色, dark 暗色 */
  mode: 'system' | 'light' | 'dark'
  /** 颜色主题: 预设淡色风格 */
  colorTheme: ColorTheme
}

interface ThemeActions {
  setMode: (mode: ThemeState['mode']) => void
  setColorTheme: (colorTheme: ThemeState['colorTheme']) => void
  resetTheme: () => void
}

type ThemeStore = ThemeState & ThemeActions

const DEFAULT_THEME: ThemeState = {
  mode: 'system',
  colorTheme: DEFAULT_COLOR_THEME,
}

export const useThemeStore = create<ThemeStore>()(
  devtools(
    persist(
      immer<ThemeStore>(set => ({
        ...DEFAULT_THEME,

        setMode: mode => {
          set(state => {
            state.mode = mode
          })
        },

        setColorTheme: colorTheme => {
          set(state => {
            state.colorTheme = colorTheme
          })
        },

        resetTheme: () => {
          set(state => {
            state.mode = DEFAULT_THEME.mode
            state.colorTheme = DEFAULT_THEME.colorTheme
          })
        },
      })),
      {
        name: 'ouonnki-tv-theme-store',
        version: 3,
        migrate: (persistedState, version) => {
          const state =
            persistedState && typeof persistedState === 'object'
              ? (persistedState as Partial<ThemeState>)
              : {}
          const colorTheme =
            version < 3 && state.colorTheme === 'default'
              ? DEFAULT_THEME.colorTheme
              : state.colorTheme

          return {
            ...DEFAULT_THEME,
            ...state,
            colorTheme: isColorTheme(colorTheme) ? colorTheme : DEFAULT_THEME.colorTheme,
          }
        },
      },
    ),
    {
      name: 'ThemeStore',
    },
  ),
)
