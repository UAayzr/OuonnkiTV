import { useEffect, useState, useRef, useCallback } from 'react'
import { Search, X, ArrowLeft, History, Trash2 } from 'lucide-react'

import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Popover, PopoverContent, PopoverAnchor } from '@/shared/components/ui/popover'
import { useSearch, useSearchHistory } from '@/shared/hooks'
import { ScrollArea } from '@/shared/components/ui/scroll-area'

interface SearchBoxProps {
  /** 移动端搜索框展开状态变化回调，用于父组件调整布局 */
  onMobileSearchChange?: (isOpen: boolean) => void
}

export default function SearchBox({ onMobileSearchChange }: SearchBoxProps) {
  const { search: searchQuery, searchMovie } = useSearch()
  const { searchHistory, removeSearchHistoryItem } = useSearchHistory()

  const [inputContent, setInputContent] = useState('')
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const mobileInputRef = useRef<HTMLInputElement>(null)
  const desktopInputRef = useRef<HTMLInputElement>(null)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 判断是否应该显示下拉框
  const hasContent = inputContent.trim().length > 0
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

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      searchMovie(inputContent)
      setIsDropdownOpen(false)
    }
    if (event.key === 'Escape') {
      setIsDropdownOpen(false)
    }
  }

  const handleClear = () => {
    setInputContent('')
  }

  const handleInputChange = (value: string) => {
    setInputContent(value)
  }

  const handleFocus = () => {
    // 清除之前的 blur 超时
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
    }
    setIsDropdownOpen(true)
  }

  const handleBlur = () => {
    // 延迟关闭以允许点击下拉项
    blurTimeoutRef.current = setTimeout(() => {
      setIsDropdownOpen(false)
    }, 200)
  }

  const handleHistoryItemClick = useCallback(
    (content: string) => {
      setInputContent(content)
      searchMovie(content)
      setIsDropdownOpen(false)
    },
    [searchMovie],
  )

  const handleHistoryItemDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      removeSearchHistoryItem(id)
    },
    [removeSearchHistoryItem],
  )

  const openMobileSearch = () => {
    setIsMobileSearchOpen(true)
    onMobileSearchChange?.(true)
    // 等待动画开始后聚焦输入框
    setTimeout(() => {
      mobileInputRef.current?.focus()
    }, 100)
  }

  const closeMobileSearch = () => {
    setIsMobileSearchOpen(false)
    setIsDropdownOpen(false)
    onMobileSearchChange?.(false)
  }

  useEffect(() => {
    setInputContent(searchQuery)
  }, [searchQuery])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
      }
    }
  }, [])

  // 下拉框内容组件
  const DropdownContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="p-1">
      <ScrollArea className="max-h-100 px-3">
        <div>
          <div className="text-muted-foreground px-3 py-2 text-xs font-medium">最近搜索</div>
          {searchHistory.map(item => (
            <div
              key={item.id}
              className="hover:bg-accent group flex cursor-pointer items-center rounded-lg px-3 py-2 transition-colors"
              onClick={() => handleHistoryItemClick(item.content)}
              role="button"
              tabIndex={0}
              onKeyDown={e => handleInteractiveItemKeyDown(e, () => handleHistoryItemClick(item.content))}
            >
              <History className="text-muted-foreground mr-3 size-4 shrink-0" />
              <span className="flex-1 truncate">{item.content}</span>
              <button
                type="button"
                className={`text-muted-foreground hover:text-destructive shrink-0 p-1 transition-colors ${
                  isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                onMouseDown={e => e.preventDefault()}
                onKeyDown={e => e.stopPropagation()}
                onClick={e => handleHistoryItemDelete(e, item.id)}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )

  return (
    <>
      {/* 移动端搜索模式下的返回按钮 */}
      <div
        className={`absolute left-2 transition-[opacity,transform] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)] motion-reduce:transition-none sm:hidden ${
          isMobileSearchOpen
            ? 'translate-x-0 opacity-100'
            : 'pointer-events-none -translate-x-4 opacity-0'
        }`}
      >
        <Button size="icon" variant="ghost" className="size-9" onClick={closeMobileSearch}>
          <ArrowLeft className="text-primary" size={20} />
        </Button>
      </div>

      {/* 搜索框容器 */}
      <div className="flex flex-auto items-center">
        {/* 桌面端搜索框 */}
        <Popover open={shouldShowDropdown && !isMobileSearchOpen}>
          <PopoverAnchor asChild>
            <div className="relative hidden w-full sm:flex">
              <Search
                className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2"
                size={18}
              />
              <Input
                ref={desktopInputRef}
                placeholder="搜索"
                className="bg-background/85 h-9 rounded-full rounded-r-none border-r-0 pr-10 pl-10 overflow-ellipsis shadow-sm transition-[border-color,box-shadow,background-color] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)] focus-visible:ring-1"
                value={inputContent}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
              {inputContent.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-[84px] z-10 -translate-y-1/2 rounded-full p-1 transition-[color,background-color,transform] duration-[var(--motion-duration-tap)] ease-[var(--motion-ease-soft-rebound)] hover:-translate-y-[calc(50%+1px)] hover:bg-muted active:-translate-y-1/2 active:scale-[0.94] motion-reduce:transition-none"
                >
                  <X size={16} />
                </button>
              )}
              <Button
                disabled={inputContent.length === 0}
                className="h-9 w-20 rounded-full rounded-l-none border-l-0 bg-muted/90 text-primary shadow-sm shadow-black/5 transition-[background-color,box-shadow,transform,color] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)] hover:bg-muted hover:shadow-md hover:shadow-black/8 disabled:opacity-100 disabled:hover:translate-y-0 dark:bg-accent/80 dark:hover:bg-accent"
                onClick={() => {
                  searchMovie(inputContent)
                  setIsDropdownOpen(false)
                }}
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
            <DropdownContent />
          </PopoverContent>
        </Popover>

        {/* 移动端展开的搜索框 */}
        <Popover open={shouldShowDropdown && isMobileSearchOpen}>
          <PopoverAnchor asChild>
            <div
              className={`absolute right-4 left-12 transition-[opacity,transform] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)] motion-reduce:transition-none sm:hidden ${
                isMobileSearchOpen
                  ? 'scale-100 opacity-100'
                  : 'pointer-events-none scale-95 opacity-0'
              }`}
            >
              <div className="relative flex w-full rounded-full shadow-sm shadow-black/5">
                <Search
                  className="text-muted-foreground absolute top-1/2 left-3 z-10 -translate-y-1/2"
                  size={18}
                />
                <Input
                  ref={mobileInputRef}
                  placeholder="搜索"
                  className="bg-background/90 h-9 rounded-full rounded-r-none border-r-0 pr-9 pl-10 overflow-ellipsis transition-[border-color,box-shadow,background-color] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)] focus-visible:ring-1"
                  value={inputContent}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
                {inputContent.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-[52px] z-10 -translate-y-1/2 rounded-full p-1 transition-[color,background-color,transform] duration-[var(--motion-duration-tap)] ease-[var(--motion-ease-soft-rebound)] hover:-translate-y-[calc(50%+1px)] hover:bg-muted active:-translate-y-1/2 active:scale-[0.94] motion-reduce:transition-none"
                  >
                    <X size={16} />
                  </button>
                )}
                <Button
                  disabled={inputContent.length === 0}
                  className="h-9 w-12 rounded-full rounded-l-none border-l-0 bg-muted/90 text-primary shadow-sm shadow-black/5 transition-[background-color,box-shadow,transform,color] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)] hover:bg-muted hover:shadow-md hover:shadow-black/8 disabled:opacity-100 disabled:hover:translate-y-0 dark:bg-accent/80 dark:hover:bg-accent"
                  onClick={() => {
                    searchMovie(inputContent)
                    setIsDropdownOpen(false)
                  }}
                >
                  <span className={`${searchButtonContentClass} ${searchButtonStateClass}`}>
                    <Search className="text-primary" size={18} />
                  </span>
                </Button>
              </div>
            </div>
          </PopoverAnchor>
          <PopoverContent
            className="w-[calc(100vw-64px)] p-0"
            align="start"
            sideOffset={8}
            onOpenAutoFocus={e => e.preventDefault()}
          >
            <DropdownContent isMobile />
          </PopoverContent>
        </Popover>
      </div>

      {/* 移动端搜索触发按钮 */}
      <Button
        size="icon"
        variant="ghost"
        className="size-7 sm:hidden"
        onClick={openMobileSearch}
      >
        {!isMobileSearchOpen && (
          <span className="animate-[active-bg-in_var(--motion-duration-tap)_var(--motion-ease-rebound)] rounded-full motion-reduce:animate-none">
            <Search className="text-primary" size={20} />
          </span>
        )}
      </Button>

      {/* 用于传递移动端搜索状态给父组件的隐藏元素 */}
      <input type="hidden" data-mobile-search-open={isMobileSearchOpen} />
    </>
  )
}

export { SearchBox }
export type { SearchBoxProps }
