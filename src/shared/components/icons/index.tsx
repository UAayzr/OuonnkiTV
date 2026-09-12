import { SearchX } from 'lucide-react'

export const OkiLogo = ({
  size = 36,
  className,
  alt = 'UAayZR TV',
  ...props
}: { size?: number; className?: string; alt?: string } & React.ImgHTMLAttributes<HTMLImageElement>) => {
  return (
    <img
      src="/app-icon.png"
      width={size}
      height={size}
      alt={alt}
      className={`block shrink-0 rounded-[22%] object-cover ${className ?? ''}`}
      draggable={false}
      {...props}
    />
  )
}

// SettingsModal 中使用的图标
export const CheckIcon = ({
  size = 16,
  ...props
}: { size?: number } & React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export const CircleCheckIcon = ({
  size = 16,
  ...props
}: { size?: number } & React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      width={size}
      height={size}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

export const NoResultIcon = ({
  size = 36,
  className,
  ...props
}: { size?: number; className?: string } & React.SVGProps<SVGSVGElement>) => (
  <SearchX
    size={size}
    className={`text-muted-foreground ${className ?? ''}`}
    strokeWidth={1}
    {...props}
  />
)

export const ChevronDownIcon = ({
  size = 24,
  ...props
}: { size?: number } & React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      width={size}
      height={size}
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  )
}
