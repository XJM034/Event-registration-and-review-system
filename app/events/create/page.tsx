'use client'

import { useState, useEffect } from 'react'
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
import { ArrowLeft, Upload, Loader2, Calendar, MapPin, Phone, FileText } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

// 表单验证 schema
const createEventSchema = z.object({
  name: z.string().min(1, '赛事名称不能为空').max(100, '赛事名称不能超过100个字符'),
  short_name: z.string().max(50, '赛事简称不能超过50个字符').optional(),
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

const eventTypes = [
  '体育',
  '科创',
  '艺术'
]

export default function CreateEventPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterPreview, setPosterPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [dateError, setDateError] = useState('')
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset
  } = useForm<EventFormData>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      name: '',
      short_name: '',
      type: '',
      start_date: '',
      end_date: '',
      address: '',
      details: '',
      phone: '',
      requirements: ''
    }
  })

  const watchedType = watch('type')
  const watchedStartDate = watch('start_date')
  const watchedEndDate = watch('end_date')

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

  const onSubmit = async (data: EventFormData) => {
    setIsSubmitting(true)
    setError('')

    try {
      let poster_url = null
      
      // 如果有海报文件，先上传
      if (posterFile) {
        poster_url = await uploadPoster(posterFile)
        if (!poster_url) {
          throw new Error('海报上传失败')
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
        }),
      })

      const result = await response.json()

      if (result.success) {
        router.push('/')
        router.refresh()
      } else {
        setError(result.error || '创建赛事失败')
      }
    } catch (error) {
      console.error('Create event error:', error)
      setError('网络错误，请稍后重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-4xl mx-auto px-6">
        {/* 头部导航 */}
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-700">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                <div>
                  <Label htmlFor="short_name">赛事简称</Label>
                  <Input
                    id="short_name"
                    {...register('short_name')}
                    placeholder="用于显示的简短名称"
                    className="mt-1"
                  />
                  {errors.short_name && (
                    <p className="text-red-600 text-sm mt-1">{errors.short_name.message}</p>
                  )}
                </div>
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

              {/* 赛事类型 */}
              <div>
                <Label htmlFor="type">赛事类型 *</Label>
                <Select onValueChange={(value) => setValue('type', value)} value={watchedType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="选择赛事类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.type && (
                  <p className="text-red-600 text-sm mt-1">{errors.type.message}</p>
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