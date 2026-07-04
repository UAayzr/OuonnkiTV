import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, History, Trash2 } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Popover, PopoverContent, PopoverAnchor } from '@/shared/components/ui/popover'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { useSearchHistory } from '@/shared/hooks'

interface SearchHubInputProps {
  /** Initial query from URL */
  initialQuery: string
  /** Callback when search is triggered */
  onSearch: (query: string) => void
  /** Callback when clear button is clicked */
  onClear?: () => void
  className?: string
}

export function SearchHubInput({
  initialQuery,
  onSearch,
  onClear,
  className,
}: SearchHubInputProps) {
  const [inputValue, setInputValue] = useState(initialQuery)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { searchHistory, removeSearchHistoryItem } = useSearchHistory()

  // Sync with initialQuery prop (e.g. when URL changes)
  useEffect(() => {
    setInputValue(initialQuery)
  }, [initialQuery])

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
      }
    }
  }, [])

  // Derived state for dropdown
  const hasContent = inputValue.trim().length > 0
  const hasHistory = searchHistory.length > 0
  const shouldShowDropdown = isDropdownOpen && !hasContent && hasHistory
  const searchButtonContentClass =
    'inline-flex items-center justify-center transition-[opacity,transform] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)] motion-reduce:transition-none'
  const searchButtonStateClass = hasContent
    ? 'opacity-100 translate-x-0 scale-100'
    : 'opacity-45 translate-x-0 scale-[0.96]'

  const handleInteractiveItemKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    action: () => void,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    action()
  }

  const handleSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) return

      setInputValue(searchQuery)
      setIsDropdownOpen(false)
      onSearch(searchQuery)
    },
    [onSearch],
  )

  const handleInputChange = (value: string) => {
    setInputValue(value)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSearch(inputValue)
    }
    if (event.key === 'Escape') {
      setIsDropdownOpen(false)
      inputRef.current?.blur()
    }
  }

  const handleFocus = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
    }
    setIsDropdownOpen(true)
  }

  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => {
      setIsDropdownOpen(false)
    }, 200)
  }

  const handleClear = () => {
    setInputValue('')
    onClear?.()
    inputRef.current?.focus()
  }

  return (
    <div className={`w-full max-w-3xl ${className}`}>
      <Popover open={shouldShowDropdown}>
        <PopoverAnchor asChild>
          <div className="relative flex w-full">
            <Search
              className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2"
              size={18}
            />
            <Input
              ref={inputRef}
              placeholder="搜索电影、剧集..."
              className="bg-background/90 h-11 rounded-full rounded-r-none border-r-0 pr-10 pl-10 text-base shadow-sm transition-[border-color,box-shadow,background-color] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)] focus-visible:ring-1"
              value={inputValue}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
            {inputValue.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-[88px] z-10 -translate-y-1/2 rounded-full p-1 transition-[color,background-color,transform] duration-[var(--motion-duration-tap)] ease-[var(--motion-ease-soft-rebound)] hover:-translate-y-[calc(50%+1px)] hover:bg-muted active:-translate-y-1/2 active:scale-[0.94] motion-reduce:transition-none"
              >
                <X size={16} />
              </button>
            )}
            <Button
              disabled={inputValue.length === 0}
              className="h-11 w-20 rounded-full rounded-l-none border-l-0 bg-muted/90 text-primary shadow-sm shadow-black/5 transition-[background-color,box-shadow,transform,color] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)] hover:bg-muted hover:shadow-md hover:shadow-black/8 disabled:opacity-100 disabled:hover:translate-y-0 dark:bg-accent/80 dark:hover:bg-accent"
              onClick={() => handleSearch(inputValue)}
            >
              <span className={`${searchButtonContentClass} ${searchButtonStateClass}`}>
                <Search className="text-primary" size={20} />
              </span>
            </Button>
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          sideOffset={8}
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <div className="p-1">
            <ScrollArea className="max-h-80 px-3">
              <div>
                <div className="text-muted-foreground px-3 py-2 text-xs font-medium">
                  最近搜索
                </div>
                {searchHistory.map(item => (
                  <div
                    key={item.id}
                    className="hover:bg-accent group flex cursor-pointer items-center rounded-lg px-3 py-2 transition-colors"
                    onClick={() => handleSearch(item.content)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => handleInteractiveItemKeyDown(e, () => handleSearch(item.content))}
                  >
                    <History className="text-muted-foreground mr-3 size-4 shrink-0" />
                    <span className="flex-1 truncate">{item.content}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive shrink-0 p-1 opacity-0 transition-colors group-hover:opacity-100"
                      onMouseDown={e => e.preventDefault()}
                      onKeyDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation()
                        removeSearchHistoryItem(item.id)
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
