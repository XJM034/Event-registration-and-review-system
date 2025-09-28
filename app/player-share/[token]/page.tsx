'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Send, CheckCircle, Loader2, Upload, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

interface PlayerField {
  id: string
  label: string
  type: 'text' | 'date' | 'select' | 'multiselect' | 'image'
  required?: boolean
  options?: { id: string; label: string }[]
  placeholder?: string
}

export default function PlayerSharePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [shareToken, setShareToken] = useState<any>(null)
  const [event, setEvent] = useState<any>(null)
  const [teamData, setTeamData] = useState<any>(null)
  const [playerData, setPlayerData] = useState<any>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (token) {
      fetchTokenData()
    }
  }, [token])

  const fetchTokenData = async () => {
    try {
      // 使用新的API获取分享令牌信息
      const response = await fetch(`/api/player-share/${token}`)
      const result = await response.json()

      if (!result.success) {
        setError(result.error || '无效的分享链接')
        setIsLoading(false)
        return
      }

      const { token_info, registration, event, player_index, player_id } = result.data

      setShareToken(token_info)
      setEvent(event)
      setTeamData(registration.team_data)

      // 如果指定了队员索引，加载现有数据
      if (player_index !== null && player_index !== undefined && registration.players_data) {
        const existingPlayerData = registration.players_data[player_index] || {}
        setPlayerData(existingPlayerData)
      }

      setIsLoading(false)
    } catch (error) {
      console.error('获取分享信息失败:', error)
      setError('获取分享信息失败')
      setIsLoading(false)
    }
  }

  const handleSubmit = async () => {
    // 验证必填字段 - 与报名端保持一致
    const selectedRoleId = playerData.role || 'player'
    const selectedRole = event?.registration_settings?.player_requirements?.roles?.find(
      (r: any) => r.id === selectedRoleId
    ) || event?.registration_settings?.player_requirements?.roles?.[0]

    // 使用管理端设置的字段顺序
    const roleFields = selectedRole?.allFields || [
      ...(selectedRole?.commonFields || []),
      ...(selectedRole?.customFields || [])
    ]

    // 验证所有必填字段
    for (const field of roleFields) {
      if (field.required && !playerData[field.id]) {
        alert(`请填写${field.label}`)
        return
      }

      // 特殊验证：身份证号码
      if (field.id === 'id_number' && playerData[field.id]) {
        const validation = validateIdNumber(playerData[field.id])
        if (!validation.valid) {
          alert(`身份证号码格式错误: ${validation.message}`)
          return
        }
      }
    }

    setIsSubmitting(true)

    console.log('Submitting player data:', playerData)
    console.log('Token:', token)

    try {
      // 使用新的API来更新队员信息
      const response = await fetch(`/api/player-share/${token}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          player_data: playerData
        }),
      })

      const result = await response.json()

      if (result.success) {
        setIsSubmitted(true)
        alert('提交成功！您的信息已保存')
      } else {
        alert(result.error || '提交失败，请重试')
      }
    } catch (error) {
      console.error('提交失败:', error)
      alert('提交失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 验证身份证号码格式
  const validateIdNumber = (idNumber: string) => {
    // 去除空格
    const trimmedId = idNumber.trim()

    // 检查长度
    if (trimmedId.length !== 18) {
      return { valid: false, message: '身份证号码必须为18位' }
    }

    // 检查前17位是否为数字
    const first17 = trimmedId.slice(0, 17)
    if (!/^\d{17}$/.test(first17)) {
      return { valid: false, message: '身份证号码前17位必须为数字' }
    }

    // 检查第18位是否为数字或X/x
    const last = trimmedId.charAt(17)
    if (!/^[0-9Xx]$/.test(last)) {
      return { valid: false, message: '身份证号码第18位必须为数字或字母X' }
    }

    // 验证身份证号码的校验位
    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
    const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']
    let sum = 0

    for (let i = 0; i < 17; i++) {
      sum += parseInt(trimmedId.charAt(i)) * weights[i]
    }

    const checkCode = checkCodes[sum % 11]
    const actualCheckCode = last.toUpperCase()

    if (checkCode !== actualCheckCode) {
      return { valid: false, message: '身份证号码校验位错误，请检查输入是否正确' }
    }

    return { valid: true, message: '身份证号码格式正确' }
  }

  const updatePlayerData = (field: string, value: any) => {
    setPlayerData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              错误
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isSubmitted) {
    // 获取字段配置以显示提交的信息
    const selectedRoleId = playerData.role || 'player'
    const selectedRole = event?.registration_settings?.player_requirements?.roles?.find(
      (r: any) => r.id === selectedRoleId
    ) || event?.registration_settings?.player_requirements?.roles?.[0]

    const roleFields = selectedRole?.allFields || [
      ...(selectedRole?.commonFields || []),
      ...(selectedRole?.customFields || [])
    ]

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              提交成功
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">您的队员信息已成功提交！</p>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">已提交的信息：</h4>
              <div className="space-y-1 text-sm">
                {roleFields.map((field: any) => {
                  const value = playerData[field.id]
                  if (!value) return null

                  // 处理不同类型的显示
                  let displayValue = value
                  if (Array.isArray(value)) {
                    displayValue = value.join(', ')
                  } else if (field.type === 'date') {
                    displayValue = new Date(value).toLocaleDateString('zh-CN')
                  }

                  return (
                    <p key={field.id}>
                      <span className="font-medium">{field.label}：</span>
                      {displayValue}
                    </p>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const playerRequirements = event?.registration_settings?.player_requirements

  // 获取角色配置的字段
  const selectedRoleId = playerData.role || 'player'
  const selectedRole = playerRequirements?.roles?.find(
    (r: any) => r.id === selectedRoleId
  ) || playerRequirements?.roles?.[0]

  // 使用管理端设置的字段顺序
  let roleFields = selectedRole?.allFields || [
    ...(selectedRole?.commonFields || []),
    ...(selectedRole?.customFields || [])
  ]

  // 如果没有配置字段，使用默认字段
  if (!roleFields || roleFields.length === 0) {
    console.log('没有找到字段配置，使用默认字段', {
      event,
      playerRequirements,
      selectedRole
    })

    // 默认字段配置
    roleFields = [
      { id: 'name', label: '姓名', type: 'text', required: true },
      { id: 'gender', label: '性别', type: 'select', required: true, options: ['男', '女'] },
      { id: 'birthdate', label: '出生日期', type: 'date', required: false },
      { id: 'age', label: '年龄', type: 'text', required: false },
      { id: 'idcard', label: '身份证号', type: 'text', required: false }
    ]
  }

  console.log('使用的字段配置:', roleFields)

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <Badge variant="outline">{event?.name}</Badge>
              {teamData?.team_name && (
                <Badge>{teamData.team_name}</Badge>
              )}
            </div>
            <CardTitle>队员信息填写</CardTitle>
            <CardDescription>
              请填写您的个人信息，完成后点击提交
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 角色选择 - 如果有多个角色 */}
              {playerRequirements?.roles && playerRequirements.roles.length > 1 && (
                <div>
                  <Label>角色 *</Label>
                  <Select
                    value={playerData.role || 'player'}
                    onValueChange={(value) => updatePlayerData('role', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择角色" />
                    </SelectTrigger>
                    <SelectContent>
                      {playerRequirements.roles.map((role: any) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* 动态渲染字段 - 与报名端保持一致 */}
              {roleFields.map((field: any) => {
                switch (field.type) {
                  case 'text':
                    // 检查是否是身份证号码字段
                    const isIdNumberField = field.id === 'id_number'
                    let idValidation = { valid: true, message: '' }
                    if (isIdNumberField && playerData[field.id]) {
                      idValidation = validateIdNumber(playerData[field.id])
                    }

                    return (
                      <div key={field.id}>
                        <Label className="flex items-center gap-2">
                          {field.label}{field.required && ' *'}
                          {isIdNumberField && (
                            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                              18位
                            </span>
                          )}
                        </Label>
                        <Input
                          value={playerData[field.id] || ''}
                          onChange={(e) => updatePlayerData(field.id, e.target.value)}
                          placeholder={isIdNumberField ? '请输入18位身份证号码' : `请输入${field.label}`}
                          maxLength={isIdNumberField ? 18 : undefined}
                          className={`${
                            isIdNumberField && !idValidation.valid
                              ? 'border-red-300 bg-red-50'
                              : isIdNumberField && idValidation.valid && playerData[field.id]
                              ? 'border-green-300 bg-green-50'
                              : ''
                          }`}
                        />
                        {isIdNumberField && playerData[field.id] && (
                          <p className={`text-xs mt-1 font-medium ${
                            !idValidation.valid
                              ? 'text-red-600 bg-red-50 p-2 rounded border border-red-200'
                              : 'text-green-600 bg-green-50 p-2 rounded border border-green-200'
                          }`}>
                            {idValidation.message}
                          </p>
                        )}
                      </div>
                    )
                  case 'date':
                    return (
                      <div key={field.id}>
                        <Label>{field.label}{field.required && ' *'}</Label>
                        <Input
                          type="date"
                          value={playerData[field.id] || ''}
                          onChange={(e) => updatePlayerData(field.id, e.target.value)}
                        />
                      </div>
                    )
                  case 'select':
                    return (
                      <div key={field.id}>
                        <Label>{field.label}{field.required && ' *'}</Label>
                        <Select
                          value={playerData[field.id] || ''}
                          onValueChange={(value) => updatePlayerData(field.id, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`请选择${field.label}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map((option: any) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  case 'multiselect':
                    return (
                      <div key={field.id}>
                        <Label>{field.label}{field.required && ' *'}</Label>
                        <div className="space-y-2 mt-1">
                          {field.options?.map((option: string) => (
                            <label key={option} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={(playerData[field.id] || []).includes(option)}
                                onChange={(e) => {
                                  const currentValues = playerData[field.id] || []
                                  if (e.target.checked) {
                                    updatePlayerData(field.id, [...currentValues, option])
                                  } else {
                                    updatePlayerData(field.id, currentValues.filter((v: string) => v !== option))
                                  }
                                }}
                                className="rounded border-gray-300"
                              />
                              <span className="text-sm">{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  case 'image':
                    return (
                      <div key={field.id}>
                        <Label>{field.label}{field.required && ' *'}</Label>
                        <div className="mt-2">
                          {playerData[field.id] ? (
                            <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                              <Image
                                src={playerData[field.id]}
                                alt={field.label}
                                fill
                                className="object-cover"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="absolute top-1 right-1"
                                onClick={() => updatePlayerData(field.id, '')}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                              <Upload className="h-6 w-6 mx-auto text-gray-400 mb-1" />
                              <p className="text-xs text-gray-600">点击上传{field.label}</p>
                              <p className="text-xs text-gray-500">支持 JPG、PNG 格式，最大 5MB</p>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    // 验证文件大小
                                    if (file.size > 5 * 1024 * 1024) {
                                      alert('图片大小不能超过 5MB')
                                      return
                                    }

                                    // 上传图片
                                    try {
                                      setIsSubmitting(true)
                                      const formData = new FormData()
                                      formData.append('file', file)
                                      formData.append('bucket', 'player-photos')

                                      const response = await fetch('/api/portal/upload', {
                                        method: 'POST',
                                        body: formData,
                                      })

                                      const result = await response.json()

                                      if (result.success) {
                                        updatePlayerData(field.id, result.data.url)
                                        alert('上传成功！')
                                      } else {
                                        alert(result.error || '上传失败')
                                      }
                                    } catch (error) {
                                      console.error('Upload error:', error)
                                      alert('上传失败，请重试')
                                    } finally {
                                      setIsSubmitting(false)
                                    }
                                  }
                                }}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                disabled={isSubmitting}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  default:
                    return null
                }
              })}
            </div>

            <Button
              className="w-full mt-6"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  提交中...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  提交信息
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}