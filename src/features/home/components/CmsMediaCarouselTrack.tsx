import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MediaPosterCard } from '@/shared/components/common'
import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@/shared/components/ui/carousel'
import { Button } from '@/shared/components/ui/button'
import { buildCmsPlayPath } from '@/shared/lib/routes'
import type { VideoItem } from '@ouonnki/cms-core'

interface CmsMediaCarouselTrackProps {
  items: VideoItem[]
  slidesToScroll: number
}

export function CmsMediaCarouselTrack({ items, slidesToScroll }: CmsMediaCarouselTrackProps) {
  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  useEffect(() => {
    if (!carouselApi) return

    const onSelect = () => {
      setCanScrollPrev(carouselApi.canScrollPrev())
      setCanScrollNext(carouselApi.canScrollNext())
    }

    onSelect()
    carouselApi.on('select', onSelect)
    carouselApi.on('reInit', onSelect)

    return () => {
      carouselApi.off('select', onSelect)
      carouselApi.off('reInit', onSelect)
    }
  }, [carouselApi])

  return (
    <Carousel opts={{ watchDrag: true, slidesToScroll }} setApi={setCarouselApi}>
      <CarouselContent>
        {items.map(item => (
          <CarouselItem
            key={`${item.source_code}-${item.vod_id}`}
            className="h-fit basis-1/3 md:basis-1/4 lg:basis-1/6"
          >
            <MediaPosterCard
              to={buildCmsPlayPath(item.source_code || '', String(item.vod_id))}
              posterUrl={item.vod_pic}
              title={item.vod_name}
              year={item.vod_year}
              topRightLabel={item.vod_remarks || undefined}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      {canScrollPrev && (
        <Button
          variant="outline"
          size="icon"
          className="absolute top-1/2 -left-5 size-10 -translate-y-1/2 rounded-full transition-[opacity,transform] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)] hover:-translate-y-[calc(50%+1px)] active:-translate-y-1/2 md:size-12 lg:opacity-0 lg:group-hover/carousel:opacity-100 dark:bg-zinc-800"
          onClick={() => carouselApi?.scrollPrev()}
        >
          <ChevronLeft className="size-4 translate-x-1.5 md:size-6 md:translate-x-0.5" />
        </Button>
      )}
      {canScrollNext && (
        <Button
          variant="outline"
          size="icon"
          className="absolute top-1/2 -right-5 size-10 -translate-y-1/2 rounded-full transition-[opacity,transform] duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)] hover:-translate-y-[calc(50%+1px)] active:-translate-y-1/2 md:size-12 lg:opacity-0 lg:group-hover/carousel:opacity-100 dark:bg-zinc-800"
          onClick={() => carouselApi?.scrollNext()}
        >
          <ChevronRight className="size-4 -translate-x-1.5 md:size-6 md:-translate-x-0.5" />
        </Button>
      )}
    </Carousel>
  )
}
