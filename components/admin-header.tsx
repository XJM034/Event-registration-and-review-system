'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ThemeSwitcher } from '@/components/theme-switcher'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Settings, LogOut, Plus, Settings2, Users } from 'lucide-react'

interface AdminHeaderProps {
  onCreateEvent: () => void
}

const ADMIN_TAB_SESSION_COOKIE_NAME = 'admin-session-tab'

function writeAdminTabSessionCookie(token: string | null) {
  if (typeof document === 'undefined') return
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  if (token) {
    // 会话级 cookie，浏览器关闭后失效，降低可读 token 的持久暴露风险。
    document.cookie = `${ADMIN_TAB_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}`
    return
  }
  document.cookie = `${ADMIN_TAB_SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
}

export default function AdminHeader({ onCreateEvent }: AdminHeaderProps) {
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [adminDisplayName, setAdminDisplayName] = useState('管理员')
  const router = useRouter()

  const syncTabSession = async () => {
    const tabToken = sessionStorage.getItem('tab_admin_session_token')
    if (!tabToken) return

    try {
      writeAdminTabSessionCookie(tabToken)
      await fetch('/api/auth/admin-session', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'x-admin-session-token': tabToken,
        },
      })
    } catch (error) {
      console.error('Sync admin session failed:', error)
    }
  }

  useEffect(() => {
    const checkSuperAdmin = async () => {
      try {
        await syncTabSession()

        const [sessionRes, meRes] = await Promise.all([
          fetch('/api/auth/admin-session', {
            method: 'GET',
            credentials: 'include',
          }),
          fetch('/api/admin/me', {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          }),
        ])

        if (meRes.ok) {
          const meResult = await meRes.json()
          const displayName = meResult?.data?.name?.trim() || '管理员'
          setAdminDisplayName(displayName)
        }

        if (!sessionRes.ok) {
          setIsSuperAdmin(false)
          return
        }

        const result = await sessionRes.json()
        setIsSuperAdmin(result?.success && result?.data?.is_super === true)
      } catch (error) {
        console.error('Check super admin failed:', error)
        setIsSuperAdmin(false)
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSuperAdmin()
      }
    }

    checkSuperAdmin()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', checkSuperAdmin)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', checkSuperAdmin)
    }
  }, [])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })

      await fetch('/api/auth/admin-session', {
        method: 'DELETE',
        credentials: 'include',
      })
      sessionStorage.removeItem('tab_admin_session_token')
      writeAdminTabSessionCookie(null)
      router.push('/auth/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  return (
    <header className="border-b border-border bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground sm:text-xl">赛事活动管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">{adminDisplayName}，您好</p>
        </div>

        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <Button onClick={onCreateEvent} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            创建赛事
          </Button>
          <ThemeSwitcher />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => router.push('/admin/account-management')}
              >
                <Users className="h-4 w-4 mr-2" />
                账号管理
              </DropdownMenuItem>
              {isSuperAdmin && (
                <DropdownMenuItem
                  onClick={() => router.push('/admin/project-management')}
                >
                  <Settings2 className="h-4 w-4 mr-2" />
                  项目管理
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(e) => { e.preventDefault(); setShowLogoutDialog(true) }}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4 mr-2" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
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
    </header>
  )
}
