'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Check, X, Eye, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { ImageViewer } from '@/components/ui/image-viewer'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Registration {
  id: string
  team_data: any
  players_data: any[]
  status: 'pending' | 'approved' | 'rejected'
  submitted_at: string
  rejection_reason?: string
}

interface ReviewStatus {
  [key: string]: {
    status: 'unchecked' | 'approved' | 'needsModification'
    comment?: string
  }
}

interface ReviewListTabProps {
  eventId: string
  onReviewComplete?: () => void
}

export default function ReviewListTab({ eventId, onReviewComplete }: ReviewListTabProps) {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [teamFields, setTeamFields] = useState<any[]>([])
  const [playerRoles, setPlayerRoles] = useState<any[]>([])
  const [lastFetchTime, setLastFetchTime] = useState(0)

  // 审核状态管理
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>({})
  const [savedReviewStatus, setSavedReviewStatus] = useState<{ [registrationId: string]: ReviewStatus }>({})

  // 图片查看器状态
  const [viewingImage, setViewingImage] = useState<{ src: string; alt: string } | null>(null)

  useEffect(() => {
    fetchRegistrations()
    fetchRegistrationSettings()
  }, [eventId])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const now = Date.now()
        if (now - lastFetchTime > 2000) {
          fetchRegistrationSettings()
          setLastFetchTime(now)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    const now = Date.now()
    if (now - lastFetchTime > 2000) {
      fetchRegistrationSettings()
      setLastFetchTime(now)
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [lastFetchTime])

  // 当选中报名信息时，恢复之前的审核状态
  useEffect(() => {
    if (selectedRegistration) {
      const saved = savedReviewStatus[selectedRegistration.id]
      if (saved) {
        setReviewStatus(saved)
      } else {
        setReviewStatus({})
      }
    }
  }, [selectedRegistration, savedReviewStatus])

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
          setTeamFields(fields)
        }

        // 获取所有角色信息
        if (result.data.player_requirements?.roles) {
          setPlayerRoles(result.data.player_requirements.roles)
        }
      }
    } catch (error) {
      console.error('Error fetching registration settings:', error)
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

  const updateReviewStatus = (key: string, status: 'unchecked' | 'approved' | 'needsModification', comment?: string) => {
    setReviewStatus(prev => ({
      ...prev,
      [key]: {
        status,
        comment: comment !== undefined ? comment : (prev[key]?.comment || '')
      }
    }))
  }

  const saveCurrentReviewStatus = () => {
    if (selectedRegistration) {
      setSavedReviewStatus(prev => ({
        ...prev,
        [selectedRegistration.id]: reviewStatus
      }))
    }
  }

  const generateRejectionReason = () => {
    const reasons: string[] = []

    // 检查队伍信息
    if (reviewStatus['team']?.status === 'needsModification' && reviewStatus['team'].comment) {
      reasons.push(`队伍信息需修改：${reviewStatus['team'].comment}`)
    }

    // 检查每个队员信息
    selectedRegistration?.players_data?.forEach((player: any, index: number) => {
      const key = `player_${index}`
      if (reviewStatus[key]?.status === 'needsModification' && reviewStatus[key].comment) {
        const playerName = player['姓名'] || player['name'] || `队员${index + 1}`
        reasons.push(`${playerName}信息需修改：${reviewStatus[key].comment}`)
      }
    })

    return reasons.join('\n')
  }

  const handleApprove = async (registrationId: string) => {
    // 检查队伍信息和所有队员信息的审核状态
    const playerCount = selectedRegistration?.players_data?.length || 0

    // 收集所有需要检查的key
    const allKeys = ['team']
    for (let i = 0; i < playerCount; i++) {
      allKeys.push(`player_${i}`)
    }

    // 检查是否有未审核的项
    const uncheckedItems: string[] = []
    const needsModificationItems: string[] = []

    allKeys.forEach(key => {
      const status = reviewStatus[key]?.status
      if (!status || status === 'unchecked') {
        if (key === 'team') {
          uncheckedItems.push('队伍信息')
        } else {
          const playerIndex = parseInt(key.split('_')[1])
          const playerName = selectedRegistration?.players_data?.[playerIndex]?.['姓名'] ||
                           selectedRegistration?.players_data?.[playerIndex]?.['name'] ||
                           `队员${playerIndex + 1}`
          uncheckedItems.push(playerName)
        }
      } else if (status === 'needsModification') {
        if (key === 'team') {
          needsModificationItems.push('队伍信息')
        } else {
          const playerIndex = parseInt(key.split('_')[1])
          const playerName = selectedRegistration?.players_data?.[playerIndex]?.['姓名'] ||
                           selectedRegistration?.players_data?.[playerIndex]?.['name'] ||
                           `队员${playerIndex + 1}`
          needsModificationItems.push(playerName)
        }
      }
    })

    if (uncheckedItems.length > 0 || needsModificationItems.length > 0) {
      let message = ''
      if (needsModificationItems.length > 0) {
        message = `以下信息标记为需要修改：\n${needsModificationItems.join('、')}\n\n是否确认通过审核？`
      } else {
        message = `以下信息未确认无误：\n${uncheckedItems.join('、')}\n\n是否确认通过审核？`
      }

      if (!window.confirm(message)) {
        return
      }
    }

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
        // 清除保存的审核状态
        setSavedReviewStatus(prev => {
          const newState = { ...prev }
          delete newState[registrationId]
          return newState
        })
        if (onReviewComplete) {
          onReviewComplete()
        }
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
        // 清除保存的审核状态
        setSavedReviewStatus(prev => {
          const newState = { ...prev }
          delete newState[selectedRegistration.id]
          return newState
        })
        setSelectedRegistration(null)
        setShowRejectDialog(false)
        setRejectionReason('')
        if (onReviewComplete) {
          onReviewComplete()
        }
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

  const renderFieldValue = (value: any, fieldId: string, fields: any[]) => {
    const field = fields.find(f => f.id === fieldId)

    // 处理图片字段
    if (field?.type === 'image' && value) {
      return (
        <div
          className="cursor-pointer inline-block"
          onClick={() => setViewingImage({ src: value, alt: field.label })}
        >
          <img
            src={value}
            alt={field.label}
            className="w-32 h-32 object-cover rounded border hover:opacity-80 transition-opacity"
            onError={(e) => {
              e.currentTarget.src = '/placeholder.png'
            }}
          />
          <p className="text-xs text-gray-500 mt-1">点击查看大图</p>
        </div>
      )
    }

    // 处理数组
    if (Array.isArray(value)) {
      return value.join(', ') || '-'
    }

    // 处理其他值
    return String(value) || '-'
  }

  // 根据角色ID获取角色名称
  const getRoleName = (roleId: string) => {
    const role = playerRoles.find(r => r.id === roleId)
    return role?.name || roleId
  }

  // 根据角色ID获取角色字段配置
  const getRoleFields = (roleId: string) => {
    const role = playerRoles.find(r => r.id === roleId)
    if (!role) return []
    return role.allFields || [
      ...(role.commonFields || []),
      ...(role.customFields || [])
    ]
  }

  // 按角色分组队员数据
  const groupPlayersByRole = (playersData: any[]) => {
    const grouped: { [roleId: string]: { roleName: string; players: any[] } } = {}

    playersData.forEach((player: any) => {
      const roleId = player.role || 'player'
      if (!grouped[roleId]) {
        grouped[roleId] = {
          roleName: getRoleName(roleId),
          players: []
        }
      }
      grouped[roleId].players.push(player)
    })

    return grouped
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

  // 获取前3个显示字段
  const displayFields = teamFields.slice(0, 3).filter(f => f.type !== 'image')

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
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  {displayFields.map((field) => (
                    <TableHead key={field.id} className="w-[20%] px-1">{field.label}</TableHead>
                  ))}
                  <TableHead className="w-[22%] px-1">提交时间</TableHead>
                  <TableHead className="w-[18%] px-1">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrations.map((registration) => (
                  <TableRow key={registration.id}>
                    {displayFields.map((field) => {
                      const value = registration.team_data?.[field.id] || '-'
                      const displayValue = typeof value === 'string' && value.length > 6
                        ? value.substring(0, 6) + '\n' + value.substring(6)
                        : value

                      return (
                        <TableCell
                          key={field.id}
                          className="px-1 py-2"
                        >
                          <div className="whitespace-pre-wrap break-words text-sm" style={{maxWidth: '100px', wordBreak: 'break-all'}}>
                            {displayValue}
                          </div>
                        </TableCell>
                      )
                    })}
                    <TableCell className="whitespace-nowrap px-1 py-2 text-xs">{formatDate(registration.submitted_at)}</TableCell>
                    <TableCell className="px-1 py-2">
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
      <Dialog
        open={!!selectedRegistration && !showRejectDialog}
        onOpenChange={(open) => {
          if (!open) {
            saveCurrentReviewStatus()
            setSelectedRegistration(null)
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>审核报名信息</DialogTitle>
            <DialogDescription>
              查看报名详细信息并标记审核状态
            </DialogDescription>
          </DialogHeader>

          {selectedRegistration && (
            <div className="space-y-6">
              {/* 队伍信息 */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg">队伍信息</h3>
                  <div className="flex items-center gap-4">
                    <RadioGroup
                      value={reviewStatus['team']?.status || 'unchecked'}
                      onValueChange={(value) => updateReviewStatus('team', value as any)}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="approved" id="team-approved" />
                        <Label htmlFor="team-approved" className="flex items-center cursor-pointer">
                          <CheckCircle className="h-4 w-4 mr-1 text-green-600" />
                          无误
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="needsModification" id="team-needs" />
                        <Label htmlFor="team-needs" className="flex items-center cursor-pointer">
                          <XCircle className="h-4 w-4 mr-1 text-red-600" />
                          需修改
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>

                {reviewStatus['team']?.status === 'needsModification' && (
                  <Alert className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <Textarea
                        placeholder="请说明需要修改的内容..."
                        value={reviewStatus['team']?.comment || ''}
                        onChange={(e) => updateReviewStatus('team', 'needsModification', e.target.value)}
                        className="mt-2"
                      />
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {teamFields.map((field) => {
                    const value = selectedRegistration.team_data?.[field.id]
                    if (!value) return null

                    return (
                      <div key={field.id} className={field.type === 'image' ? 'col-span-2' : ''}>
                        <Label>{field.label}</Label>
                        <div className="mt-1">
                          {renderFieldValue(value, field.id, teamFields)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 人员信息 - 按角色分组显示 */}
              {selectedRegistration.players_data && selectedRegistration.players_data.length > 0 && (() => {
                const groupedPlayers = groupPlayersByRole(selectedRegistration.players_data)

                // 对角色进行排序：非队员角色在前，队员角色在后
                const sortedEntries = Object.entries(groupedPlayers).sort(([roleIdA], [roleIdB]) => {
                  if (roleIdA === 'player') return 1
                  if (roleIdB === 'player') return -1
                  return 0
                })

                return (
                  <div className="space-y-6">
                    {sortedEntries.map(([roleId, { roleName, players }]) => {
                      const roleFields = getRoleFields(roleId)

                      return (
                        <div key={roleId}>
                          <h3 className="font-semibold mb-3">{roleName} ({players.length}人)</h3>
                          <div className="space-y-4">
                            {players.map((player: any, playerIndex: number) => {
                              // 使用全局索引作为key
                              const globalIndex = selectedRegistration.players_data.findIndex((p: any) => p === player)
                              const playerKey = `player_${globalIndex}`
                              const playerName = player['姓名'] || player['name'] || `${roleName}${playerIndex + 1}`

                              return (
                                <div key={globalIndex} className="border rounded-lg p-4">
                                  <div className="flex items-center justify-between mb-4">
                                    <h4 className="font-medium">{playerName}</h4>
                                    <div className="flex items-center gap-4">
                                      <RadioGroup
                                        value={reviewStatus[playerKey]?.status || 'unchecked'}
                                        onValueChange={(value) => updateReviewStatus(playerKey, value as any)}
                                        className="flex gap-4"
                                      >
                                        <div className="flex items-center space-x-2">
                                          <RadioGroupItem value="approved" id={`${playerKey}-approved`} />
                                          <Label htmlFor={`${playerKey}-approved`} className="flex items-center cursor-pointer">
                                            <CheckCircle className="h-4 w-4 mr-1 text-green-600" />
                                            无误
                                          </Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                          <RadioGroupItem value="needsModification" id={`${playerKey}-needs`} />
                                          <Label htmlFor={`${playerKey}-needs`} className="flex items-center cursor-pointer">
                                            <XCircle className="h-4 w-4 mr-1 text-red-600" />
                                            需修改
                                          </Label>
                                        </div>
                                      </RadioGroup>
                                    </div>
                                  </div>

                                  {reviewStatus[playerKey]?.status === 'needsModification' && (
                                    <Alert className="mb-4">
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertDescription>
                                        <Textarea
                                          placeholder="请说明需要修改的内容..."
                                          value={reviewStatus[playerKey]?.comment || ''}
                                          onChange={(e) => updateReviewStatus(playerKey, 'needsModification', e.target.value)}
                                          className="mt-2"
                                        />
                                      </AlertDescription>
                                    </Alert>
                                  )}

                                  <div className="grid grid-cols-3 gap-4">
                                    {roleFields.map((field: any) => {
                                      const value = player[field.id]
                                      if (!value || field.id === 'role') return null

                                      return (
                                        <div key={field.id} className={field.type === 'image' ? 'col-span-3' : ''}>
                                          <Label>{field.label}</Label>
                                          <div className="mt-1">
                                            {renderFieldValue(value, field.id, roleFields)}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                // 生成驳回理由
                const autoReason = generateRejectionReason()
                setRejectionReason(autoReason)
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
              请确认驳回理由，以便报名者修改后重新提交
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
                className="mt-2 min-h-[150px]"
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