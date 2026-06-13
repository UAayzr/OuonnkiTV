/**
 * 主题模块统一导出
 *
 * 使用方式:
 * import { useTheme, ThemeToggle, useThemeStore } from '@/shared/components/theme'
 */

// Components
export { ThemeToggle } from './ThemeToggle'
export { ThemeColorProvider } from './ThemeColorProvider'

// Hooks
export { useThemeControl as useTheme, useThemeState } from './hooks/useTheme'

// Store
export { useThemeStore, type ThemeState } from './store'

// Theme presets
export {
  COLOR_THEME_OPTIONS,
  DEFAULT_COLOR_THEME,
  getColorThemeClassName,
  isColorTheme,
  type ColorTheme,
} from './colorThemes'

// Utils
// Utils
// No utilities exported currently

// Transitions
export { supportsViewTransitions, themeTransition, themeTransitionFromEvent } from './transitions'
