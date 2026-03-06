'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, Upload, Loader2, Calendar, MapPin, Phone, FileText, Paperclip, X, Download } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

interface ProjectType {
  id: string
  name: string
  display_order: number
  is_enabled: boolean
}

interface Project {
  id: string
  project_type_id: string
  name: string
  display_order: number
  is_enabled: boolean
}

interface Division {
  id: string
  project_id: string
  name: string
  description?: string
  display_order: number
  is_enabled: boolean
}

interface EventReferenceTemplate {
  name: string
  path: string
  url: string
  size: number
  mimeType: string
  uploadedAt: string
}

const TEMPLATE_FILE_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif', 'webp']
const TEMPLATE_FILE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])
const DESKTOP_TEMPLATE_ACCEPT = [
  'application/pdf',
  '.pdf',
  'application/msword',
  '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.docx',
  'application/vnd.ms-excel',
  '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsx',
  'image/jpeg',
  '.jpg',
  '.jpeg',
  'image/png',
  '.png',
  'image/gif',
  '.gif',
  'image/webp',
  '.webp',
].join(',')

// 表单验证 schema
const createEventSchema = z.object({
  name: z.string().min(1, '赛事名称不能为空').max(100, '赛事名称不能超过100个字符'),
  type: z.string().min(1, '请选择赛事类型'),
  start_date: z.string().min(1, '请选择开始时间'),
  end_date: z.string().min(1, '请选择结束时间'),
  address: z.string().max(200, '地址不能超过200个字符').optional(),
  details: z.string().max(5000, '详情不能超过5000个字符').optional(),
  phone: z.string().max(20, '电话号码不能超过20个字符').optional(),
  requirements: z.string().max(5000, '报名要求不能超过5000个字符').optional(),
}).refine((data) => {
  if (data.start_date && data.end_date) {
    return new Date(data.start_date) <= new Date(data.end_date)
  }
  return true
}, {
  message: '结束时间不能早于开始时间',
  path: ['end_date']
})

type EventFormData = z.infer<typeof createEventSchema>

