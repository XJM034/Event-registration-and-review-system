'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
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
import { Settings, LogOut, Plus, Settings2 } from 'lucide-react'

interface AdminHeaderProps {
  onCreateEvent: () => void
}

export default function AdminHeader({ onCreateEvent }: AdminHeaderProps) {
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const checkSuperAdmin = async () => {
      try {
        const res = await fetch('/api/auth/admin-session', {
          method: 'GET',
          credentials: 'include',
        })

        if (!res.ok) {
          setIsSuperAdmin(false)
          return
        }

        const result = await res.json()
        setIsSuperAdmin(result?.success && result?.data?.is_super === true)
      } catch (error) {
        console.error('Check super admin failed:', error)
        setIsSuperAdmin(false)
      }
    }

    checkSuperAdmin()
  }, [])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })

      await fetch('/api/auth/admin-session', {
        method: 'DELETE',
        credentials: 'include',
      })
      router.push('/auth/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">赛事活动管理</h1>
        <div className="flex items-center space-x-4">
          <Button onClick={onCreateEvent} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            创建赛事
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
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
                className="text-red-600"
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
