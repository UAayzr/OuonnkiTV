import { type SettingModuleList } from '@/shared/types'
import { cn } from '@/shared/lib'

export default function SideBar({
  activeId,
  modules,
  onSelect,
  className,
}: {
  activeId: string
  modules: SettingModuleList
  onSelect: (id: string) => void
  className?: string
}) {
  return (
    <div className={cn(`relative flex h-full w-full flex-col gap-3`, className)}>
      {modules.map(module => (
        <div
          key={module.id}
          className={`relative z-10 flex h-12 cursor-pointer items-center gap-2 rounded-lg p-3 transition-[color,transform] duration-[var(--motion-duration-tap)] ease-[var(--motion-ease-soft-rebound)] hover:-translate-y-px active:translate-y-0 active:scale-[0.982] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 ${
            activeId === module.id ? 'text-white' : 'text-gray-500 hover:text-gray-700'
          } ${module.id === 'about_project' ? 'md:mt-auto' : ''}`}
          onClick={() => onSelect(module.id)}
        >
          {activeId === module.id && (
            <div className="absolute inset-0 -z-10 animate-[active-bg-in_var(--motion-duration-pop)_var(--motion-ease-rebound)] rounded-lg bg-zinc-600/80 shadow-xl/30 shadow-zinc-900 backdrop-blur-xl motion-reduce:animate-none" />
          )}
          <span className="relative z-10">{module.icon}</span>
          <h2 className="relative z-10 font-medium">{module.name}</h2>
        </div>
      ))}
    </div>
  )
}
