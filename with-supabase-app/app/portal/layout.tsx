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
  Calendar, 
  User, 
  Bell, 
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Settings,
  ChevronDown,
  ChevronUp
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
  const [isMyMenuOpen, setIsMyMenuOpen] = useState(true)
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
      id: 'my',
      label: '我的',
      icon: User,
      hasSubmenu: true,
      active: pathname.startsWith('/portal/my'),
      submenu: [
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
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 左侧导航栏 */}
      <aside className={cn(
        "bg-white shadow-lg transition-all duration-300 flex flex-col",
        isCollapsed ? "w-20" : "w-64"
      )}>
        {/* Logo区域和折叠按钮 */}
        <div className="border-b">
          <div className="p-4 flex items-center justify-between">
            <h1 className={cn(
              "font-bold text-lg text-gray-800 transition-all whitespace-nowrap overflow-hidden",
              isCollapsed && "text-center text-sm"
            )}>
              {isCollapsed ? "报名" : "体育比赛报名系统"}
            </h1>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={cn(
                "p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0",
                isCollapsed && "mx-auto"
              )}
              title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-5 w-5 text-gray-600" />
              ) : (
                <ChevronLeft className="h-5 w-5 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {/* 菜单区域 */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => (
              <li key={item.id}>
                {item.hasSubmenu ? (
                  <div>
                    <button
                      onClick={() => setIsMyMenuOpen(!isMyMenuOpen)}
                      className={cn(
                        "w-full flex items-center px-3 py-2 rounded-lg transition-colors",
                        isCollapsed ? "justify-center" : "justify-between",
                        "hover:bg-gray-100",
                        item.active && "bg-blue-50 text-blue-600"
                      )}
                      title={isCollapsed ? item.label : ""}
                    >
                      <div className="flex items-center space-x-3">
                        <item.icon className={cn(
                          "flex-shrink-0",
                          isCollapsed ? "h-6 w-6 mx-auto" : "h-5 w-5"
                        )} />
                        {!isCollapsed && <span>{item.label}</span>}
                      </div>
                      {!isCollapsed && (
                        isMyMenuOpen ?
                          <ChevronUp className="h-4 w-4" /> :
                          <ChevronDown className="h-4 w-4" />
                      )}
                    </button>

                    {/* 子菜单 */}
                    {isMyMenuOpen && !isCollapsed && item.submenu && (
                      <ul className="mt-2 ml-4 space-y-1">
                        {item.submenu.map((subItem) => (
                          <li key={subItem.id}>
                            <Link
                              href={subItem.href}
                              className={cn(
                                "flex items-center justify-between px-3 py-2 rounded-lg transition-colors",
                                "hover:bg-gray-100",
                                subItem.active && "bg-blue-50 text-blue-600"
                              )}
                            >
                              <div className="flex items-center space-x-3">
                                <subItem.icon className="h-4 w-4" />
                                <span className="text-sm">{subItem.label}</span>
                              </div>
                              {subItem.badge && (
                                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                                  {subItem.badge}
                                </span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center px-3 py-2 rounded-lg transition-colors",
                      isCollapsed ? "justify-center" : "space-x-3",
                      "hover:bg-gray-100",
                      item.active && "bg-blue-50 text-blue-600"
                    )}
                    title={isCollapsed ? item.label : ""}
                  >
                    <item.icon className={cn(
                      "flex-shrink-0",
                      isCollapsed ? "h-6 w-6 mx-auto" : "h-5 w-5"
                    )} />
                    {!isCollapsed && <span>{item.label}</span>}
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
          <div className="px-6 py-4 flex items-center justify-between">
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