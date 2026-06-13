import { Slot } from '@radix-ui/react-slot'
import { useThemeControl } from './hooks/useTheme'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { COLOR_THEME_OPTIONS } from './colorThemes'
import { cn } from '@/shared/lib'
import { Popover, PopoverAnchor, PopoverContent } from '@/shared/components/ui/popover'

interface ThemeToggleProps {
  children: ReactNode
  /**
   * 是否将 props 合并到子元素上
   * @default true
   */
  asChild?: boolean
}

const LONG_PRESS_DELAY = 450

/**
 * 主题切换组件 (Headless)
 * 使用 asChild 模式，将切换行为注入到任意子元素
 *
 * @example
 * ```tsx
 * // 基础用法 - 包裹任意元素
 * <ThemeToggle>
 *   <Button size="icon" variant="ghost">
 *     {isDark ? <Sun /> : <Moon />}
 *   </Button>
 * </ThemeToggle>
 *
 * // 自定义样式
 * <ThemeToggle>
 *   <div className="custom-toggle">Toggle Theme</div>
 * </ThemeToggle>
 * ```
 */
export function ThemeToggle({ children, asChild = true }: ThemeToggleProps) {
  const { changeMode, colorTheme, mode, setColorTheme } = useThemeControl()
  const lastClickEvent = useRef<MouseEvent | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const longPressTriggered = useRef(false)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)

  const Comp = asChild ? Slot : 'button'

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        window.clearTimeout(longPressTimer.current)
      }
    }
  }, [])

  const handlePointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) {
      return
    }

    lastClickEvent.current = e.nativeEvent as unknown as MouseEvent
    longPressTriggered.current = false
    clearLongPressTimer()

    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true
      setIsPaletteOpen(true)
    }, LONG_PRESS_DELAY)
  }

  const handlePointerEnd = () => {
    clearLongPressTimer()
  }

  const handleClick = () => {
    clearLongPressTimer()

    if (longPressTriggered.current) {
      longPressTriggered.current = false
      lastClickEvent.current = null
      return
    }

    const nextMode = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light'
    changeMode(nextMode, lastClickEvent.current ?? undefined)
    lastClickEvent.current = null
    setIsPaletteOpen(false)
  }

  return (
    <Popover
      open={isPaletteOpen}
      onOpenChange={open => {
        clearLongPressTimer()
        setIsPaletteOpen(open)
      }}
    >
      <PopoverAnchor asChild>
        <Comp
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={handlePointerEnd}
          onClick={handleClick}
          aria-label={
            mode === 'light'
              ? '切换到暗色模式'
              : mode === 'dark'
                ? '切换到跟随系统'
                : '切换到亮色模式'
          }
        >
          {children}
        </Comp>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-64 max-w-[calc(100vw-1rem)] p-2">
        <div className="grid grid-cols-2 gap-1">
          {COLOR_THEME_OPTIONS.map(option => {
            const isActive = colorTheme === option.value

            return (
              <button
                key={option.value}
                type="button"
                aria-label={`选择${option.label}主题`}
                aria-pressed={isActive}
                onClick={() => {
                  setColorTheme(option.value)
                  setIsPaletteOpen(false)
                }}
                className={cn(
                  'hover:bg-accent focus-visible:border-ring focus-visible:ring-ring/50 flex h-10 items-center gap-2 rounded-md px-2 text-left text-sm outline-none transition-colors focus-visible:ring-[3px]',
                  isActive ? 'text-primary' : 'text-popover-foreground',
                )}
              >
                <span className="border-border flex size-5 shrink-0 overflow-hidden rounded-full border">
                  {option.swatches.map(swatch => (
                    <span key={swatch} className="h-full flex-1" style={{ background: swatch }} />
                  ))}
                </span>
                <span className="min-w-0 flex-1 whitespace-nowrap">{option.label}</span>
                <Check
                  className={cn(
                    'size-3.5 shrink-0 transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
