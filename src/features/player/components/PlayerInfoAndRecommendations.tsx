import { CalendarDays, Heart, MapPin, Tv } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'

interface PlayerInfoAndRecommendationsProps {
  title: string
  overview: string
  sourceName: string
  modeLabel: string
  year?: string
  area?: string
  category?: string
  cmsCover?: string
  episodeCount?: number
  favoriteAction?: {
    active: boolean
    onToggle: () => void
  }
}

export function PlayerInfoAndRecommendations({
  title,
  overview,
  sourceName,
  modeLabel,
  year,
  area,
  category,
  cmsCover,
  episodeCount,
  favoriteAction,
}: PlayerInfoAndRecommendationsProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border/60 bg-card/45 p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">影视介绍</h2>
          {favoriteAction ? (
            <Button
              size="sm"
              variant={favoriteAction.active ? 'default' : 'secondary'}
              className="h-7 rounded-full px-2.5 text-xs"
              onClick={favoriteAction.onToggle}
            >
              <Heart className={favoriteAction.active ? 'size-3.5 fill-current' : 'size-3.5'} />
              {favoriteAction.active ? '已收藏' : '收藏'}
            </Button>
          ) : null}
        </div>

        <div className="space-y-3.5 md:space-y-4">
          <div className="flex flex-col gap-3 md:grid md:grid-cols-[180px_minmax(0,1fr)] md:gap-4">
            <div className="w-full">
              <div className="relative mx-auto aspect-[2/3] w-32 overflow-hidden rounded-lg border border-border/50 bg-muted/35 md:mx-0 md:w-full">
                {cmsCover ? (
                  <img
                    src={cmsCover}
                    alt={title}
                    className="absolute inset-0 block h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="text-muted-foreground flex h-full items-center justify-center text-sm">暂无海报</div>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2.5 md:gap-3">
              <div className="space-y-1 text-center md:text-left">
                <h2 className="line-clamp-2 text-lg font-semibold md:text-2xl">{title}</h2>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-1.5 md:justify-start md:gap-2">
                <Badge variant="secondary" className="px-2.5 text-xs">
                  {sourceName}
                </Badge>
                <Badge variant="outline" className="px-2.5 text-xs">
                  {modeLabel}
                </Badge>
                {category ? (
                  <Badge variant="outline" className="px-2.5 text-xs">
                    {category}
                  </Badge>
                ) : null}
                {year ? (
                  <Badge variant="outline" className="px-2.5 text-xs">
                    <CalendarDays className="size-3.5" />
                    {year}
                  </Badge>
                ) : null}
                {area ? (
                  <Badge variant="outline" className="px-2.5 text-xs">
                    <MapPin className="size-3.5" />
                    {area}
                  </Badge>
                ) : null}
                {episodeCount ? (
                  <Badge variant="outline" className="px-2.5 text-xs">
                    <Tv className="size-3.5" />
                    共 {episodeCount} 集
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-semibold">剧情介绍</h3>
                <p className="text-muted-foreground line-clamp-4 text-sm leading-6 md:line-clamp-6">
                  {overview || '暂无剧情介绍'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
