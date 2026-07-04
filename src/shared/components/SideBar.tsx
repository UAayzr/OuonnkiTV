import { useLocation } from 'react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroupLabel,
  SidebarHeader,
  useSidebar,
} from '@/shared/components/ui/sidebar'
import { NavLink } from 'react-router'
import { Home, Search, Star, History, Settings } from 'lucide-react'
import { OkiLogo } from '@/shared/components/icons'
import { useVersionStore } from '../store'
import { cn } from '@/shared/lib'

interface SideBarProps {
  className?: string
  collapsibleMode?: 'icon' | 'offcanvas'
  hidden?: boolean
  enableScrollAnimation?: boolean
}

export default function SideBar({
  className,
  collapsibleMode = 'icon',
  hidden = false,
  enableScrollAnimation = false,
}: SideBarProps) {
  const location = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()

  const handleNavLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  // Menu items.
  const items = {
    header: [],
    content: [
      {
        title: '主页',
        url: '/',
        icon: Home,
      },
      {
        title: '搜索中心',
        url: '/search',
        icon: Search,
      },
      {
        title: '收藏夹',
        url: '/favorites',
        icon: Star,
      },
      {
        title: '观看记录',
        url: '/history',
        icon: History,
      },
    ],
    footer: [
      {
        title: '设置',
        url: '/settings',
        icon: Settings,
      },
    ],
  }
  // 获取版本信息
  const { currentVersion } = useVersionStore()
  return (
    <Sidebar
      className={cn(
        enableScrollAnimation
          ? '[&_[data-slot=sidebar-gap]]:transition-[width] [&_[data-slot=sidebar-gap]]:duration-[var(--motion-duration-panel)] [&_[data-slot=sidebar-gap]]:ease-[var(--motion-ease-soft-rebound)]'
          : '[&_[data-slot=sidebar-gap]]:transition-none',
        '[&_[data-slot=sidebar-container]]:translate-x-0 [&_[data-slot=sidebar-container]]:opacity-100 [&_[data-slot=sidebar-container]]:transform-gpu [&_[data-slot=sidebar-container]]:will-change-[transform,opacity,top]',
        enableScrollAnimation
          ? '[&_[data-slot=sidebar-container]]:transition-[transform,opacity,top] [&_[data-slot=sidebar-container]]:duration-[var(--motion-duration-panel)] [&_[data-slot=sidebar-container]]:ease-[var(--motion-ease-soft-rebound)]'
          : '[&_[data-slot=sidebar-container]]:transition-none',
        enableScrollAnimation
          ? '[&_[data-slot=sidebar-inner]]:transition-[opacity,transform,box-shadow] [&_[data-slot=sidebar-inner]]:duration-[var(--motion-duration-panel)] [&_[data-slot=sidebar-inner]]:ease-[var(--motion-ease-soft-rebound)]'
          : '[&_[data-slot=sidebar-inner]]:transition-none',
        hidden &&
          '[&_[data-slot=sidebar-gap]]:w-0 [&_[data-slot=sidebar-container]]:pointer-events-none [&_[data-slot=sidebar-container]]:-translate-x-full [&_[data-slot=sidebar-container]]:opacity-0 [&_[data-slot=sidebar-inner]]:opacity-0',
        className,
      )}
      variant="floating"
      collapsible={collapsibleMode}
    >
      <SidebarHeader className="animate-[sidebar-content-in_var(--motion-duration-panel)_var(--motion-ease-soft-rebound)_both] sm:hidden motion-reduce:animate-none">
        <NavLink to="/" className="flex items-center" onClick={handleNavLinkClick}>
          <div className="flex items-center gap-2">
            <OkiLogo />
            <p className="text-accent-foreground text-lg leading-none font-bold">UAayZR TV</p>
          </div>
        </NavLink>
      </SidebarHeader>
      <SidebarContent className="animate-[sidebar-content-in_var(--motion-duration-panel)_60ms_var(--motion-ease-soft-rebound)_both] motion-reduce:animate-none">
        <SidebarGroup>
          <SidebarGroupLabel>主菜单</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {items.content.map((item, index) => (
                <SidebarMenuItem
                  key={item.title}
                  className="animate-[sidebar-item-in_var(--motion-duration-pop)_var(--sidebar-item-delay,0ms)_var(--motion-ease-soft-rebound)_both] motion-reduce:animate-none"
                  style={{ '--sidebar-item-delay': `${80 + index * 28}ms` } as React.CSSProperties}
                >
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      onClick={handleNavLinkClick}
                      className="group data-[mactive=true]:text-sidebar-primary relative h-10 overflow-visible"
                      data-mactive={location.pathname === item.url}
                    >
                      {location.pathname === item.url && (
                        <div className="bg-sidebar-primary/15 absolute top-0 left-0 h-full w-full animate-[active-bg-in_var(--motion-duration-pop)_var(--motion-ease-rebound)] rounded-md motion-reduce:animate-none" />
                      )}
                      <item.icon className="z-1" />
                      <span className="z-1">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {items.footer.map((item, index) => (
            <SidebarMenuItem
              key={item.title}
              className="animate-[sidebar-item-in_var(--motion-duration-pop)_var(--sidebar-item-delay,0ms)_var(--motion-ease-soft-rebound)_both] motion-reduce:animate-none"
              style={{ '--sidebar-item-delay': `${180 + index * 28}ms` } as React.CSSProperties}
            >
              <SidebarMenuButton asChild>
                <NavLink to={item.url} onClick={handleNavLinkClick}>
                  <item.icon />
                  <span className="flex w-full items-center justify-between">
                    <span>{item.title}</span>
                    <span className="text-muted-foreground text-xs">v{currentVersion}</span>
                  </span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
