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
import type { EventReferenceTemplate, ReferenceTemplateType } from '@/lib/types'
import {
  findDuplicateSpecialTemplateTypes,
  getReferenceTemplateTypeLabel,
  inferReferenceTemplateType,
  REFERENCE_TEMPLATE_TYPE_OPTIONS,
} from '@/lib/reference-templates'

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

interface PendingReferenceTemplate {
  file: File
  templateType: ReferenceTemplateType
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

const MOBILE_ACTION_BUTTON_CLASS = 'h-10 w-full sm:w-auto'
const MOBILE_INLINE_ACTION_BUTTON_CLASS = 'h-10 w-full justify-center sm:h-9 sm:w-auto'

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
  const [referenceTemplateFiles, setReferenceTemplateFiles] = useState<PendingReferenceTemplate[]>([])
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

  const uploadReferenceTemplate = async (
    file: File,
    templateType: ReferenceTemplateType,
  ): Promise<EventReferenceTemplate | null> => {
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
        templateType,
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

    setReferenceTemplateFiles((prev) => [
      ...prev,
      ...files.map((file) => ({
        file,
        templateType: inferReferenceTemplateType(file.name),
      })),
    ])
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

  const updateReferenceTemplateType = (index: number, templateType: ReferenceTemplateType) => {
    setReferenceTemplateFiles((prev) =>
      prev.map((item, fileIndex) => (
        fileIndex === index ? { ...item, templateType } : item
      ))
    )
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
      const duplicateTemplateTypes = findDuplicateSpecialTemplateTypes(
        referenceTemplateFiles.map((item) => ({
          name: item.file.name,
          templateType: item.templateType,
        }))
      )

      if (duplicateTemplateTypes.length > 0) {
        throw new Error(
          `同一赛事仅允许上传一份${duplicateTemplateTypes.map(getReferenceTemplateTypeLabel).join('、')}`
        )
      }

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
          referenceTemplateFiles.map((item) => uploadReferenceTemplate(item.file, item.templateType))
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
    <div className="min-h-screen bg-background py-4 sm:py-6">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* 头部导航 */}
        <div className="mb-4 sm:mb-6">
          <Button variant="ghost" asChild className="h-10 w-full justify-start px-3 sm:w-auto">
            <Link href="/events">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回赛事列表
            </Link>
          </Button>
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
              <div className="mb-6 rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* 赛事名称 */}
              <div className="space-y-2">
                <Label htmlFor="name">赛事名称 *</Label>
                <Input
                  id="name"
                  {...register('name')}
                  placeholder="输入完整的赛事名称"
                  className="h-11 w-full"
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              {/* 赛事海报上传 */}
              <div className="space-y-2">
                <Label>赛事海报</Label>
                <div>
                  {posterPreview ? (
                    <div className="relative h-40 w-full max-w-[220px] overflow-hidden rounded-lg border">
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
                        className="absolute right-2 top-2 h-9 px-3"
                        onClick={() => {
                          setPosterFile(null)
                          setPosterPreview(null)
                        }}
                      >
                        移除
                      </Button>
                    </div>
                  ) : (
                    <div className="relative rounded-lg border-2 border-dashed border-border/60 p-6 text-center transition-colors hover:border-border sm:p-8">
                      <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground/70" />
                      <p className="mb-2 text-sm text-foreground">点击或拖拽上传海报图片</p>
                      <p className="text-xs text-muted-foreground">支持 JPG、PNG 格式，文件大小不超过 5MB</p>
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
              <div className="space-y-2">
                <Label className="flex items-center">
                  <Paperclip className="h-4 w-4 mr-1" />
                  参考模板
                </Label>
                <p className="text-xs text-muted-foreground">
                  支持选择多个模板文件，提交创建时自动上传（PDF、DOC、DOCX、XLS、XLSX、图片，单个不超过 20MB）
                </p>
                <div className="relative rounded-lg border-2 border-dashed border-border/60 p-4 text-center transition-colors hover:border-border">
                  <p className="mb-1 text-sm text-foreground">
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
                  <div className="space-y-2">
                    {referenceTemplateFiles.map((item, index) => (
                      <div
                        key={`${item.file.name}-${item.file.size}-${item.file.lastModified}-${index}`}
                        className="flex flex-col gap-3 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(item.file.size)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            当前用途：{getReferenceTemplateTypeLabel(item.templateType)}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="min-w-[170px]">
                            <Select
                              value={item.templateType}
                              onValueChange={(value: ReferenceTemplateType) => updateReferenceTemplateType(index, value)}
                            >
                              <SelectTrigger className="h-10 w-full">
                                <SelectValue placeholder="选择模板用途" />
                              </SelectTrigger>
                              <SelectContent>
                                {REFERENCE_TEMPLATE_TYPE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Button
                              type="button"
                              variant="outline"
                              className={MOBILE_INLINE_ACTION_BUTTON_CLASS}
                              onClick={() => previewReferenceTemplate(item.file)}
                              disabled={isSubmitting}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              预览
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className={`${MOBILE_INLINE_ACTION_BUTTON_CLASS} text-destructive hover:text-destructive`}
                              onClick={() => removeReferenceTemplate(index)}
                              disabled={isSubmitting}
                            >
                              <X className="mr-2 h-4 w-4" />
                              移除
                            </Button>
                          </div>
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
                      <p className="text-sm text-destructive">{errors.type.message}</p>
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
                  <p className="text-sm text-muted-foreground">选择该赛事包含的组别，每个组别可独立配置报名设置</p>
                  <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-3 sm:p-4">
                      {filteredDivisions.map((division) => (
                        <div key={division.id} className="flex items-start gap-3 rounded-md border border-border/50 px-3 py-3 sm:items-center">
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
                          <label htmlFor={`division-${division.id}`} className="cursor-pointer text-sm leading-5">
                            <span className="font-medium text-foreground">{division.name}</span>
                            {division.description && (
                              <span className="mt-1 block text-muted-foreground">{division.description}</span>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                    {selectedDivisionIds.length > 0 && (
                      <p className="text-sm text-primary">
                        已选择 {selectedDivisionIds.length} 个组别
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 时间设置 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">开始时间 *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    {...register('start_date')}
                    className="h-11 w-full"
                  />
                  {errors.start_date && (
                    <p className="text-sm text-destructive">{errors.start_date.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end_date">结束时间 *</Label>
                  <Input
                    id="end_date"
                    type="date"
                    {...register('end_date')}
                    className="h-11 w-full"
                  />
                  {errors.end_date && (
                    <p className="text-sm text-destructive">{errors.end_date.message}</p>
                  )}
                  {dateError && (
                    <p className="text-amber-600 text-sm">{dateError}</p>
                  )}
                </div>
              </div>

              {/* 赛事地址 */}
              <div className="space-y-2">
                <Label htmlFor="address" className="flex items-center">
                  <MapPin className="h-4 w-4 mr-1" />
                  赛事地址
                </Label>
                <Input
                  id="address"
                  {...register('address')}
                  placeholder="比赛举办地址"
                  className="h-11 w-full"
                />
                {errors.address && (
                  <p className="text-sm text-destructive">{errors.address.message}</p>
                )}
              </div>

              {/* 咨询电话 */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center">
                  <Phone className="h-4 w-4 mr-1" />
                  咨询电话
                </Label>
                <Input
                  id="phone"
                  {...register('phone')}
                  placeholder="联系电话"
                  className="h-11 w-full"
                />
                {errors.phone && (
                  <p className="text-sm text-destructive">{errors.phone.message}</p>
                )}
              </div>

              {/* 赛事详情 */}
              <div className="space-y-2">
                <Label htmlFor="details" className="flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  赛事详情
                </Label>
                <Textarea
                  id="details"
                  {...register('details')}
                  placeholder="详细描述赛事规则、奖项设置等信息"
                  className="min-h-32"
                />
                {errors.details && (
                  <p className="text-sm text-destructive">{errors.details.message}</p>
                )}
              </div>

              {/* 报名要求 */}
              <div className="space-y-2">
                <Label htmlFor="requirements" className="flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  报名要求
                </Label>
                <Textarea
                  id="requirements"
                  {...register('requirements')}
                  placeholder="填写参赛队伍和人员的具体要求，如年龄限制、资格要求、每队人数等"
                  className="min-h-32"
                />
                {errors.requirements && (
                  <p className="text-sm text-destructive">{errors.requirements.message}</p>
                )}
              </div>

              {/* 提交按钮 */}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isSubmitting}
                  className={MOBILE_ACTION_BUTTON_CLASS}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className={`${MOBILE_ACTION_BUTTON_CLASS} bg-primary text-primary-foreground hover:bg-primary/90`}
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
