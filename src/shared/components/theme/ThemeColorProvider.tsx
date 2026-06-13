import { useLayoutEffect, type ReactNode } from 'react'
import { COLOR_THEME_CLASS_PREFIX, getColorThemeClassName } from './colorThemes'
import { useThemeStore } from './store'

interface ThemeColorProviderProps {
  children: ReactNode
}

export function ThemeColorProvider({ children }: ThemeColorProviderProps) {
  const colorTheme = useThemeStore(state => state.colorTheme)

  useLayoutEffect(() => {
    const root = document.documentElement

    Array.from(root.classList)
      .filter(className => className.startsWith(COLOR_THEME_CLASS_PREFIX))
      .forEach(className => root.classList.remove(className))

    const nextClassName = getColorThemeClassName(colorTheme)
    if (nextClassName) {
      root.classList.add(nextClassName)
    }
  }, [colorTheme])

  return <>{children}</>
}
