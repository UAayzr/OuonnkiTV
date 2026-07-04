import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { X } from 'lucide-react'
import { useDocumentTitle, useSearchHistory } from '@/shared/hooks'
import { useSearchStore } from '@/shared/store/searchStore'
import { OkiLogo } from '@/shared/components/icons'

import {
  SearchHubInput,
  SearchDirectSection,
} from '../components'

/**
 * SearchHubView - 搜索中心视图
 * 直连搜索页面
 */
export default function SearchHubView() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const isEmptySearch = !query

  // 搜索历史写入收敛到显式搜索动作，避免 URL 被动同步导致冗余写入
  const { addSearchHistoryItem } = useSearchStore()
  const { searchHistory, removeSearchHistoryItem, clearSearchHistory } = useSearchHistory()

  // 动态更新页面标题
  useDocumentTitle(query ? `${query} - 搜索` : '搜索中心')

  // 处理搜索
  const handleSearch = useCallback(
    (searchQuery: string) => {
      const normalizedQuery = searchQuery.trim().replace(/\s+/g, ' ')
      if (!normalizedQuery) return

      addSearchHistoryItem(normalizedQuery)

      // 更新 URL
      setSearchParams(prev => {
        const params = new URLSearchParams(prev)
        params.set('q', normalizedQuery)
        params.delete('mode')
        return params
      })
    },
    [addSearchHistoryItem, setSearchParams],
  )

  // 处理清除搜索
  const handleClear = useCallback(() => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      params.delete('q')
      return params
    })
  }, [setSearchParams])

  return (
    <div
      className={`flex flex-col gap-6 p-4 pb-8 ${isEmptySearch ? 'min-h-[60vh] justify-center' : ''}`}
    >
      {/* 搜索区域 */}
      <div className="flex w-full flex-col items-center gap-4">
        {/* 品牌标识 - 无搜索内容时显示 */}
        {isEmptySearch && (
          <div className="flex flex-col items-center gap-2">
            <OkiLogo size={56} />
            <span className="text-muted-foreground text-sm tracking-wide">发现你的下一部好剧</span>
          </div>
        )}

        {/* 搜索框 */}
        <div className="flex w-full justify-center">
          <SearchHubInput
            initialQuery={query}
            onSearch={handleSearch}
            onClear={handleClear}
          />
        </div>

        {/* 搜索历史徽标 */}
        {isEmptySearch && searchHistory.length > 0 && (
            <div className="flex w-full max-w-3xl flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-muted-foreground text-xs">最近搜索</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                  onClick={clearSearchHistory}
                >
                  清除
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchHistory.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="bg-secondary hover:bg-secondary/80 text-secondary-foreground group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors"
                    onClick={() => handleSearch(item.content)}
                  >
                    <span className="max-w-[10rem] truncate">{item.content}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-muted-foreground hover:text-destructive -mr-1 shrink-0 rounded-full p-0.5 opacity-0 transition-all group-hover:opacity-100"
                      onClick={e => {
                        e.stopPropagation()
                        removeSearchHistoryItem(item.id)
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          removeSearchHistoryItem(item.id)
                        }
                      }}
                    >
                      <X size={12} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
      </div>

      {/* 结果区域 */}
      <div className="flex w-full flex-col gap-6">
        <SearchDirectSection key="direct" query={query} />
      </div>
    </div>
  )
}
