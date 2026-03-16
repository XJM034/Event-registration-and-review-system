'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Calendar,
  FileText,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Users,
} from 'lucide-react'
import {
  clearCurrentTabAdminClientState,
  readStoredAdminProfile,
  type AdminShellProfile,
  writeStoredAdminProfile,
} from '@/lib/admin-session-client'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { cn } from '@/lib/utils'

interface AdminShellProps {
  children: ReactNode
  actions?: ReactNode
}

type AdminNavItem = {
  id: 'events' | 'account-management' | 'logs' | 'project-management'
  label: string
  href: string
  icon: typeof Calendar
  active: boolean
}

const SIDEBAR_COLLAPSE_KEY = 'admin_sidebar_collapsed'
const SHELL_TOP_BAR_HEIGHT_CLASS = 'h-14'

const DEFAULT_ADMIN_PROFILE: AdminShellProfile = {
  name: '管理员',
  phone: null,
  isSuper: false,
}

export default function AdminShell({ children, actions }: AdminShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const [tabletPinnedExpanded, setTabletPinnedExpanded] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(1280)
  const [hydrated, setHydrated] = useState(false)
  const [isSidebarAnimating, setIsSidebarAnimating] = useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const [profile, setProfile] = useState<AdminShellProfile>(() => {
    return readStoredAdminProfile() || DEFAULT_ADMIN_PROFILE
  })
  const sidebarAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setHydrated(true)
    const handleResize = () => setViewportWidth(window.innerWidth)
    handleResize()
    window.addEventListener('resize', handleResize)

    const savedPreference = window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY)
    if (savedPreference !== null) {
      setDesktopCollapsed(savedPreference === 'true')
    }

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }

    window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(desktopCollapsed))
  }, [desktopCollapsed, hydrated])


  useEffect(() => {
    if (viewportWidth < 768 || viewportWidth > 1023) {
      setTabletPinnedExpanded(false)
    }
  }, [viewportWidth])

  useEffect(() => {
    return () => {
      if (sidebarAnimationTimerRef.current) {
        clearTimeout(sidebarAnimationTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const loadAdminProfile = async () => {
      try {
        const response = await fetch('/api/admin/me', {
          credentials: 'include',
          cache: 'no-store',
        })

        if (response.status === 401) {
          clearCurrentTabAdminClientState()
          router.push('/auth/login')
          return
        }

        const result = await response.json()
        if (!response.ok || !result?.success) {
          return
        }

        const nextProfile = {
          name: result.data?.name?.trim?.() || '管理员',
          phone: result.data?.phone || null,
          isSuper: result.data?.is_super === true,
        }
        setProfile(nextProfile)
        writeStoredAdminProfile(nextProfile)
      } catch (error) {
        console.error('Load admin profile failed:', error)
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadAdminProfile()
      }
    }

    loadAdminProfile()
    window.addEventListener('focus', loadAdminProfile)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', loadAdminProfile)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [router])

  // 使用 ref 保存导航前的侧边栏状态，避免 React 批处理导致的状态不一致
  const sidebarStateRef = useRef<{
    desktopCollapsed: boolean
    tabletPinnedExpanded: boolean
    isNavigating: boolean
  }>({
    desktopCollapsed: false,
    tabletPinnedExpanded: false,
    isNavigating: false,
  })

  // 导航时保存当前侧边栏状态
  const handleNavigationStart = () => {
    sidebarStateRef.current = {
      desktopCollapsed,
      tabletPinnedExpanded,
      isNavigating: true,
    }
    setIsNavigating(true)
  }

  // 导航完成后恢复
  useEffect(() => {
    if (isNavigating) {
      const timer = setTimeout(() => {
        sidebarStateRef.current.isNavigating = false
        setIsNavigating(false)
      }, 350)
      return () => clearTimeout(timer)
    }
  }, [isNavigating])

  const effectiveViewportWidth = hydrated ? viewportWidth : 1280

  // 导航期间使用 ref 保存的状态，防止闪烁
  const effectiveDesktopCollapsed = sidebarStateRef.current.isNavigating
    ? sidebarStateRef.current.desktopCollapsed
    : (hydrated ? desktopCollapsed : false)

  const effectiveTabletPinnedExpanded = sidebarStateRef.current.isNavigating
    ? sidebarStateRef.current.tabletPinnedExpanded
    : (hydrated ? tabletPinnedExpanded : false)

  const isMobile = effectiveViewportWidth < 768
  const isTablet = effectiveViewportWidth >= 768 && effectiveViewportWidth <= 1023
  const isCollapsed = !isMobile && (isTablet ? !effectiveTabletPinnedExpanded : effectiveDesktopCollapsed)
  const sidebarWidthClass = isCollapsed ? 'w-16' : 'w-[200px]'

  const menuItems = useMemo<AdminNavItem[]>(() => {
    const items: AdminNavItem[] = [
      {
        id: 'events',
        label: '赛事管理',
        href: '/events',
        icon: Calendar,
        active: pathname === '/' || pathname === '/events' || pathname.startsWith('/events/'),
      },
      {
        id: 'account-management',
        label: '账号设置',
        href: '/admin/account-management',
        icon: Users,
        active: pathname.startsWith('/admin/account-management'),
      },
    ]

    if (profile.isSuper) {
      items.push({
        id: 'logs',
        label: '日志查询',
        href: '/admin/security-audit-logs',
        icon: FileText,
        active: pathname.startsWith('/admin/security-audit-logs'),
      })
    }

    // 项目管理 - 所有管理员可见
    items.push({
      id: 'project-management',
      label: '项目管理',
      href: '/admin/project-management',
      icon: Settings2,
      active: pathname.startsWith('/admin/project-management'),
    })

    return items
  }, [pathname, profile.isSuper])

  const adminDisplayName = profile.name || '管理员'
  const userInitial = adminDisplayName.slice(0, 1).toUpperCase()

  const toggleSidebar = () => {
    setIsSidebarAnimating(true)
    if (sidebarAnimationTimerRef.current) {
      clearTimeout(sidebarAnimationTimerRef.current)
    }
    sidebarAnimationTimerRef.current = setTimeout(() => {
      setIsSidebarAnimating(false)
    }, 320)

    if (isTablet) {
      setTabletPinnedExpanded((current) => !current)
      return
    }

    setDesktopCollapsed((current) => !current)
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/admin-session', {
        method: 'DELETE',
        credentials: 'include',
      })
      clearCurrentTabAdminClientState()
      router.push('/auth/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen overflow-hidden bg-background">
        <aside className="w-16 shrink-0 border-border bg-card" />
        <main className="min-w-0 flex-1 flex flex-col border-l border-border">
          <header className="bg-background/95 backdrop-blur">
            <div className="h-14 border-b border-border" />
          </header>
          <div className="flex-1 p-4 md:p-6" />
        </main>
      </div>
    )
  }

  const sidebarMenu = (
    <>
      <div
        className={cn(
          'flex items-center border-b border-border',
          SHELL_TOP_BAR_HEIGHT_CLASS,
          isCollapsed ? 'justify-center px-2' : 'justify-between px-3',
        )}
      >
        {!isCollapsed ? (
          <div className="min-w-0 ml-2">
            <p className="truncate whitespace-nowrap text-base font-semibold text-foreground">赛事管理后台</p>
          </div>
        ) : null}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleSidebar}
              className={cn(
                'rounded-lg transition-colors hover:bg-muted',
                isCollapsed ? 'relative flex w-full items-center justify-center px-3 py-2' : 'p-2',
              )}
              disabled={isSidebarAnimating}
              aria-label={isCollapsed ? '展开菜单' : '收起菜单'}
              type="button"
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-5 w-5 text-muted-foreground" />
              ) : (
                <PanelLeftClose className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            <p>{isCollapsed ? '展开菜单' : '收起菜单'}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <nav className={cn('flex-1 px-2 py-3', isSidebarAnimating && 'pointer-events-none')}>
        <ul className="space-y-1">
          {menuItems.map((item) => (
            <li key={item.id}>
              {isCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      onClick={handleNavigationStart}
                      className={cn(
                        'relative flex min-h-10 items-center justify-center rounded-lg px-3 py-2 transition-colors hover:bg-muted',
                        item.active && 'bg-primary/10 text-primary',
                      )}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>
                    <p>{item.label}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  href={item.href}
                  onClick={handleNavigationStart}
                  className={cn(
                    'flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-muted',
                    item.active && 'bg-primary/10 text-primary',
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className="truncate whitespace-nowrap text-base">{item.label}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </>
  )

  return (
    <div className="flex min-h-screen overflow-hidden bg-background">
      {!isMobile ? (
        <aside
          key="desktop-sidebar"
          className={cn(
            'flex shrink-0 flex-col border-border bg-card shadow-sm',
            !isNavigating && 'transition-[width] duration-300 ease-in-out',
            'relative',
            sidebarWidthClass,
          )}
        >
          {sidebarMenu}
        </aside>
      ) : null}

      <main className="min-w-0 flex-1 flex flex-col border-l border-border">
        <header className="bg-background/95 backdrop-blur">
          <div className={cn('flex items-center justify-between gap-2 border-b border-border px-3 sm:px-6', SHELL_TOP_BAR_HEIGHT_CLASS)}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0">
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {profile.phone ? `${adminDisplayName} · ${profile.phone}` : `${adminDisplayName}，您好`}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                {!isMobile ? actions : null}
                <ThemeSwitcher />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-10 items-center gap-2 rounded-full p-1 transition-colors hover:bg-muted"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-xs text-primary">
                          {userInitial}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="space-y-1">
                      <div className="truncate">{adminDisplayName}</div>
                      {profile.phone ? (
                        <div className="truncate text-xs font-normal text-muted-foreground">{profile.phone}</div>
                      ) : null}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-500/15 dark:focus:text-red-300"
                      onClick={() => setShowLogoutDialog(true)}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      退出登录
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
          </div>

          {isMobile && actions ? (
            <div className="flex w-full border-b border-border px-3 py-2 [&>*]:h-10 [&>*]:w-full">
              {actions}
            </div>
          ) : null}
        </header>

        <div className={cn(
          'flex-1 overflow-auto p-4 md:p-6',
          isMobile && 'pb-[calc(4rem+env(safe-area-inset-bottom))]'
        )}>
          {children}
        </div>
      </main>

      {isMobile ? (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex h-16 items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
            {menuItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={handleNavigationStart}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 min-w-0 py-2 px-1 rounded-lg transition-colors touch-manipulation',
                  item.active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <div className="relative">
                  <item.icon className="h-6 w-6" />
                </div>
                <span className="text-xs truncate max-w-full">{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      ) : null}

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认退出</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要退出登录吗？退出后需要重新登录才能继续使用系统。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认退出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
