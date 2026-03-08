'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
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
import { Loader2, Upload, Calendar, MapPin, Phone, FileText, Link2, ExternalLink, Paperclip, Download, X } from 'lucide-react'
import Image from 'next/image'
import { toSafeHttpUrl } from '@/lib/url-security'
import type { EventReferenceTemplate, ReferenceTemplateType } from '@/lib/types'
import {
  findDuplicateSpecialTemplateTypes,
  getReferenceTemplateTypeLabel,
  inferReferenceTemplateType,
  parseReferenceTemplates,
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

interface DivisionItem {
  id: string
  project_id: string
  name: string
  description?: string
  display_order: number
  is_enabled: boolean
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

function resolveTemplateStoragePath(template: EventReferenceTemplate): string | null {
  if (typeof template.path === 'string' && template.path.trim()) {
    return template.path.trim()
  }

  const safeUrl = toSafeHttpUrl(template.url)
  if (!safeUrl) return null

  try {
    const parsed = new URL(safeUrl)
    const marker = '/storage/v1/object/public/team-documents/'
    const markerIndex = parsed.pathname.indexOf(marker)
    if (markerIndex === -1) return null

    const rawPath = parsed.pathname.slice(markerIndex + marker.length)
    const decodedPath = decodeURIComponent(rawPath).trim()
    return decodedPath || null
  } catch {
    return null
  }
}

function extractLinks(text: string): string[] {
  if (!text) return []
  const urlRegex = /(https?:\/\/[^\s]+)/g
  return text.match(urlRegex) || []
}

function LinkPreview({ links }: { links: string[] }) {
  if (links.length === 0) return null

  return (
    <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
        <Link2 className="h-4 w-4" />
        <span>检测到 {links.length} 个链接</span>
      </div>
      <div className="space-y-1">
        {links.map((link, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <ExternalLink className="h-3 w-3 flex-shrink-0 text-primary" />
            <a href={link} target="_blank" rel="noopener noreferrer"
              className="flex-1 break-all underline text-primary hover:text-primary/80"
              onClick={(e) => e.stopPropagation()}>{link}</a>
          </div>
        ))}
      </div>
    </div>
  )
}

const updateEventSchema = z.object({
  name: z.string().min(1, '赛事名称不能为空').max(100, '赛事名称不能超过100个字符'),
  type: z.string().min(1, '请选择赛事类型'),
  start_date: z.string().min(1, '请选择开始时间'),
  end_date: z.string().min(1, '请选择结束时间'),
  address: z.string().max(200, '地址不能超过200个字符').optional(),
  details: z.string().max(5000, '详情不能超过5000个字符').optional(),
  requirements: z.string().max(5000, '报名要求不能超过5000个字符').optional(),
  phone: z.string().max(20, '电话号码不能超过20个字符').optional(),
}).refine((data) => {
  if (data.start_date && data.end_date) {
    return new Date(data.start_date) <= new Date(data.end_date)
  }
  return true
}, {
  message: '结束时间不能早于开始时间',
  path: ['end_date']
})

type EventFormData = z.infer<typeof updateEventSchema>

interface BasicInfoTabProps {
  event: {
    id: string
    name: string
    short_name?: string
    poster_url?: string
    type: string
    start_date: string
    end_date: string
    address?: string
    details?: string
    requirements?: string
    phone?: string
    reference_templates?: unknown
  }
  onUpdate: () => void
}

export default function BasicInfoTab({ event, onUpdate }: BasicInfoTabProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterPreview, setPosterPreview] = useState<string | null>(event.poster_url || null)
  const [referenceTemplates, setReferenceTemplates] = useState<EventReferenceTemplate[]>(
    parseReferenceTemplates(event.reference_templates)
  )
  const [uploadingTemplates, setUploadingTemplates] = useState(false)
  const [pendingDeleteTemplatePaths, setPendingDeleteTemplatePaths] = useState<string[]>([])
  const [error, setError] = useState('')
  const [dateError, setDateError] = useState('')

  // 动态配置
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([])
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [allDivisions, setAllDivisions] = useState<DivisionItem[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([])
  const [loadingConfig, setLoadingConfig] = useState(true)
  const previousEventIdRef = useRef(event.id)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm<EventFormData>({
    resolver: zodResolver(updateEventSchema),
    defaultValues: {
      name: event.name,
      type: event.type,
      start_date: event.start_date,
      end_date: event.end_date,
      address: event.address || '',
      details: event.details || '',
      requirements: event.requirements || '',
      phone: event.phone || ''
    }
  })

  const watchedStartDate = watch('start_date')
  const watchedEndDate = watch('end_date')
  const watchedDetails = watch('details')
  const watchedRequirements = watch('requirements')

  const detailsLinks = extractLinks(watchedDetails || '')
  const requirementsLinks = extractLinks(watchedRequirements || '')

  const filteredProjects = allProjects.filter(p => p.project_type_id === selectedTypeId)
  const filteredDivisions = allDivisions.filter(d => d.project_id === selectedProjectId)
  const referenceTemplateAccept = useMemo<string | undefined>(() => {
    if (typeof navigator === 'undefined') {
      return DESKTOP_TEMPLATE_ACCEPT
    }

    const ua = navigator.userAgent.toLowerCase()
    const isMobileFileChooser = /iphone|ipad|ipod|android|mobile|harmonyos/.test(ua)
    return isMobileFileChooser ? undefined : DESKTOP_TEMPLATE_ACCEPT
  }, [])

  // 加载配置 + 赛事已关联的组别
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [typesRes, projectsRes, divisionsRes, eventDivisionsRes] = await Promise.all([
          fetch('/api/project-management/types'),
          fetch('/api/project-management/projects'),
          fetch('/api/project-management/divisions'),
          fetch(`/api/events/${event.id}/divisions`),
        ])
        const [typesData, projectsData, divisionsData, eventDivisionsData] = await Promise.all([
          typesRes.json(), projectsRes.json(), divisionsRes.json(), eventDivisionsRes.json(),
        ])

        const types = typesData.success ? typesData.data.filter((t: ProjectType) => t.is_enabled) : []
        const projects = projectsData.success ? projectsData.data.filter((p: Project) => p.is_enabled) : []
        const divs = divisionsData.success ? divisionsData.data.filter((d: DivisionItem) => d.is_enabled) : []

        setProjectTypes(types)
        setAllProjects(projects)
        setAllDivisions(divs)

        // 优先根据赛事已关联组别反推“项目/类型”，避免依赖 short_name 猜测导致回填失败
        if (eventDivisionsData.success && eventDivisionsData.data && eventDivisionsData.data.length > 0) {
          const linkedDivisions: DivisionItem[] = eventDivisionsData.data
          setSelectedDivisionIds(linkedDivisions.map((d: DivisionItem) => d.id))

          const projectIdFromDivision = linkedDivisions[0]?.project_id
          if (projectIdFromDivision) {
            const matchedProject = projects.find((p: Project) => p.id === projectIdFromDivision)
            if (matchedProject) {
              setSelectedProjectId(matchedProject.id)
              const matchedType = types.find((t: ProjectType) => t.id === matchedProject.project_type_id)
              if (matchedType) {
                setSelectedTypeId(matchedType.id)
                setValue('type', matchedType.name, { shouldValidate: true })
              }
            }
          }
        } else {
          // 兼容旧数据：根据赛事的 type + short_name 回填
          const matchedType = types.find((t: ProjectType) => t.name === event.type)
          if (matchedType) {
            setSelectedTypeId(matchedType.id)
            setValue('type', matchedType.name, { shouldValidate: true })
            const matchedProject = projects.find((p: Project) =>
              p.project_type_id === matchedType.id && p.name === event.short_name
            )
            if (matchedProject) {
              setSelectedProjectId(matchedProject.id)
            }
          }
        }
      } catch (e) {
        console.error('Load config error:', e)
      } finally {
        setLoadingConfig(false)
      }
    }
    loadConfig()
  }, [event.id, event.type, event.short_name, setValue])

  // 确保编辑场景下未手动切换类型时，type 仍在表单值中
  useEffect(() => {
    if (event.type) {
      setValue('type', event.type, { shouldValidate: true })
    }
  }, [event.type, setValue])

  useEffect(() => {
    setReferenceTemplates(parseReferenceTemplates(event.reference_templates))
    if (previousEventIdRef.current !== event.id) {
      setPendingDeleteTemplatePaths([])
      previousEventIdRef.current = event.id
    }
  }, [event.id, event.reference_templates])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  useEffect(() => {
    if (watchedStartDate && watchedEndDate) {
      if (new Date(watchedEndDate) < new Date(watchedStartDate)) {
        setDateError(`结束时间不能早于开始时间（当前开始时间为：${formatDate(watchedStartDate)}）`)
      } else {
        setDateError('')
      }
    }
  }, [watchedStartDate, watchedEndDate])

  const handlePosterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return }
      if (file.size > 5 * 1024 * 1024) { setError('图片大小不能超过 5MB'); return }
      setPosterFile(file)
      const reader = new FileReader()
      reader.onload = (e) => setPosterPreview(e.target?.result as string)
      reader.readAsDataURL(file)
      setError('')
    }
  }

  const uploadPoster = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('bucket', 'event-posters')
      const response = await fetch('/api/upload', { method: 'POST', body: formData })
      const result = await response.json()
      if (result.success) return result.data.url
      throw new Error(result.error || '文件上传失败')
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
      const response = await fetch('/api/upload', { method: 'POST', body: formData })
      const result = await response.json()
      if (!result.success) throw new Error(result.error || '模板上传失败')

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

  const handleTemplateFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setUploadingTemplates(true)
    try {
      const uploadResults = await Promise.all(
        files.map((file) => uploadReferenceTemplate(file, inferReferenceTemplateType(file.name)))
      )
      const successFiles = uploadResults.filter((item): item is EventReferenceTemplate => Boolean(item))

      if (successFiles.length > 0) {
        setReferenceTemplates((prev) => [...prev, ...successFiles])
      }

      if (successFiles.length !== files.length) {
        setError('部分模板上传失败，请重试失败文件')
      }
    } finally {
      setUploadingTemplates(false)
      e.target.value = ''
    }
  }

  const removeReferenceTemplate = (file: EventReferenceTemplate, index: number) => {
    setReferenceTemplates((prev) => prev.filter((_, fileIndex) => fileIndex !== index))
    const storagePath = resolveTemplateStoragePath(file)
    if (storagePath) {
      setPendingDeleteTemplatePaths((prev) =>
        prev.includes(storagePath) ? prev : [...prev, storagePath]
      )
    }
  }

  const updateReferenceTemplateType = (index: number, templateType: ReferenceTemplateType) => {
    setReferenceTemplates((prev) =>
      prev.map((item, templateIndex) => (
        templateIndex === index ? { ...item, templateType } : item
      ))
    )
  }

  const deleteReferenceTemplatePaths = async (paths: string[]): Promise<string | null> => {
    try {
      const response = await fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket: 'team-documents',
          paths,
        }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '模板文件删除失败')
      }
      return null
    } catch (deleteError) {
      console.error('Delete template files error:', deleteError)
      return deleteError instanceof Error ? deleteError.message : '旧模板文件删除失败，请稍后重试'
    }
  }

  const onSubmit = async (data: EventFormData) => {
    setIsSubmitting(true)
    setError('')

    try {
      const duplicateTemplateTypes = findDuplicateSpecialTemplateTypes(
        referenceTemplates.map((item) => ({
          name: item.name,
          templateType: item.templateType,
        }))
      )

      if (duplicateTemplateTypes.length > 0) {
        setError(`同一赛事仅允许上传一份${duplicateTemplateTypes.map(getReferenceTemplateTypeLabel).join('、')}`)
        return
      }

      let poster_url = event.poster_url
      if (posterFile) {
        const uploadedUrl = await uploadPoster(posterFile)
        if (!uploadedUrl) throw new Error('海报上传失败')
        poster_url = uploadedUrl
      }

      // 更新赛事基本信息
      const response = await fetch(`/api/events/${event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, poster_url, reference_templates: referenceTemplates }),
      })
      const result = await response.json()

      if (!result.success) {
        setError(result.error || '更新赛事失败')
        return
      }

      // 更新组别关联
      const divisionResponse = await fetch(`/api/events/${event.id}/divisions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ division_ids: selectedDivisionIds }),
      })

      const divisionResult = await divisionResponse.json()
      if (!divisionResponse.ok || !divisionResult.success) {
        setError(divisionResult.error || '更新赛事组别失败')
        return
      }

      const deletePaths = Array.from(new Set(pendingDeleteTemplatePaths))
      if (deletePaths.length > 0) {
        const deleteWarning = await deleteReferenceTemplatePaths(deletePaths)
        if (!deleteWarning) {
          setPendingDeleteTemplatePaths([])
        } else {
          setError(`赛事信息已保存，但旧模板清理失败：${deleteWarning}`)
          return
        }
      }

      alert('保存成功！')
      onUpdate()
    } catch (error) {
      console.error('Update event error:', error)
      setError('网络错误，请稍后重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Calendar className="h-5 w-5 mr-2" />
          基本信息
        </CardTitle>
        <CardDescription>修改赛事基本信息</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-6 rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <input type="hidden" {...register('type')} />

          <div className="space-y-2">
            <Label htmlFor="name">赛事名称 *</Label>
            <Input id="name" {...register('name')} placeholder="输入完整的赛事名称" className="h-11 w-full" />
            {errors.name && <p className="text-red-600 text-sm">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>赛事海报</Label>
            <div>
              {posterPreview ? (
                <div className="relative w-40 h-40 border rounded-lg overflow-hidden">
                  <Image src={posterPreview} alt="海报预览" fill className="object-cover" />
                  <Button type="button" size="sm" variant="destructive" className="absolute top-2 right-2"
                    onClick={() => { setPosterFile(null); setPosterPreview(null) }}>移除</Button>
                </div>
              ) : (
                <div className="relative rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/40 hover:bg-muted/20">
                  <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="mb-2 text-sm text-foreground">点击或拖拽上传海报图片</p>
                  <p className="text-xs text-muted-foreground">支持 JPG、PNG 格式，文件大小不超过 5MB</p>
                  <input type="file" accept="image/*" onChange={handlePosterChange}
                    className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center">
              <Paperclip className="h-4 w-4 mr-1" />
              参考模板
            </Label>
            <p className="text-xs text-muted-foreground">
              支持多个模板，教练可在门户赛事详情下载（PDF、DOC、DOCX、XLS、XLSX、图片，单个不超过 20MB）
            </p>
            <div className="relative rounded-lg border-2 border-dashed border-border p-4 text-center transition-colors hover:border-primary/40 hover:bg-muted/20">
              <p className="mb-1 text-sm text-foreground">
                {uploadingTemplates ? '上传中...' : '点击或拖拽上传模板文件（可多选）'}
              </p>
              <input
                type="file"
                accept={referenceTemplateAccept}
                multiple
                onChange={handleTemplateFilesChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
                disabled={uploadingTemplates}
              />
            </div>

            {referenceTemplates.length > 0 && (
              <div className="space-y-2">
                {referenceTemplates.map((file, index) => {
                  const safePreviewUrl = toSafeHttpUrl(file.url)

                  return (
                    <div key={`${file.path}-${index}`} className="flex flex-col gap-3 rounded-md border border-border/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="min-w-[170px]">
                          <Select
                            value={file.templateType || inferReferenceTemplateType(file.name)}
                            onValueChange={(value: ReferenceTemplateType) => updateReferenceTemplateType(index, value)}
                          >
                            <SelectTrigger className="h-9 w-full">
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
                        <div className="flex items-center gap-2">
                          {safePreviewUrl && (
                            <a
                              href={safePreviewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-xs text-primary hover:text-primary/80"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              预览
                            </a>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeReferenceTemplate(file, index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
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
                      <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.type && <p className="text-red-600 text-sm">{errors.type.message}</p>}
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
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {filteredDivisions.length > 0 && (
              <div className="space-y-2">
                <Label>组别选择</Label>
                <p className="text-sm text-muted-foreground">选择该赛事包含的组别</p>
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border border-border/60 p-4">
                  {filteredDivisions.map((division) => (
                    <div key={division.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`div-${division.id}`}
                        checked={selectedDivisionIds.includes(division.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedDivisionIds([...selectedDivisionIds, division.id])
                          } else {
                            setSelectedDivisionIds(selectedDivisionIds.filter(id => id !== division.id))
                          }
                        }}
                      />
                      <label htmlFor={`div-${division.id}`} className="text-sm cursor-pointer">
                        {division.name}
                        {division.description && <span className="ml-2 text-muted-foreground">({division.description})</span>}
                      </label>
                    </div>
                  ))}
                </div>
                {selectedDivisionIds.length > 0 && (
                  <p className="text-sm text-primary">已选择 {selectedDivisionIds.length} 个组别</p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">开始时间 *</Label>
              <Input id="start_date" type="date" {...register('start_date')} className="h-11 w-full" />
              {errors.start_date && <p className="text-red-600 text-sm">{errors.start_date.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">结束时间 *</Label>
              <Input id="end_date" type="date" {...register('end_date')} className="h-11 w-full" />
              {errors.end_date && <p className="text-red-600 text-sm">{errors.end_date.message}</p>}
              {dateError && <p className="text-amber-600 text-sm">{dateError}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address" className="flex items-center">
              <MapPin className="h-4 w-4 mr-1" />赛事地址
            </Label>
            <Input id="address" {...register('address')} placeholder="比赛举办地址" className="h-11 w-full" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center">
              <Phone className="h-4 w-4 mr-1" />咨询电话
            </Label>
            <Input id="phone" {...register('phone')} placeholder="联系电话" className="h-11 w-full" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="details" className="flex items-center">
              <FileText className="h-4 w-4 mr-1" />赛事详情
            </Label>
            <Textarea id="details" {...register('details')}
              placeholder="详细描述赛事规则、奖项设置等信息。支持插入链接，格式：https://..."
              className="min-h-32" />
            <LinkPreview links={detailsLinks} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="requirements" className="flex items-center">
              <FileText className="h-4 w-4 mr-1" />报名要求
            </Label>
            <Textarea id="requirements" {...register('requirements')}
              placeholder="详细描述参赛要求、资格条件、注意事项等信息。支持插入链接，格式：https://..."
              className="min-h-32" />
            <LinkPreview links={requirementsLinks} />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />保存中...</>) : '保存'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
