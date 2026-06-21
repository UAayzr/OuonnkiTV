import { Skeleton } from '@/shared/components/ui/skeleton'

export function PlayerLoadingSkeleton() {
  return (
    <div className="space-y-4 md:space-y-5">
      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
          <Skeleton className="aspect-video min-h-[180px] w-full sm:h-[clamp(240px,56vw,74vh)] sm:min-h-[220px] sm:aspect-auto" />
        </section>

        <aside className="xl:sticky xl:top-20 xl:h-[clamp(240px,56vw,74vh)] xl:min-h-[220px] xl:pr-1">
          <section className="space-y-3 rounded-lg border border-border/60 bg-card/55 p-3 md:p-4 xl:h-full xl:min-h-0">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:content-start">
              {Array.from({ length: 12 }).map((_, index) => (
                <Skeleton key={`player-cms-episode-skeleton-${index}`} className="h-9 w-full rounded-md" />
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="space-y-3 rounded-lg border border-border/60 bg-card/45 p-4 md:p-5">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>

        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 md:grid-cols-[180px_minmax(0,1fr)] md:gap-4">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <div className="space-y-2.5 md:space-y-3">
            <div className="space-y-1">
              <Skeleton className="h-6 w-[70%] max-w-[320px]" />
              <Skeleton className="h-4 w-[45%] max-w-[220px]" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
            <div className="space-y-2 pt-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[92%]" />
              <Skeleton className="h-4 w-[78%]" />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
