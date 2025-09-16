'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Check, X, Eye, Users, Clock } from 'lucide-react'

interface Registration {
  id: string
  team_data: any
  players_data: any[]
  status: 'pending' | 'approved' | 'rejected'
  submitted_at: string
  rejection_reason?: string
}

interface ReviewListTabProps {
  eventId: string
}

export default function ReviewListTab({ eventId }: ReviewListTabProps) {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [teamFields, setTeamFields] = useState<any[]>([]) // 存储队伍报名要求字段
  const [lastFetchTime, setLastFetchTime] = useState(0) // 记录上次获取设置的时间

  useEffect(() => {
    fetchRegistrations()
    fetchRegistrationSettings()
  }, [eventId])

  // 添加一个 effect 来监听组件是否可见
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // 如果距离上次获取超过 2 秒，重新获取设置
        const now = Date.now()
        if (now - lastFetchTime > 2000) {
          fetchRegistrationSettings()
          setLastFetchTime(now)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // 组件挂载时也获取一次
    const now = Date.now()
    if (now - lastFetchTime > 2000) {
      fetchRegistrationSettings()
      setLastFetchTime(now)
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [lastFetchTime])

  const fetchRegistrationSettings = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/registration-settings`)
      const result = await response.json()

      if (result.success && result.data?.team_requirements) {
        // 优先使用 allFields，如果没有则合并 commonFields 和 customFields
        let fields = []

        if (result.data.team_requirements.allFields) {
          fields = result.data.team_requirements.allFields.slice(0, 4)
        } else if (result.data.team_requirements.commonFields || result.data.team_requirements.customFields) {
          // 合并 commonFields 和 customFields
          const allFields = [
            ...(result.data.team_requirements.commonFields || []),
            ...(result.data.team_requirements.customFields || [])
          ]
          fields = allFields.slice(0, 4)
        }

        if (fields.length > 0) {
          setTeamFields(fields)
        } else {
          // 如果没有字段，使用默认字段
          setTeamFields([
            { id: 'name', label: '队伍名称' },
            { id: 'campus', label: '报名校区' },
            { id: 'contact', label: '联系人' },
            { id: 'phone', label: '联系方式' }
          ])
        }
      } else {
        // 如果没有配置，使用默认字段
        setTeamFields([
          { id: 'name', label: '队伍名称' },
          { id: 'campus', label: '报名校区' },
          { id: 'contact', label: '联系人' },
          { id: 'phone', label: '联系方式' }
        ])
      }
    } catch (error) {
      console.error('Error fetching registration settings:', error)
      // 使用默认字段
      setTeamFields([
        { id: 'name', label: '队伍名称' },
        { id: 'campus', label: '报名校区' },
        { id: 'contact', label: '联系人' },
        { id: 'phone', label: '联系方式' }
      ])
    }
  }

  const fetchRegistrations = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/registrations?status=pending`)
      const result = await response.json()

      if (result.success) {
        setRegistrations(result.data)
      }
    } catch (error) {
      console.error('Error fetching registrations:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (registrationId: string) => {
    setProcessingId(registrationId)
    try {
      const response = await fetch(`/api/registrations/${registrationId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'approved'
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        setRegistrations(prev => prev.filter(r => r.id !== registrationId))
        setSelectedRegistration(null)
      } else {
        alert('审核失败: ' + result.error)
      }
    } catch (error) {
      console.error('Error approving registration:', error)
      alert('审核失败')
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async () => {
    if (!selectedRegistration || !rejectionReason.trim()) {
      alert('请填写驳回理由')
      return
    }

    setProcessingId(selectedRegistration.id)
    try {
      const response = await fetch(`/api/registrations/${selectedRegistration.id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'rejected',
          rejection_reason: rejectionReason
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        setRegistrations(prev => prev.filter(r => r.id !== selectedRegistration.id))
        setSelectedRegistration(null)
        setShowRejectDialog(false)
        setRejectionReason('')
      } else {
        alert('驳回失败: ' + result.error)
      }
    } catch (error) {
      console.error('Error rejecting registration:', error)
      alert('驳回失败')
    } finally {
      setProcessingId(null)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">加载中...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="h-5 w-5 mr-2" />
            审核列表
          </CardTitle>
          <CardDescription>
            等待审核的报名申请 ({registrations.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              暂无待审核的报名
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {/* 动态显示队伍报名要求的前4个字段 */}
                  {teamFields.map((field) => (
                    <TableHead key={field.id}>{field.label}</TableHead>
                  ))}
                  <TableHead>队员人数</TableHead>
                  <TableHead>提交时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrations.map((registration) => (
                  <TableRow key={registration.id}>
                    {/* 动态显示队伍数据的前4个字段 */}
                    {teamFields.map((field, index) => (
                      <TableCell key={field.id} className={index === 0 ? "font-medium" : ""}>
                        {registration.team_data?.[field.id] || '-'}
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex items-center">
                        <Users className="h-4 w-4 mr-1" />
                        {registration.players_data?.length || 0}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(registration.submitted_at)}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedRegistration(registration)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          审核
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 审核详情对话框 */}
      <Dialog open={!!selectedRegistration && !showRejectDialog} onOpenChange={(open) => !open && setSelectedRegistration(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>审核报名信息</DialogTitle>
            <DialogDescription>
              查看报名详细信息并决定是否通过审核
            </DialogDescription>
          </DialogHeader>
          
          {selectedRegistration && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">队伍信息</h3>
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  {/* 动态显示所有队伍字段 */}
                  {Object.entries(selectedRegistration.team_data || {}).map(([key, value]) => {
                    // 跳过系统字段
                    if (key === 'id' || key === 'team_logo') return null

                    // 如果是图片字段
                    if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('/'))) {
                      if (value.match(/\.(jpg|jpeg|png|gif|webp)$/i) || value.includes('supabase') || value.includes('storage')) {
                        return (
                          <div key={key} className="col-span-2">
                            <Label>{key}</Label>
                            <div className="mt-1">
                              <img
                                src={value}
                                alt={key}
                                className="w-32 h-32 object-cover rounded border"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden')
                                }}
                              />
                              <p className="hidden text-gray-500">图片加载失败</p>
                            </div>
                          </div>
                        )
                      }
                    }

                    return (
                      <div key={key}>
                        <Label>{key}</Label>
                        <p className="mt-1">{value || '-'}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">队员信息 ({selectedRegistration.players_data?.length || 0}人)</h3>
                <div className="space-y-2">
                  {selectedRegistration.players_data?.map((player: any, index: number) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-3">队员 {index + 1} {player.role && `(${player.role})`}</h4>
                      <div className="grid grid-cols-3 gap-4">
                        {Object.entries(player).map(([key, value]: [string, any]) => {
                          // 跳过系统字段
                          if (key === 'id' || key === 'role') return null

                          // 处理图片字段
                          if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('/'))) {
                            // 检查是否是图片URL
                            if (value.match(/\.(jpg|jpeg|png|gif|webp)$/i) || value.includes('supabase') || value.includes('storage')) {
                              return (
                                <div key={key} className="col-span-3">
                                  <Label>{key}</Label>
                                  <div className="mt-1">
                                    <img
                                      src={value}
                                      alt={key}
                                      className="w-32 h-32 object-cover rounded border"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none'
                                        e.currentTarget.nextElementSibling?.classList.remove('hidden')
                                      }}
                                    />
                                    <p className="hidden text-gray-500">图片加载失败</p>
                                  </div>
                                </div>
                              )
                            }
                          }

                          // 处理数组字段
                          if (Array.isArray(value)) {
                            return (
                              <div key={key}>
                                <Label>{key}</Label>
                                <p className="mt-1">{value.join(', ') || '-'}</p>
                              </div>
                            )
                          }

                          // 处理普通字段
                          return (
                            <div key={key}>
                              <Label>{key}</Label>
                              <p className="mt-1">{value || '-'}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(true)
              }}
              disabled={processingId === selectedRegistration?.id}
            >
              <X className="h-4 w-4 mr-1" />
              驳回
            </Button>
            <Button
              onClick={() => selectedRegistration && handleApprove(selectedRegistration.id)}
              disabled={processingId === selectedRegistration?.id}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="h-4 w-4 mr-1" />
              通过
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 驳回理由对话框 */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>驳回报名</DialogTitle>
            <DialogDescription>
              请填写驳回理由，以便报名者修改后重新提交
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="reason">驳回理由</Label>
              <Textarea
                id="reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="请输入驳回理由..."
                className="mt-2 min-h-[100px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false)
                setRejectionReason('')
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleReject}
              disabled={!rejectionReason.trim() || processingId === selectedRegistration?.id}
              className="bg-red-600 hover:bg-red-700"
            >
              确认驳回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}