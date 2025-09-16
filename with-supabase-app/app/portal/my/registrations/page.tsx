'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Calendar,
  MapPin,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Filter
} from 'lucide-react'

interface Registration {
  id: string
  event_id: string
  team_data: any
  players_data: any
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled'
  rejection_reason?: string
  submitted_at?: string
  reviewed_at?: string
  created_at: string
  events?: {
    name: string
    start_date: string
    end_date: string
    address?: string
    type: string
  }
}

export default function MyRegistrationsPage() {
  const router = useRouter()
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [filteredRegistrations, setFilteredRegistrations] = useState<Registration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    loadRegistrations()
  }, [])

  useEffect(() => {
    filterRegistrations()
  }, [registrations, searchTerm, statusFilter])

  const loadRegistrations = async () => {
    try {
      const supabase = createClient()

      // 获取当前用户
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        router.push('/auth/login')
        return
      }

      // 获取教练信息
      const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('auth_id', user.id)
        .single()

      if (coach) {
        // 获取报名记录
        const { data: regs } = await supabase
          .from('registrations')
          .select(`
            *,
            events (
              name,
              start_date,
              end_date,
              address,
              type
            )
          `)
          .eq('coach_id', coach.id)
          .order('created_at', { ascending: false })

        if (regs) {
          setRegistrations(regs)
        }
      }
    } catch (error) {
      console.error('加载报名记录失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filterRegistrations = () => {
    let filtered = [...registrations]

    // 搜索过滤
    if (searchTerm) {
      filtered = filtered.filter(reg =>
        reg.events?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reg.team_data?.team_name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // 状态过滤
    if (statusFilter !== 'all') {
      filtered = filtered.filter(reg => reg.status === statusFilter)
    }

    setFilteredRegistrations(filtered)
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { label: '草稿', variant: 'secondary' as const, icon: FileText },
      submitted: { label: '待审核', variant: 'default' as const, icon: Clock },
      approved: { label: '已通过', variant: 'success' as const, icon: CheckCircle },
      rejected: { label: '已驳回', variant: 'destructive' as const, icon: XCircle },
      cancelled: { label: '已取消', variant: 'outline' as const, icon: AlertCircle }
    }

    const config = statusConfig[status] || statusConfig.draft
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    )
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
        <h1 className="text-2xl font-bold">我的报名</h1>
        <p className="text-muted-foreground">查看和管理您的所有报名记录</p>
      </div>

      {/* 搜索和筛选 */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索赛事名称或队伍名称..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="w-full md:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <SelectValue placeholder="筛选状态" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="submitted">待审核</SelectItem>
                  <SelectItem value="approved">已通过</SelectItem>
                  <SelectItem value="rejected">已驳回</SelectItem>
                  <SelectItem value="cancelled">已取消</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 报名列表 */}
      {filteredRegistrations.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">
              {searchTerm || statusFilter !== 'all'
                ? '没有找到符合条件的报名记录'
                : '暂无报名记录'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredRegistrations.map((reg) => (
            <Card
              key={reg.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(`/portal/events/${reg.event_id}`)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{reg.events?.name}</h3>
                      {getStatusBadge(reg.status)}
                      {reg.events?.type && (
                        <Badge variant="outline">{reg.events.type}</Badge>
                      )}
                    </div>

                    {reg.team_data?.team_name && (
                      <p className="text-sm text-muted-foreground mb-2">
                        队伍名称: {reg.team_data.team_name}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(reg.events?.start_date).toLocaleDateString('zh-CN')} -
                        {new Date(reg.events?.end_date).toLocaleDateString('zh-CN')}
                      </span>
                      {reg.events?.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {reg.events.address}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 驳回原因 */}
                {reg.status === 'rejected' && reg.rejection_reason && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                    <p className="text-sm text-red-600">
                      <strong>驳回原因:</strong> {reg.rejection_reason}
                    </p>
                  </div>
                )}

                {/* 时间信息 */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-3 border-t">
                  <span>创建时间: {new Date(reg.created_at).toLocaleString('zh-CN')}</span>
                  {reg.submitted_at && (
                    <span>提交时间: {new Date(reg.submitted_at).toLocaleString('zh-CN')}</span>
                  )}
                  {reg.reviewed_at && (
                    <span>审核时间: {new Date(reg.reviewed_at).toLocaleString('zh-CN')}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}