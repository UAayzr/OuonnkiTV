import { lazy, Suspense } from 'react'
import { useIdleReady } from '@/shared/hooks/useIdleReady'

const LazyToaster = lazy(() =>
  import('@/shared/components/ui/sonner').then(module => ({
    default: module.Toaster,
  })),
)

export default function DeferredToaster() {
  const ready = useIdleReady(1400)

  if (!ready) return null

  return (
    <Suspense fallback={null}>
      <LazyToaster richColors position="top-center" />
    </Suspense>
  )
}
