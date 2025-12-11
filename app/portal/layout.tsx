'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { NotificationProvider, useNotification } from '@/contexts/notification-context'
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
  User, 
  Bell, 
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Settings
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface PortalLayoutProps {
  children: React.ReactNode
}

function PortalLayoutContent({ children }: PortalLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [user, setUser] = useState<any>(null)
  const { unreadCount, refreshUnreadCount } = useNotification()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  useEffect(() => {
    checkUser()
    refreshUnreadCount()
  }, [])

  const checkUser = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/(auth)/login')
      return
    }

    // 获取教练信息
    const { data: coach } = await supabase
      .from('coaches')
      .select('*')
      .eq('auth_id', user.id)
      .single()

    setUser(coach || user)
  }


  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const menuItems = [
    {
      id: 'events',
      label: '赛事活动',
      icon: Calendar,
      href: '/portal',
      active: pathname === '/portal' || pathname.startsWith('/portal/events')
    },
    {
      id: 'my-profile',
      label: '个人信息',
      icon: User,
      href: '/portal/my',
      active: pathname === '/portal/my'
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
      badge: unreadCount > 0 ? unreadCount : null
    },
    {
      id: 'account-settings',
      label: '账号设置',
      icon: Settings,
      href: '/portal/my/settings',
      active: pathname === '/portal/my/settings'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 左侧导航栏 */}
      <aside className={cn(
        "bg-white shadow-lg transition-all duration-300 flex flex-col",
        isCollapsed ? "w-16" : "w-52"
      )}>
        {/* Logo区域和折叠按钮 */}
        <div className="border-b">
          <div className="h-[52px] px-6 flex items-center justify-between">
            <h1 className={cn(
              "font-bold text-gray-800 transition-all whitespace-nowrap overflow-hidden",
              isCollapsed ? "text-center text-sm" : "text-lg"
            )}>
              {isCollapsed ? "报名" : "棍网球报名系统"}
            </h1>
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0 mx-auto"
                  >
                    <ChevronRight className="h-5 w-5 text-gray-600" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  <p>展开侧边栏</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <ChevronLeft className="h-5 w-5 text-gray-600" />
              </button>
            )}
          </div>
        </div>

        {/* 菜单区域 */}
        <nav className="flex-1 p-3">
          <ul className="space-y-1">
            {menuItems.map((item) => (
              <li key={item.id}>
                {isCollapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center rounded-lg transition-colors justify-center px-3 py-2",
                          "hover:bg-gray-100",
                          item.active && "bg-blue-50 text-blue-600"
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
                    className={cn(
                      "flex items-center rounded-lg transition-colors justify-between px-3 py-2",
                      "hover:bg-gray-100",
                      item.active && "bg-blue-50 text-blue-600"
                    )}
                  >
                    <div className="flex items-center space-x-2">
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      <span className="text-base">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

      </aside>

      {/* 右侧内容区 */}
      <main className="flex-1 flex flex-col">
        {/* 顶部栏 */}
        <header className="bg-white shadow-sm border-b">
          <div className="h-[52px] px-6 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* 页面标题会由各个页面提供 */}
            </div>
            
            <div className="flex items-center space-x-4">
              {/* 用户信息 */}
              {user && (
                <span className="text-sm text-gray-600">
                  欢迎，{user.name || user.email}
                </span>
              )}
              
              {/* 设置按钮 */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLogoutDialog(true)}
                className="flex items-center space-x-2"
              >
                <LogOut className="h-4 w-4" />
                <span>退出登录</span>
              </Button>
            </div>
          </div>
        </header>

        {/* 页面内容 */}
        <div className="flex-1 p-6">
          {children}
        </div>
      </main>

      {/* 退出登录确认对话框 */}
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
            <AlertDialogAction onClick={handleLogout} className="bg-red-600 hover:bg-red-700">
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