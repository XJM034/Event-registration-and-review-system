'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Eye, Download, Plus, X, CheckCircle, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import ExportConfigDialog, { ExportConfig } from './export-config-dialog'
import { buildPrioritizedTeamFields, DEFAULT_TEAM_FIELDS, getTeamFieldValue, TeamDisplayField } from './team-display-fields'

interface Registration {
  id: string
  team_data: any
  players_data: any[]
  status: 'approved'
  submitted_at: string
  reviewed_at?: string
}

interface RegistrationListTabProps {
  eventId: string
}

export default function RegistrationListTab({ eventId }: RegistrationListTabProps) {
  const router = useRouter()
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [teamFields, setTeamFields] = useState<TeamDisplayField[]>([]) // 存储队伍报名要求字段（表格显示用）
  const [lastFetchTime, setLastFetchTime] = useState(0) // 记录上次获取设置的时间
  
  // 新增报名表单数据
  const [newRegistration, setNewRegistration] = useState({
    teamName: '',
    campus: '',
    contact: '',
    phone: '',
    players: [{ name: '', gender: '男', age: '', idcard: '' }]
  })

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

      if (result.success && result.data) {
        const settings = Array.isArray(result.data)
          ? (result.data.find((item: any) => item?.team_requirements) || result.data[0])
          : result.data

        if (settings?.team_requirements) {
          const teamReq = settings.team_requirements
          const fields: TeamDisplayField[] = teamReq.allFields || [
            ...(teamReq.commonFields || []),
            ...(teamReq.customFields || [])
          ]

          if (fields.length === 0) {
            setTeamFields(DEFAULT_TEAM_FIELDS)
            return
          }

          setTeamFields(buildPrioritizedTeamFields(fields))
        } else {
          setTeamFields(DEFAULT_TEAM_FIELDS)
        }
      } else {
        setTeamFields(DEFAULT_TEAM_FIELDS)
      }
    } catch (error) {
      console.error('Error fetching registration settings:', error)
      setTeamFields(DEFAULT_TEAM_FIELDS)
    }
  }

  const fetchRegistrations = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/registrations?status=approved`)
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

  const handleAddRegistration = async () => {
    if (!newRegistration.teamName || !newRegistration.campus || !newRegistration.contact || !newRegistration.phone) {
      alert('请填写完整的队伍信息')
      return
    }

    const validPlayers = newRegistration.players.filter(p => p.name && p.age)
    if (validPlayers.length === 0) {
      alert('请至少添加一名队员')
      return
    }

    try {
      const response = await fetch(`/api/events/${eventId}/registrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          team_data: {
            name: newRegistration.teamName,
            campus: newRegistration.campus,
            contact: newRegistration.contact,
            phone: newRegistration.phone
          },
          players_data: validPlayers
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        fetchRegistrations()
        setShowAddDialog(false)
        setNewRegistration({
          teamName: '',
          campus: '',
          contact: '',
          phone: '',
          players: [{ name: '', gender: '男', age: '', idcard: '' }]
        })
      } else {
        alert('添加失败: ' + result.error)
      }
    } catch (error) {
      console.error('Add registration error:', error)
      alert('添加失败')
    }
  }

  const addPlayer = () => {
    setNewRegistration(prev => ({
      ...prev,
      players: [...prev.players, { name: '', gender: '男', age: '', idcard: '' }]
    }))
  }

  const removePlayer = (index: number) => {
    if (newRegistration.players.length > 1) {
      setNewRegistration(prev => ({
        ...prev,
        players: prev.players.filter((_, i) => i !== index)
      }))
    }
  }

  const updatePlayer = (index: number, field: string, value: string) => {
    setNewRegistration(prev => ({
      ...prev,
      players: prev.players.map((p, i) => 
        i === index ? { ...p, [field]: value } : p
      )
    }))
  }

  const handleDownload = () => {
    setShowExportDialog(true)
  }

  const handleExport = async (config: ExportConfig) => {
    try {
      const response = await fetch(`/api/events/${eventId}/registrations/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registrationIds: config.exportScope === 'selected' ? selectedIds : undefined,
          config
        }),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url

        // 从响应头获取文件名
        const contentDisposition = response.headers.get('content-disposition')
        const filenameMatch = contentDisposition?.match(/filename="(.+?)"/)
        const filename = filenameMatch
          ? decodeURIComponent(filenameMatch[1])
          : `报名信息_${new Date().toISOString().split('T')[0]}.zip`

        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
        setSelectedIds([])

        alert('已成功下载压缩包')
      } else {
        const errorData = await response.json().catch(() => ({ error: '未知错误' }))
        console.error('Export failed with status:', response.status)
        console.error('Error data:', errorData)
        alert(`导出失败: ${errorData.error || '未知错误'}`)
      }
    } catch (error: any) {
      console.error('Error downloading registrations:', error)
      alert(`导出失败: ${error?.message || '网络错误'}`)
    }
  }

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === registrations.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(registrations.map(r => r.id))
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
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
            <p className="mt-4 text-muted-foreground">加载中...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center">
                <CheckCircle className="mr-2 h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                报名列表
              </CardTitle>
              <CardDescription>
                已通过审核的报名 ({registrations.length})
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={handleDownload}
                className="h-10 w-full sm:w-auto"
              >
                <Download className="h-4 w-4 mr-2" />
                下载 {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
              </Button>
              <Button
                className="h-10 w-full sm:w-auto"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                添加报名
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              暂无已通过的报名
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 lg:hidden">
                <Checkbox
                  checked={selectedIds.length === registrations.length && registrations.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm text-muted-foreground">全选当前列表</span>
              </div>

              <div className="space-y-3 lg:hidden">
                {registrations.map((registration) => (
                  <div key={registration.id} className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-3">
                        {teamFields.map((field) => {
                          const rawValue = getTeamFieldValue(registration.team_data || {}, field)
                          const value = rawValue === null || rawValue === undefined ? '-' : String(rawValue)
                          return (
                            <div key={field.id}>
                              <p className="text-xs text-muted-foreground">{field.label}</p>
                              <p className="text-sm font-medium text-foreground break-words">{value}</p>
                            </div>
                          )
                        })}
                        <div>
                          <p className="text-xs text-muted-foreground">审核时间</p>
                          <p className="text-sm text-foreground">{registration.reviewed_at ? formatDate(registration.reviewed_at) : '-'}</p>
                        </div>
                      </div>
                      <Checkbox
                        checked={selectedIds.includes(registration.id)}
                        onCheckedChange={() => toggleSelection(registration.id)}
                      />
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-10"
                        onClick={() => {
                          router.push(`/events/${eventId}/registrations/${registration.id}/detail`)
                        }}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        查看
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-10 text-destructive hover:text-destructive"
                        onClick={() => {
                          setSelectedRegistration(registration)
                          setShowRejectDialog(true)
                        }}
                      >
                        <X className="mr-1 h-3 w-3" />
                        驳回
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-xl border border-border/60 lg:block">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-8 px-1">
                        <Checkbox
                          checked={selectedIds.length === registrations.length && registrations.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      {/* 动态显示队伍报名要求字段（组别-参赛单位-队伍名称-联系人） */}
                      {teamFields.map((field) => (
                        <TableHead key={field.id} className="w-[14%] px-2">{field.label}</TableHead>
                      ))}
                      <TableHead className="w-[18%] px-2">审核时间</TableHead>
                      <TableHead className="w-[22%] px-2">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registrations.map((registration) => (
                      <TableRow key={registration.id} className="bg-background transition-colors hover:bg-accent/40">
                        <TableCell className="px-1 py-2">
                          <Checkbox
                            checked={selectedIds.includes(registration.id)}
                            onCheckedChange={() => toggleSelection(registration.id)}
                          />
                        </TableCell>
                        {/* 动态显示队伍数据的前3个字段 */}
                        {teamFields.map((field, index) => {
                          const rawValue = getTeamFieldValue(registration.team_data || {}, field)
                          const value = rawValue === null || rawValue === undefined ? '-' : String(rawValue)
                          const displayValue = value.length > 8
                            ? value.substring(0, 8) + '\n' + value.substring(8)
                            : value

                          return (
                            <TableCell
                              key={field.id}
                              className={`${index === 0 ? "font-medium" : ""} px-2 py-2`}
                            >
                              <div className="whitespace-pre-wrap break-words" style={{maxWidth: '100px', wordBreak: 'break-all'}}>
                                {displayValue}
                              </div>
                            </TableCell>
                          )
                        })}
                        <TableCell className="whitespace-nowrap px-2 py-2 text-sm">{registration.reviewed_at ? formatDate(registration.reviewed_at) : '-'}</TableCell>
                        <TableCell className="px-2 py-2">
                          <div className="flex space-x-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                router.push(`/events/${eventId}/registrations/${registration.id}/detail`)
                              }}
                              className="px-2 text-xs"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              查看
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => {
                                setSelectedRegistration(registration)
                                setShowRejectDialog(true)
                              }}
                            >
                              <X className="h-3 w-3 mr-1" />
                              驳回
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 驳回理由对话框 */}
      <Dialog open={showRejectDialog} onOpenChange={(open) => {
        if (!open) {
          setShowRejectDialog(false)
          setRejectionReason('')
          setSelectedRegistration(null)
        }
      }}>
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

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false)
                setRejectionReason('')
              }}
              className="w-full sm:w-auto"
            >
              取消
            </Button>
            <Button
              onClick={handleReject}
              disabled={!rejectionReason.trim() || processingId === selectedRegistration?.id}
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto"
            >
              确认驳回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加报名对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>添加报名</DialogTitle>
            <DialogDescription>
              手动添加报名信息
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* 队伍信息 */}
            <div>
              <h3 className="font-semibold mb-3">队伍信息</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="teamName">队伍名称 *</Label>
                  <Input
                    id="teamName"
                    value={newRegistration.teamName}
                    onChange={(e) => setNewRegistration(prev => ({ ...prev, teamName: e.target.value }))}
                    placeholder="输入队伍名称"
                    className="mt-2 h-11"
                  />
                </div>
                <div>
                  <Label htmlFor="campus">报名校区 *</Label>
                  <Input
                    id="campus"
                    value={newRegistration.campus}
                    onChange={(e) => setNewRegistration(prev => ({ ...prev, campus: e.target.value }))}
                    placeholder="输入报名校区"
                    className="mt-2 h-11"
                  />
                </div>
                <div>
                  <Label htmlFor="contact">联系人 *</Label>
                  <Input
                    id="contact"
                    value={newRegistration.contact}
                    onChange={(e) => setNewRegistration(prev => ({ ...prev, contact: e.target.value }))}
                    placeholder="输入联系人"
                    className="mt-2 h-11"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">联系方式 *</Label>
                  <Input
                    id="phone"
                    value={newRegistration.phone}
                    onChange={(e) => setNewRegistration(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="输入联系电话"
                    className="mt-2 h-11"
                  />
                </div>
              </div>
            </div>

            {/* 队员信息 */}
            <div>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="font-semibold">队员信息</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addPlayer}
                  className="h-10 w-full sm:w-auto"
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  添加队员
                </Button>
              </div>
              
              <div className="space-y-3">
                {newRegistration.players.map((player, index) => (
                  <div key={index} className="rounded-lg border border-border/60 bg-muted/20 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium">队员 {index + 1}</span>
                      {newRegistration.players.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removePlayer(index)}
                          className="h-9 px-3"
                        >
                          <X className="h-4 w-4" />
                          <span className="ml-1 text-xs">删除</span>
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label>姓名 *</Label>
                        <Input
                          value={player.name}
                          onChange={(e) => updatePlayer(index, 'name', e.target.value)}
                          placeholder="输入姓名"
                          className="mt-2 h-11"
                        />
                      </div>
                      <div>
                        <Label>性别 *</Label>
                        <select
                          value={player.gender}
                          onChange={(e) => updatePlayer(index, 'gender', e.target.value)}
                          className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        >
                          <option value="男">男</option>
                          <option value="女">女</option>
                        </select>
                      </div>
                      <div>
                        <Label>年龄 *</Label>
                        <Input
                          type="number"
                          value={player.age}
                          onChange={(e) => updatePlayer(index, 'age', e.target.value)}
                          placeholder="输入年龄"
                          className="mt-2 h-11"
                        />
                      </div>
                      <div>
                        <Label>身份证号</Label>
                        <Input
                          value={player.idcard}
                          onChange={(e) => updatePlayer(index, 'idcard', e.target.value)}
                          placeholder="输入身份证号"
                          className="mt-2 h-11"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false)
                setNewRegistration({
                  teamName: '',
                  campus: '',
                  contact: '',
                  phone: '',
                  players: [{ name: '', gender: '男', age: '', idcard: '' }]
                })
              }}
              className="w-full sm:w-auto"
            >
              取消
            </Button>
            <Button
              onClick={handleAddRegistration}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              确认添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导出配置对话框 */}
      <ExportConfigDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        eventId={eventId}
        selectedCount={selectedIds.length}
        onExport={handleExport}
      />

    </>
  )
}
