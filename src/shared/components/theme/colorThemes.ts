export const COLOR_THEME_CLASS_PREFIX = 'theme-'

export const COLOR_THEME_OPTIONS = [
  {
    value: 'default',
    label: '默认',
    swatches: ['oklch(0.97 0 0)', 'oklch(0.205 0 0)', 'oklch(0.708 0 0)'],
  },
  {
    value: 'sakura',
    label: '樱粉',
    swatches: ['oklch(0.96 0.035 12)', 'oklch(0.62 0.12 12)', 'oklch(0.88 0.055 38)'],
  },
  {
    value: 'mist',
    label: '雾蓝',
    swatches: ['oklch(0.95 0.03 230)', 'oklch(0.58 0.105 238)', 'oklch(0.89 0.04 190)'],
  },
  {
    value: 'mint',
    label: '薄荷',
    swatches: ['oklch(0.95 0.035 155)', 'oklch(0.56 0.105 160)', 'oklch(0.9 0.04 200)'],
  },
  {
    value: 'apricot',
    label: '奶杏',
    swatches: ['oklch(0.96 0.04 70)', 'oklch(0.62 0.12 58)', 'oklch(0.9 0.045 30)'],
  },
  {
    value: 'lavender',
    label: '薰衣草',
    swatches: ['oklch(0.95 0.035 300)', 'oklch(0.6 0.11 295)', 'oklch(0.9 0.04 250)'],
  },
] as const

export type ColorTheme = (typeof COLOR_THEME_OPTIONS)[number]['value']

export const DEFAULT_COLOR_THEME: ColorTheme = 'default'

const COLOR_THEME_VALUES = COLOR_THEME_OPTIONS.map(option => option.value)

export function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === 'string' && COLOR_THEME_VALUES.includes(value as ColorTheme)
}

export function getColorThemeClassName(theme: ColorTheme) {
  return theme === DEFAULT_COLOR_THEME ? null : `${COLOR_THEME_CLASS_PREFIX}${theme}`
}
