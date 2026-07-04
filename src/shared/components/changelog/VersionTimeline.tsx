import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib'
import { useIsMobile } from '@/shared/hooks/use-mobile'
import { VersionDetail } from './VersionDetail'

interface VersionUpdate {
  version: string
  title: string
  date: string
  features: string[]
  fixes?: string[]
  breaking?: string[]
}

interface VersionTimelineProps {
  versions: VersionUpdate[]
  selectedVersion: VersionUpdate
  onSelectVersion: (version: VersionUpdate) => void
}

/** 桌面端：左侧时间轴列表 */
function DesktopTimeline({ versions, selectedVersion, onSelectVersion }: VersionTimelineProps) {
  return (
    <div className="relative w-48 shrink-0">
      <div className="bg-border absolute top-0 bottom-0 left-[11px] w-px" />

      <div className="space-y-1">
        {versions.map(version => {
          const isSelected = version.version === selectedVersion.version
          const isLatest = version === versions[0]

          return (
            <button
              key={version.version}
              type="button"
              onClick={() => onSelectVersion(version)}
              className="relative flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-[color,transform] duration-[var(--motion-duration-tap)] ease-[var(--motion-ease-soft-rebound)] hover:-translate-y-px active:translate-y-0 active:scale-[0.982] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
            >
              {isSelected && (
                <span className="bg-muted/55 absolute inset-0 animate-[active-bg-in_var(--motion-duration-pop)_var(--motion-ease-rebound)] rounded-lg motion-reduce:animate-none" />
              )}

              <span
                className={cn(
                  'relative z-10 mt-1.5 size-[7px] shrink-0 rounded-full ring-2',
                  isLatest
                    ? 'bg-primary ring-primary/30'
                    : isSelected
                      ? 'bg-muted-foreground ring-muted-foreground/30'
                      : 'bg-border ring-border',
                )}
              />

              <div className="relative z-10 min-w-0 space-y-0.5">
                <p
                  className={cn(
                    'truncate text-sm font-medium',
                    isSelected ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  v{version.version}
                </p>
                <p className="text-muted-foreground truncate text-xs">{version.title}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 移动端：手风琴式折叠列表 */
function MobileAccordion({ versions }: { versions: VersionUpdate[] }) {
  const [expandedVersion, setExpandedVersion] = useState<string>(versions[0]?.version ?? '')

  const toggleExpand = (version: string) => {
    setExpandedVersion(prev => (prev === version ? '' : version))
  }

  return (
    <div className="space-y-2">
      {versions.map(version => {
        const isExpanded = expandedVersion === version.version
        const isLatest = version === versions[0]

        return (
          <div key={version.version} className="relative pl-5">
            <div className="bg-border absolute top-0 bottom-0 left-[3px] w-px" />
            <span
              className={cn(
                'absolute top-3 left-0 size-[7px] rounded-full',
                isLatest ? 'bg-primary' : 'bg-border',
              )}
            />

            <button
              type="button"
              onClick={() => toggleExpand(version.version)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-[background-color,transform] duration-[var(--motion-duration-tap)] ease-[var(--motion-ease-soft-rebound)] hover:-translate-y-px active:translate-y-0 active:scale-[0.982] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100',
                isExpanded ? 'bg-muted/55' : 'hover:bg-muted/35',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">v{version.version}</span>
                  <span className="text-muted-foreground truncate text-sm">{version.title}</span>
                </div>
                <p className="text-muted-foreground text-xs">{version.date}</p>
              </div>
              <ChevronDown
                className={cn(
                  'text-muted-foreground size-4 shrink-0 transition-transform duration-[var(--motion-duration-pop)] ease-[var(--motion-ease-soft-rebound)]',
                  isExpanded && 'rotate-180',
                )}
              />
            </button>

            {isExpanded && (
              <div className="grid animate-[accordion-in_var(--motion-duration-panel)_var(--motion-ease-soft-rebound)] overflow-hidden motion-reduce:animate-none">
                <div className="min-h-0 px-1 pt-2 pb-1">
                  <VersionDetail version={version} />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function VersionTimeline(props: VersionTimelineProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return <MobileAccordion versions={props.versions} />
  }

  return <DesktopTimeline {...props} />
}