export default function CreateEventPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterPreview, setPosterPreview] = useState<string | null>(null)
  const [referenceTemplateFiles, setReferenceTemplateFiles] = useState<File[]>([])
  const [uploadingTemplates, setUploadingTemplates] = useState(false)
  const [error, setError] = useState('')
  const [dateError, setDateError] = useState('')
  const router = useRouter()

  // 动态配置数据
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([])
  const [loadingConfig, setLoadingConfig] = useState(true)
  const referenceTemplateAccept = useMemo<string | undefined>(() => {
    if (typeof navigator === 'undefined') {
      return DESKTOP_TEMPLATE_ACCEPT
    }

    const ua = navigator.userAgent.toLowerCase()
    const isMobileFileChooser = /iphone|ipad|ipod|android|mobile|harmonyos/.test(ua)
    return isMobileFileChooser ? undefined : DESKTOP_TEMPLATE_ACCEPT
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm<EventFormData>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      name: '',
      type: '',
      start_date: '',
      end_date: '',
      address: '',
      details: '',
      phone: '',
      requirements: ''
    }
  })

  const watchedStartDate = watch('start_date')
  const watchedEndDate = watch('end_date')

  // 加载项目配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [typesRes, projectsRes, divisionsRes] = await Promise.all([
          fetch('/api/project-management/types'),
          fetch('/api/project-management/projects'),
          fetch('/api/project-management/divisions'),
        ])
        const [typesData, projectsData, divisionsData] = await Promise.all([
          typesRes.json(),
          projectsRes.json(),
          divisionsRes.json(),
        ])
        if (typesData.success) setProjectTypes(typesData.data.filter((t: ProjectType) => t.is_enabled))
        if (projectsData.success) setProjects(projectsData.data.filter((p: Project) => p.is_enabled))
        if (divisionsData.success) setDivisions(divisionsData.data.filter((d: Division) => d.is_enabled))
      } catch (e) {
        console.error('Load config error:', e)
      } finally {
        setLoadingConfig(false)
      }
    }
    loadConfig()
  }, [])

  // 当前类型下的项目
  const filteredProjects = projects.filter(p => p.project_type_id === selectedTypeId)
  // 当前项目下的组别
  const filteredDivisions = divisions.filter(d => d.project_id === selectedProjectId)

  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // 实时验证赛事时间
  useEffect(() => {
    if (watchedStartDate && watchedEndDate) {
      const startDate = new Date(watchedStartDate)
      const endDate = new Date(watchedEndDate)

      if (endDate < startDate) {
        setDateError(`⚠️ 结束时间不能早于开始时间（当前开始时间为：${formatDate(watchedStartDate)}）`)
      } else {
        setDateError('')
      }
    }
  }, [watchedStartDate, watchedEndDate])

  const handlePosterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        setError('请选择图片文件')
        return
      }
      
      // 验证文件大小 (5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('图片大小不能超过 5MB')
        return
      }

      setPosterFile(file)
      
      // 创建预览
      const reader = new FileReader()
      reader.onload = (e) => {
        setPosterPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
      setError('')
    }
  }

  const uploadPoster = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('bucket', 'event-posters')

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      
      if (result.success) {
        return result.data.url
      } else {
        throw new Error(result.error || '文件上传失败')
      }
    } catch (error) {
      console.error('Upload error:', error)
      return null
    }
  }

  const uploadReferenceTemplate = async (file: File): Promise<EventReferenceTemplate | null> => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('bucket', 'team-documents')

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || '模板上传失败')
      }

      return {
        name: result.data.originalName || file.name,
        path: result.data.path,
        url: result.data.url,
        size: Number(result.data.size || file.size || 0),
        mimeType: result.data.mimeType || file.type || '',
        uploadedAt: new Date().toISOString(),
      }
    } catch (uploadError) {
      console.error('Upload template error:', uploadError)
      return null
    }
  }

  const formatFileSize = (size: number) => {
    if (size <= 0) return '0 B'
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleTemplateFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    const invalidFiles = files.filter((file) => {
      if (TEMPLATE_FILE_MIME_TYPES.has(file.type)) {
        return false
      }
      const extension = file.name.split('.').pop()?.toLowerCase()
      return !extension || !TEMPLATE_FILE_EXTENSIONS.includes(extension)
    })

    if (invalidFiles.length > 0) {
      setError('模板仅支持 PDF、Word、Excel 或常见图片文件')
      e.target.value = ''
      return
    }

    setReferenceTemplateFiles((prev) => [...prev, ...files])
    setError('')
    e.target.value = ''
  }

  const removeReferenceTemplate = (index: number) => {
    setReferenceTemplateFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))
  }

  const previewReferenceTemplate = (file: File) => {
    const fileUrl = URL.createObjectURL(file)
    window.open(fileUrl, '_blank', 'noopener,noreferrer')
    setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000)
  }

  const deleteReferenceTemplatePaths = async (paths: string[]) => {
    if (paths.length === 0) return

    try {
      const response = await fetch('/api/upload', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bucket: 'team-documents',
          paths,
        }),
      })

      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '模板文件清理失败')
      }
    } catch (deleteError) {
      console.error('Cleanup template files error:', deleteError)
    }
  }

  const onSubmit = async (data: EventFormData) => {
    // 验证组别选择
    if (filteredDivisions.length > 0 && selectedDivisionIds.length === 0) {
      setError('请至少选择一个组别')
      return
    }

    setIsSubmitting(true)
    setError('')
    let uploadedReferenceTemplates: EventReferenceTemplate[] = []

    try {
      let poster_url = null

      // 如果有海报文件，先上传
      if (posterFile) {
        poster_url = await uploadPoster(posterFile)
        if (!poster_url) {
          throw new Error('海报上传失败')
        }
      }

      if (referenceTemplateFiles.length > 0) {
        setUploadingTemplates(true)
        const uploadResults = await Promise.all(
          referenceTemplateFiles.map((file) => uploadReferenceTemplate(file))
        )
        uploadedReferenceTemplates = uploadResults.filter((item): item is EventReferenceTemplate => Boolean(item))
        if (uploadedReferenceTemplates.length !== referenceTemplateFiles.length) {
          throw new Error('部分模板上传失败，请重试')
        }
      }

      // 创建赛事
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          poster_url,
          reference_templates: uploadedReferenceTemplates,
          division_ids: selectedDivisionIds,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || '创建赛事失败')
      }

      router.push('/events')
      router.refresh()
    } catch (error) {
      if (uploadedReferenceTemplates.length > 0) {
        await deleteReferenceTemplatePaths(
          uploadedReferenceTemplates
            .map((item) => item.path)
            .filter((path): path is string => typeof path === 'string' && path.length > 0)
        )
      }
      console.error('Create event error:', error)
      setError(error instanceof Error ? error.message : '网络错误，请稍后重试')
    } finally {
      setUploadingTemplates(false)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-4xl mx-auto px-6">
        {/* 头部导航 */}
        <div className="mb-6">
          <Link href="/events" className="inline-flex items-center text-blue-600 hover:text-blue-700">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回赛事列表
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="h-5 w-5 mr-2" />
              创建赛事活动
            </CardTitle>
            <CardDescription>
              填写赛事基本信息，创建后可在管理页面进一步配置报名设置
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* 赛事名称 */}
              <div>
                <Label htmlFor="name">赛事名称 *</Label>
                <Input
                  id="name"
                  {...register('name')}
                  placeholder="输入完整的赛事名称"
                  className="mt-1"
                />
                {errors.name && (
                  <p className="text-red-600 text-sm mt-1">{errors.name.message}</p>
                )}
              </div>

              {/* 赛事海报上传 */}
              <div>
                <Label>赛事海报</Label>
                <div className="mt-2">
                  {posterPreview ? (
                    <div className="relative w-40 h-40 border rounded-lg overflow-hidden">
                      <Image
                        src={posterPreview}
                        alt="海报预览"
                        fill
                        className="object-cover"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="absolute top-2 right-2"
                        onClick={() => {
                          setPosterFile(null)
                          setPosterPreview(null)
                        }}
                      >
                        移除
                      </Button>
                    </div>
                  ) : (
                    <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
                      <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                      <p className="text-sm text-gray-600 mb-2">点击或拖拽上传海报图片</p>
                      <p className="text-xs text-gray-500">支持 JPG、PNG 格式，文件大小不超过 5MB</p>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePosterChange}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 参考模板（多附件） */}
              <div>
                <Label className="flex items-center">
                  <Paperclip className="h-4 w-4 mr-1" />
                  参考模板
                </Label>
                <p className="text-xs text-gray-500 mt-1 mb-2">
                  支持选择多个模板文件，提交创建时自动上传（PDF、DOC、DOCX、XLS、XLSX、图片，单个不超过 20MB）
                </p>
                <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                  <p className="text-sm text-gray-600 mb-1">
                    {uploadingTemplates ? '模板上传中...' : '点击或拖拽选择模板文件（可多选）'}
                  </p>
                  <input
                    type="file"
                    accept={referenceTemplateAccept}
                    multiple
                    onChange={handleTemplateFilesChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    disabled={isSubmitting || uploadingTemplates}
                  />
                </div>

                {referenceTemplateFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {referenceTemplateFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                        className="flex items-center justify-between border rounded-md px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700"
                            onClick={() => previewReferenceTemplate(file)}
                            disabled={isSubmitting}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            预览
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeReferenceTemplate(index)}
                            disabled={isSubmitting}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 赛事类型 - 三级联动 */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>赛事类型 *</Label>
                    <Select
                      onValueChange={(value) => {
                        const pt = projectTypes.find(t => t.id === value)
                        setSelectedTypeId(value)
                        setSelectedProjectId('')
                        setSelectedDivisionIds([])
                        setValue('type', pt?.name || '')
                      }}
                      value={selectedTypeId}
                      disabled={loadingConfig}
                    >
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue placeholder={loadingConfig ? '加载中...' : '选择赛事类型'} />
                      </SelectTrigger>
                      <SelectContent>
                        {projectTypes.map((pt) => (
                          <SelectItem key={pt.id} value={pt.id}>
                            {pt.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  {errors.type && (
                      <p className="text-red-600 text-sm">{errors.type.message}</p>
                    )}
                  </div>

                  {filteredProjects.length > 0 && (
                    <div className="space-y-2">
                      <Label>具体项目 *</Label>
                      <Select
                        onValueChange={(value) => {
                          setSelectedProjectId(value)
                          setSelectedDivisionIds([])
                        }}
                        value={selectedProjectId}
                      >
                        <SelectTrigger className="h-11 w-full">
                          <SelectValue placeholder="选择具体项目" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredProjects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* 组别多选 */}
                {filteredDivisions.length > 0 && (
                <div className="space-y-2">
                  <Label>组别选择 *</Label>
                  <p className="text-sm text-gray-500">选择该赛事包含的组别，每个组别可独立配置报名设置</p>
                  <div className="border rounded-md p-4 space-y-2 max-h-60 overflow-y-auto">
                      {filteredDivisions.map((division) => (
                        <div key={division.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`division-${division.id}`}
                            checked={selectedDivisionIds.includes(division.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedDivisionIds([...selectedDivisionIds, division.id])
                              } else {
                                setSelectedDivisionIds(selectedDivisionIds.filter(id => id !== division.id))
                              }
                            }}
                          />
                          <label htmlFor={`division-${division.id}`} className="text-sm cursor-pointer">
                            {division.name}
                            {division.description && (
                              <span className="text-gray-500 ml-2">({division.description})</span>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                    {selectedDivisionIds.length > 0 && (
                      <p className="text-sm text-blue-600">
                        已选择 {selectedDivisionIds.length} 个组别
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 时间设置 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start_date">开始时间 *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    {...register('start_date')}
                    className="mt-1"
                  />
                  {errors.start_date && (
                    <p className="text-red-600 text-sm mt-1">{errors.start_date.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="end_date">结束时间 *</Label>
                  <Input
                    id="end_date"
                    type="date"
                    {...register('end_date')}
                    className="mt-1"
                  />
                  {errors.end_date && (
                    <p className="text-red-600 text-sm mt-1">{errors.end_date.message}</p>
                  )}
                  {dateError && (
                    <p className="text-amber-600 text-sm mt-1">{dateError}</p>
                  )}
                </div>
              </div>

              {/* 赛事地址 */}
              <div>
                <Label htmlFor="address" className="flex items-center">
                  <MapPin className="h-4 w-4 mr-1" />
                  赛事地址
                </Label>
                <Input
                  id="address"
                  {...register('address')}
                  placeholder="比赛举办地址"
                  className="mt-1"
                />
                {errors.address && (
                  <p className="text-red-600 text-sm mt-1">{errors.address.message}</p>
                )}
              </div>

              {/* 咨询电话 */}
              <div>
                <Label htmlFor="phone" className="flex items-center">
                  <Phone className="h-4 w-4 mr-1" />
                  咨询电话
                </Label>
                <Input
                  id="phone"
                  {...register('phone')}
                  placeholder="联系电话"
                  className="mt-1"
                />
                {errors.phone && (
                  <p className="text-red-600 text-sm mt-1">{errors.phone.message}</p>
                )}
              </div>

              {/* 赛事详情 */}
              <div>
                <Label htmlFor="details" className="flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  赛事详情
                </Label>
                <Textarea
                  id="details"
                  {...register('details')}
                  placeholder="详细描述赛事规则、奖项设置等信息"
                  className="mt-1 min-h-32"
                />
                {errors.details && (
                  <p className="text-red-600 text-sm mt-1">{errors.details.message}</p>
                )}
              </div>

              {/* 报名要求 */}
              <div>
                <Label htmlFor="requirements" className="flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  报名要求
                </Label>
                <Textarea
                  id="requirements"
                  {...register('requirements')}
                  placeholder="填写参赛队伍和人员的具体要求，如年龄限制、资格要求、每队人数等"
                  className="mt-1 min-h-32"
                />
                {errors.requirements && (
                  <p className="text-red-600 text-sm mt-1">{errors.requirements.message}</p>
                )}
              </div>

              {/* 提交按钮 */}
              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isSubmitting}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      创建中...
                    </>
                  ) : (
                    '创建赛事'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
