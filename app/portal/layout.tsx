'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { NotificationProvider, useNotification } from '@/contexts/notification-context'
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
  ClipboardList,
  Bell,
  Menu,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { getSessionUserWithRetry, withTimeout } from '@/lib/supabase/client-auth'
import { ThemeSwitcher } from '@/components/theme-switcher'

interface PortalLayoutProps {
  children: React.ReactNode
}

const SIDEBAR_COLLAPSE_KEY = 'portal_sidebar_collapsed'

type PortalTabId = 'events' | 'my-registrations' | 'my-notifications'

function PortalLayoutContent({ children }: PortalLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const [tabletPinnedExpanded, setTabletPinnedExpanded] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(1280)
  const [hydrated, setHydrated] = useState(false)
  const [isSidebarAnimating, setIsSidebarAnimating] = useState(false)
  const [user, setUser] = useState<any>(null)
  const { unreadCount } = useNotification()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const sidebarAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const authRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const authRetryCountRef = useRef(0)

  useEffect(() => {
    setHydrated(true)
    const handleResize = () => setViewportWidth(window.innerWidth)
    handleResize()
    window.addEventListener('resize', handleResize)

    const savedPreference = window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY)
    if (savedPreference !== null) {
      setDesktopCollapsed(savedPreference === 'true')
    }

    checkUser()
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }

    window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(desktopCollapsed))
  }, [desktopCollapsed, hydrated])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

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
      if (authRetryTimerRef.current) {
        clearTimeout(authRetryTimerRef.current)
      }
    }
  }, [])

  const scheduleUserRecheck = () => {
    if (authRetryCountRef.current >= 2) {
      router.push('/auth/login')
      return
    }

    authRetryCountRef.current += 1
    if (authRetryTimerRef.current) {
      clearTimeout(authRetryTimerRef.current)
    }
    authRetryTimerRef.current = setTimeout(() => {
      checkUser()
    }, 500)
  }

  const checkUser = async () => {
    try {
      const supabase = createClient()
      const { user: sessionUser, error: sessionError, isNetworkError } = await getSessionUserWithRetry(supabase, {
        maxRetries: 2,
        baseDelayMs: 400,
      })

      if (sessionError) {
        if (isNetworkError) {
          console.error('门户布局会话请求网络异常（已重试）:', sessionError)
          return
        }
        scheduleUserRecheck()
        return
      }

      if (!sessionUser) {
        scheduleUserRecheck()
        return
      }
      authRetryCountRef.current = 0

      // 获取教练信息
      const { data: coach, error: coachError } = await withTimeout(
        supabase
          .from('coaches')
          .select('*')
          .eq('auth_id', sessionUser.id)
          .single(),
        4000,
        'Coach profile lookup timed out'
      )

      if (coachError) {
        setUser(sessionUser)
        return
      }

      setUser(coach || sessionUser)
    } catch (error) {
      console.error('获取用户信息失败:', error)
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const effectiveViewportWidth = hydrated ? viewportWidth : 1280
  const effectiveDesktopCollapsed = hydrated ? desktopCollapsed : false
  const effectiveTabletPinnedExpanded = hydrated ? tabletPinnedExpanded : false

  const isMobile = effectiveViewportWidth < 768
  const isTablet = effectiveViewportWidth >= 768 && effectiveViewportWidth <= 1023
  const isCollapsed = !isMobile && (isTablet ? !effectiveTabletPinnedExpanded : effectiveDesktopCollapsed)
  const sidebarWidthClass = isCollapsed ? 'w-16' : 'w-[200px]'

  const pageTitle = useMemo(() => {
    if (pathname === '/portal') return '赛事活动'
    if (pathname === '/portal/my/registrations') return '我的报名'
    if (pathname === '/portal/my/notifications') return '我的通知'
    if (pathname === '/portal/my/settings') return '账号设置'
    if (pathname.startsWith('/portal/events/') && pathname.includes('/register')) return '赛事报名'
    if (pathname.startsWith('/portal/events/')) return '赛事详情'
    return '教练端主页'
  }, [pathname])

  const menuItems: Array<{
    id: PortalTabId
    label: string
    icon: typeof Calendar
    href: string
    active: boolean
    badge?: number | null
  }> = [
    {
      id: 'events',
      label: '赛事活动',
      icon: Calendar,
      href: '/portal',
      active: pathname === '/portal' || pathname.startsWith('/portal/events')
    },
    {
      id: 'my-registrations',
      label: '我的报名',
      icon: ClipboardList,
      href: '/portal/my/registrations',
      active: pathname === '/portal/my/registrations'
    },
    {
      id: 'my-notifications',
      label: '我的通知',
      icon: Bell,
      href: '/portal/my/notifications',
      active: pathname === '/portal/my/notifications',
      badge: unreadCount > 0 ? unreadCount : null,
    }
  ]

  const userInitial = (user?.name || user?.email || 'U').slice(0, 1).toUpperCase()
  const coachDisplayName = (user?.name?.trim?.() || '教练')

  const toggleSidebar = () => {
    setIsSidebarAnimating(true)
    if (sidebarAnimationTimerRef.current) {
      clearTimeout(sidebarAnimationTimerRef.current)
    }
    sidebarAnimationTimerRef.current = setTimeout(() => {
      setIsSidebarAnimating(false)
    }, 320)

    if (isMobile) {
      setMobileMenuOpen((current) => !current)
      return
    }

    if (isTablet) {
      setTabletPinnedExpanded((current) => !current)
      return
    }

    setDesktopCollapsed((current) => !current)
  }

  // Keep the first paint deterministic between SSR and CSR to avoid hydration mismatch.
  if (!hydrated) {
    return (
      <div className="flex min-h-screen overflow-hidden bg-background">
        <aside className="w-16 shrink-0 border-r border-border bg-card" />
        <main className="min-w-0 flex-1 flex flex-col">
          <header className="h-14 border-b border-border bg-background/95 backdrop-blur" />
          <div className="flex-1 p-4 md:p-6" />
        </main>
      </div>
    )
  }

  const sidebarMenu = (
    <>
      <div
        className={cn(
          'flex h-14 items-center border-b border-border',
          isCollapsed ? 'px-2 justify-center' : 'px-3 justify-between'
        )}
      >
        {!isCollapsed ? (
          <div className="min-w-0 ml-2">
            <p className="truncate whitespace-nowrap text-base font-semibold text-foreground">赛事报名工作台</p>
          </div>
        ) : null}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleSidebar}
              className={cn(
                'rounded-lg transition-colors hover:bg-muted',
                isCollapsed
                  ? 'relative flex w-full items-center justify-center px-3 py-2'
                  : 'p-2'
              )}
              disabled={isSidebarAnimating}
              aria-label={isCollapsed ? '展开菜单' : '收起菜单'}
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
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'relative flex items-center justify-center rounded-lg px-3 py-2 transition-colors hover:bg-muted',
                        item.active && 'bg-primary/10 text-primary'
                      )}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {item.badge ? (
                        <span className="absolute right-1 top-1 min-w-4 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      ) : null}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>
                    <p>{item.label}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-muted',
                    item.active && 'bg-primary/10 text-primary'
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    <span className="truncate whitespace-nowrap text-base">{item.label}</span>
                  </div>
                  {item.badge ? (
                    <span className="ml-2 shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{item.badge}</span>
                  ) : null}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <div className={cn('border-t p-2', isSidebarAnimating && 'pointer-events-none')}>
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowLogoutDialog(true)}
                className="relative flex w-full items-center justify-center rounded-lg px-3 py-2 transition-colors hover:bg-muted"
                aria-label="退出登录"
              >
                <LogOut className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              <p>退出登录</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="ghost"
            className="h-10 w-full justify-start text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setShowLogoutDialog(true)}
          >
            <LogOut className="mr-2 h-4 w-4" />
            退出登录
          </Button>
        )}
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen overflow-hidden bg-background">
      {isMobile && mobileMenuOpen ? (
        <button
          aria-label="关闭侧边栏"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'flex shrink-0 flex-col border-r border-border bg-card shadow-sm transition-[width,transform] duration-300 ease-in-out',
          isMobile
            ? cn(
                'fixed inset-y-0 left-0 z-50 w-[240px] transform',
                mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
              )
            : cn('relative', sidebarWidthClass)
        )}
      >
        {sidebarMenu}
      </aside>

      <main className="min-w-0 flex-1 flex flex-col">
        <header className="border-b border-border bg-background/95 backdrop-blur">
          <div className="flex items-start justify-between gap-3 px-4 py-2 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              {isMobile ? (
                <button
                  aria-label="打开侧边栏"
                  onClick={() => setMobileMenuOpen(true)}
                  className="rounded-md p-2 transition-colors hover:bg-muted"
                >
                  <Menu className="h-5 w-5" />
                </button>
              ) : null}
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">{pageTitle}</h1>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{coachDisplayName}，您好</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
              <ThemeSwitcher />
              <Button variant="ghost" size="icon" asChild className="relative">
                <Link href="/portal/my/notifications" aria-label="通知">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 ? (
                    <span className="absolute right-1 top-1 min-w-4 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-muted"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-xs text-primary">
                        {userInitial}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>{user?.name || user?.email || '教练用户'}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/portal/my/settings" className="flex items-center">
                      <Settings className="mr-2 h-4 w-4" />
                      账号设置
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setShowLogoutDialog(true)}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </div>
      </main>

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

export default function PortalLayout({ children }: PortalLayoutProps) {
  return (
    <NotificationProvider>
      <PortalLayoutContent>{children}</PortalLayoutContent>
    </NotificationProvider>
  )
}
