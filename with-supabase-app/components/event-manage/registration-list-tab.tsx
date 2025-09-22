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
import { ImageViewer } from '@/components/ui/image-viewer'

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
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showViewDialog, setShowViewDialog] = useState(false) // 新增状态控制查看对话框
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [teamFields, setTeamFields] = useState<any[]>([]) // 存储队伍报名要求字段（表格显示用）
  const [allTeamFields, setAllTeamFields] = useState<any[]>([]) // 存储所有队伍字段（详情显示用）
  const [playerFields, setPlayerFields] = useState<any[]>([]) // 存储队员报名要求字段
  const [lastFetchTime, setLastFetchTime] = useState(0) // 记录上次获取设置的时间
  const [viewingImage, setViewingImage] = useState<{ src: string; alt: string } | null>(null) // 图片查看器状态
  
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
        // 获取队伍字段配置
        if (result.data.team_requirements) {
          const teamReq = result.data.team_requirements
          const fields = teamReq.allFields || [
            ...(teamReq.commonFields || []),
            ...(teamReq.customFields || [])
          ]
          // 保存所有字段
          setAllTeamFields(fields)
          // 用于表格显示的前3个字段
          setTeamFields(fields.slice(0, 3).length > 0 ? fields.slice(0, 3) : [
            { id: 'name', label: '队伍名称' },
            { id: 'campus', label: '报名校区' },
            { id: 'contact', label: '联系人' }
          ])
        }

        // 获取队员字段配置
        if (result.data.player_requirements?.roles?.[0]) {
          const firstRole = result.data.player_requirements.roles[0]
          const fields = firstRole.allFields || [
            ...(firstRole.commonFields || []),
            ...(firstRole.customFields || [])
          ]
          setPlayerFields(fields)
        }
      } else {
        // 使用默认字段
        setTeamFields([
          { id: 'name', label: '队伍名称' },
          { id: 'campus', label: '报名校区' },
          { id: 'contact', label: '联系人' }
        ])
      }
    } catch (error) {
      console.error('Error fetching registration settings:', error)
      // 使用默认字段
      setTeamFields([
        { id: 'name', label: '队伍名称' },
        { id: 'campus', label: '报名校区' },
        { id: 'contact', label: '联系人' }
      ])
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

  const handleDownload = async () => {
    if (selectedIds.length === 0) {
      alert('请选择要下载的报名信息')
      return
    }

    try {
      const response = await fetch(`/api/events/${eventId}/registrations/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registrationIds: selectedIds
        }),
      })

      if (response.ok) {
        const contentType = response.headers.get('content-type')
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url

        // 根据内容类型确定文件扩展名
        let filename = '报名信息'
        if (contentType?.includes('zip')) {
          // 如果是zip文件（包含附件）
          const contentDisposition = response.headers.get('content-disposition')
          const filenameMatch = contentDisposition?.match(/filename="(.+?)"/)
          if (filenameMatch) {
            filename = decodeURIComponent(filenameMatch[1])
          } else {
            filename = `报名信息_${new Date().toISOString().split('T')[0]}.zip`
          }
        } else {
          // 如果是Excel文件
          filename = `报名信息_${new Date().toISOString().split('T')[0]}.xlsx`
        }

        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
        setSelectedIds([])

        // 提示用户下载成功
        if (contentType?.includes('zip')) {
          alert('已成功下载压缩包，其中包含Excel表格和附件文件')
        }
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                报名列表
              </CardTitle>
              <CardDescription>
                已通过审核的报名 ({registrations.length})
              </CardDescription>
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={handleDownload}
                disabled={selectedIds.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                下载 ({selectedIds.length})
              </Button>
              <Button 
                className="bg-blue-600 hover:bg-blue-700"
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
            <div className="text-center py-8 text-gray-500">
              暂无已通过的报名
            </div>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 px-1">
                    <Checkbox
                      checked={selectedIds.length === registrations.length && registrations.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  {/* 动态显示队伍报名要求的前3个字段 */}
                  {teamFields.map((field) => (
                    <TableHead key={field.id} className="w-[16%] px-2">{field.label}</TableHead>
                  ))}
                  <TableHead className="w-[20%] px-2">审核时间</TableHead>
                  <TableHead className="w-[24%] px-2">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrations.map((registration) => (
                  <TableRow key={registration.id}>
                    <TableCell className="px-1 py-2">
                      <Checkbox
                        checked={selectedIds.includes(registration.id)}
                        onCheckedChange={() => toggleSelection(registration.id)}
                      />
                    </TableCell>
                    {/* 动态显示队伍数据的前3个字段 */}
                    {teamFields.map((field, index) => {
                      const value = registration.team_data?.[field.id] || '-'
                      const displayValue = typeof value === 'string' && value.length > 8
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
                            setSelectedRegistration(registration)
                            setShowViewDialog(true)
                          }}
                          className="px-2 text-xs"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          查看
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 px-2 text-xs"
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
          )}
        </CardContent>
      </Card>

      {/* 查看详情对话框 */}
      <Dialog open={showViewDialog} onOpenChange={(open) => {
        if (!open) {
          setShowViewDialog(false)
          setSelectedRegistration(null)
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>报名详情</DialogTitle>
            <DialogDescription>
              查看已通过审核的报名信息
            </DialogDescription>
          </DialogHeader>
          
          {selectedRegistration && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">队伍信息</h3>
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  {/* 根据配置显示队伍字段 */}
                  {(() => {
                    // 使用完整的队伍字段配置
                    const fieldsToShow = allTeamFields.length > 0 ?
                      allTeamFields :
                      Object.keys(selectedRegistration.team_data || {}).map(key => ({
                        id: key,
                        label: key,
                        type: 'text'
                      }))

                    // 根据配置显示字段
                    return fieldsToShow.map((field) => {
                      const value = selectedRegistration.team_data?.[field.id]
                      if (!value) return null

                      // 如果是图片字段
                      if (field.type === 'image' ||
                          (typeof value === 'string' &&
                           (value.startsWith('http') || value.startsWith('/')) &&
                           (value.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
                            value.includes('supabase') ||
                            value.includes('storage')))) {
                        return (
                          <div key={field.id} className="col-span-2">
                            <Label>{field.label}</Label>
                            <div className="mt-1">
                              <img
                                src={value}
                                alt={field.label}
                                className="w-32 h-32 object-cover rounded border cursor-pointer hover:opacity-90"
                                onClick={() => setViewingImage({ src: value, alt: field.label })}
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

                      return (
                        <div key={field.id}>
                          <Label>{field.label}</Label>
                          <p className="mt-1">{value || '-'}</p>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">队员信息 ({selectedRegistration.players_data?.length || 0}人)</h3>
                <div className="space-y-2">
                  {selectedRegistration.players_data?.map((player: any, index: number) => {
                    const playerName = player['姓名'] || player['name'] || `队员${index + 1}`

                    return (
                      <div key={index} className="p-4 border rounded-lg">
                        <h4 className="font-medium mb-3">
                          {playerName} {player.role && `(${player.role})`}
                        </h4>
                        <div className="grid grid-cols-3 gap-4">
                          {playerFields.length > 0 ? (
                            // 使用配置的字段
                            playerFields.map((field) => {
                              const value = player[field.id]
                              if (!value) return null

                              // 处理图片字段
                              if (field.type === 'image' ||
                                  (typeof value === 'string' &&
                                   (value.startsWith('http') || value.startsWith('/')) &&
                                   (value.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
                                    value.includes('supabase') ||
                                    value.includes('storage')))) {
                                return (
                                  <div key={field.id} className="col-span-3">
                                    <Label>{field.label}</Label>
                                    <div className="mt-1">
                                      <img
                                        src={value}
                                        alt={field.label}
                                        className="w-32 h-32 object-cover rounded border cursor-pointer hover:opacity-90"
                                        onClick={() => setViewingImage({ src: value, alt: field.label })}
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

                              // 处理数组字段
                              if (Array.isArray(value)) {
                                return (
                                  <div key={field.id}>
                                    <Label>{field.label}</Label>
                                    <p className="mt-1">{value.join(', ') || '-'}</p>
                                  </div>
                                )
                              }

                              // 处理普通字段
                              return (
                                <div key={field.id}>
                                  <Label>{field.label}</Label>
                                  <p className="mt-1">{value || '-'}</p>
                                </div>
                              )
                            })
                          ) : (
                            // 如果没有配置，显示所有字段
                            Object.entries(player).map(([key, value]: [string, any]) => {
                              if (key === 'id' || key === 'role') return null

                              // 处理图片
                              if (typeof value === 'string' &&
                                  (value.startsWith('http') || value.startsWith('/')) &&
                                  (value.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
                                   value.includes('supabase') ||
                                   value.includes('storage'))) {
                                return (
                                  <div key={key} className="col-span-3">
                                    <Label>{key}</Label>
                                    <div className="mt-1">
                                      <img
                                        src={value}
                                        alt={key}
                                        className="w-32 h-32 object-cover rounded border cursor-pointer hover:opacity-90"
                                        onClick={() => setViewingImage({ src: value, alt: key })}
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

                              return (
                                <div key={key}>
                                  <Label>{key}</Label>
                                  <p className="mt-1">{value || '-'}</p>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowViewDialog(false)
                setSelectedRegistration(null)
              }}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* 添加报名对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="teamName">队伍名称 *</Label>
                  <Input
                    id="teamName"
                    value={newRegistration.teamName}
                    onChange={(e) => setNewRegistration(prev => ({ ...prev, teamName: e.target.value }))}
                    placeholder="输入队伍名称"
                  />
                </div>
                <div>
                  <Label htmlFor="campus">报名校区 *</Label>
                  <Input
                    id="campus"
                    value={newRegistration.campus}
                    onChange={(e) => setNewRegistration(prev => ({ ...prev, campus: e.target.value }))}
                    placeholder="输入报名校区"
                  />
                </div>
                <div>
                  <Label htmlFor="contact">联系人 *</Label>
                  <Input
                    id="contact"
                    value={newRegistration.contact}
                    onChange={(e) => setNewRegistration(prev => ({ ...prev, contact: e.target.value }))}
                    placeholder="输入联系人"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">联系方式 *</Label>
                  <Input
                    id="phone"
                    value={newRegistration.phone}
                    onChange={(e) => setNewRegistration(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="输入联系电话"
                  />
                </div>
              </div>
            </div>

            {/* 队员信息 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">队员信息</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addPlayer}
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  添加队员
                </Button>
              </div>
              
              <div className="space-y-3">
                {newRegistration.players.map((player, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium">队员 {index + 1}</span>
                      {newRegistration.players.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removePlayer(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>姓名 *</Label>
                        <Input
                          value={player.name}
                          onChange={(e) => updatePlayer(index, 'name', e.target.value)}
                          placeholder="输入姓名"
                        />
                      </div>
                      <div>
                        <Label>性别 *</Label>
                        <select
                          value={player.gender}
                          onChange={(e) => updatePlayer(index, 'gender', e.target.value)}
                          className="w-full h-10 px-3 border border-gray-300 rounded-md"
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
                        />
                      </div>
                      <div>
                        <Label>身份证号</Label>
                        <Input
                          value={player.idcard}
                          onChange={(e) => updatePlayer(index, 'idcard', e.target.value)}
                          placeholder="输入身份证号"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
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
            >
              取消
            </Button>
            <Button
              onClick={handleAddRegistration}
              className="bg-blue-600 hover:bg-blue-700"
            >
              确认添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 图片查看器 */}
      {viewingImage && (
        <ImageViewer
          src={viewingImage.src}
          alt={viewingImage.alt}
          isOpen={!!viewingImage}
          onClose={() => setViewingImage(null)}
        />
      )}
    </>
  )
}