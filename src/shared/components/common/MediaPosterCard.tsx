import { Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router'
import { AspectRatio } from '@/shared/components/ui/aspect-ratio'
import type { SourceColorScheme } from '@/shared/lib/source-colors'

interface MediaPosterCardProps {
  /** 链接地址 */
  to: string
  /** 海报图片 URL */
  posterUrl?: string | null
  /** 标题 */
  title: string
  /** 海报比例，默认 2/3 */
  aspectRatio?: number
  /** 是否显示标题，默认 true */
  showTitle?: boolean
  /** 年份 - 显示在左上角 */
  year?: string | number
  /** 右上角标签 */
  topRightLabel?: string
  /** 右上角标签配色方案（不传则使用默认黄色） */
  topRightLabelColorScheme?: SourceColorScheme
  /** 评分 (0-10) - 显示在右下角 */
  rating?: number
}

/**
 * MediaPosterCard - 媒体海报卡片组件
 * 通用的海报卡片，支持海报显示、hover 效果、播放按钮遮罩
 */
export function MediaPosterCard({
  to,
  posterUrl,
  title,
  aspectRatio = 2 / 3,
  showTitle = true,
  year,
  topRightLabel,
  topRightLabelColorScheme,
  rating,
}: MediaPosterCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const posterSrc = !imageFailed && posterUrl ? posterUrl : undefined

  useEffect(() => {
    setImageFailed(false)
  }, [posterUrl])

  // 使用自定义配色或默认配色
  const labelColor = topRightLabelColorScheme || { bg: '250, 204, 21', text: '120, 53, 15' } // yellow-400 和 amber-950 的 RGB 值

  // 计算样式
  const labelStyle = {
    backgroundColor: `rgb(${labelColor.bg})`,
    color: `rgb(${labelColor.text})`,
  }
  return (
    <NavLink to={to} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <div className="group cursor-pointer transition-transform duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)] hover:-translate-y-px active:translate-y-0 active:scale-[0.988] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100">
        {/* 海报卡片 */}
        <div className="relative overflow-hidden rounded-lg bg-muted shadow-sm transition-[box-shadow,transform] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)] group-hover:shadow-lg group-hover:shadow-black/10">
          <AspectRatio ratio={aspectRatio}>
            {posterSrc ? (
              <img
                className="h-full w-full bg-muted object-cover transition-transform duration-[300ms] ease-[var(--motion-ease-soft-rebound)] group-hover:scale-[1.025] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                src={posterSrc}
                alt={title}
                decoding="async"
                loading="lazy"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <div className="bg-muted flex h-full w-full items-center justify-center">
                <span className="text-muted-foreground px-2 text-center text-xs">暂无海报</span>
              </div>
            )}
            
            {/* 上下遮罩 - 增强文字可读性 */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent transition-opacity duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-standard)] group-hover:opacity-20" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent transition-opacity duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-standard)] group-hover:opacity-35" />

            {/* 信息徽标 */}
            {year && (
              <div className="absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] items-center font-medium text-white/90 transition-[opacity,transform] duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-soft-rebound)] group-hover:-translate-y-1 group-hover:opacity-0">
                {year}
              </div>
            )}

            {topRightLabel && (
              <div
                className="absolute right-0 top-0 rounded-bl-md rounded-tr-lg px-2 py-0.5 text-[10px] font-medium shadow-sm transition-[opacity,transform] duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-soft-rebound)] group-hover:-translate-y-1 group-hover:opacity-0"
                style={labelStyle}
              >
                {topRightLabel}
              </div>
            )}

            {rating !== undefined && rating > 0 && (
              <div className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-yellow-400 transition-[opacity,transform] duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-soft-rebound)] group-hover:translate-y-1 group-hover:opacity-0">
                <span>★</span>
                <span>{rating.toFixed(1)}</span>
              </div>
            )}
          </AspectRatio>
          {/* Hover 全卡片遮罩 + 播放按钮 */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/32 opacity-0 transition-opacity duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-standard)] group-hover:opacity-100">
            <div className="flex size-12 translate-y-1.5 scale-[0.96] items-center justify-center rounded-full bg-white/92 text-black shadow-xl backdrop-blur-sm transition-[opacity,transform] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-rebound)] group-hover:translate-y-0 group-hover:scale-100 motion-reduce:transition-none">
              <Play className="size-6 fill-current" />
            </div>
          </div>
        </div>
        {/* 标题 - 卡片下方 */}
        {showTitle && (
          <div className="mt-2 px-0.5">
            <p className="text-primary line-clamp-1 text-sm font-medium transition-colors duration-200 group-hover:text-primary/85">{title}</p>
          </div>
        )}
      </div>
    </NavLink>
  )
}
