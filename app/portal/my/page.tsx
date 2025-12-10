'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  User,
  Mail,
  Phone,
  Building,
  Calendar,
  Activity,
  FileText,
  Bell,
  Settings as SettingsIcon
} from 'lucide-react'

export default function MyPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [coach, setCoach] = useState<any>(null)
  const [stats, setStats] = useState({
    totalRegistrations: 0,
    approvedRegistrations: 0,
    pendingRegistrations: 0,
    rejectedRegistrations: 0
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    try {
      const supabase = createClient()

      // 获取当前用户
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

      if (authError || !authUser) {
        router.push('/auth/login')
        return
      }

      setUser(authUser)

      // 获取教练信息
      const { data: coachData } = await supabase
        .from('coaches')
        .select('*')
        .eq('auth_id', authUser.id)
        .single()

      if (coachData) {
        setCoach(coachData)

        // 获取统计数据
        const { data: registrations } = await supabase
          .from('registrations')
          .select('status')
          .eq('coach_id', coachData.id)

        if (registrations) {
          const approved = registrations.filter(r => r.status === 'approved').length
          // 待审核包括 submitted 和 pending 两种状态
          const pending = registrations.filter(r => r.status === 'submitted' || r.status === 'pending').length
          const rejected = registrations.filter(r => r.status === 'rejected').length
          // 总报名数只统计已提交的报名（排除草稿draft和已取消cancelled）
          const total = registrations.filter(r =>
            r.status === 'pending' ||
            r.status === 'submitted' ||
            r.status === 'approved' ||
            r.status === 'rejected'
          ).length

          setStats({
            totalRegistrations: total,
            approvedRegistrations: approved,
            pendingRegistrations: pending,
            rejectedRegistrations: rejected
          })
        }
      }
    } catch (error) {
      console.error('加载用户数据失败:', error)
    } finally {
      setIsLoading(false)
    }
  }


  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">加载中...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">个人中心</h1>
        <p className="text-muted-foreground">查看和管理您的个人信息</p>
      </div>

      {/* 用户信息卡片 */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="text-2xl bg-blue-100 text-blue-600">
                {coach?.name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-2xl font-semibold mb-2">{coach?.name || '未设置姓名'}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{user?.email}</span>
                </div>
                {coach?.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{coach.phone}</span>
                  </div>
                )}
                {coach?.organization && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building className="h-4 w-4" />
                    <span>{coach.organization}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>注册于 {new Date(coach?.created_at || user?.created_at).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">总报名数</p>
                <p className="text-2xl font-bold">{stats.totalRegistrations}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">待审核</p>
                <p className="text-2xl font-bold">{stats.pendingRegistrations}</p>
              </div>
              <FileText className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">已驳回</p>
                <p className="text-2xl font-bold">{stats.rejectedRegistrations}</p>
              </div>
              <FileText className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">已通过</p>
                <p className="text-2xl font-bold">{stats.approvedRegistrations}</p>
              </div>
              <FileText className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 快捷操作 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/portal/my/registrations')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              我的报名
            </CardTitle>
            <CardDescription>查看和管理您的报名记录</CardDescription>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/portal/my/notifications')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              我的通知
            </CardTitle>
            <CardDescription>查看系统通知和消息</CardDescription>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/portal/my/settings')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              账号设置
            </CardTitle>
            <CardDescription>管理账号安全和个人设置</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}