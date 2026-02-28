'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Clock, Eye } from 'lucide-react'

interface Registration {
  id: string
  team_data: Record<string, unknown>
  submitted_at: string
}

interface RegistrationField {
  id: string
  label: string
  type?: string
}

interface ReviewListTabProps {
  eventId: string
  onReviewComplete?: () => void
}

export default function ReviewListTab({ eventId }: ReviewListTabProps) {
  const router = useRouter()
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [teamFields, setTeamFields] = useState<RegistrationField[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRegistrationSettings = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/registration-settings`)
      const result = await response.json()

      if (result.success && result.data?.team_requirements) {
        const teamRequirements = result.data.team_requirements
        const fields: RegistrationField[] = teamRequirements.allFields || [
          ...(teamRequirements.commonFields || []),
          ...(teamRequirements.customFields || []),
        ]
        setTeamFields(fields)
      }
    } catch (error) {
      console.error('Error fetching registration settings:', error)
    }
  }, [eventId])

  const fetchRegistrations = useCallback(async () => {
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
  }, [eventId])

  useEffect(() => {
    fetchRegistrations()
    fetchRegistrationSettings()
  }, [fetchRegistrations, fetchRegistrationSettings])

  const displayFields = useMemo(
    () => teamFields
      .filter((field) => !['image', 'attachment', 'attachments'].includes(field.type || ''))
      .slice(0, 3),
    [teamFields]
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const renderCellValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') return '-'
    if (Array.isArray(value)) {
      const text = value.map((item) => String(item)).join(', ')
      return text.length > 12 ? `${text.slice(0, 12)}...` : text
    }
    if (typeof value === 'object') {
      const attachmentName = (value as { name?: unknown }).name
      if (typeof attachmentName === 'string' && attachmentName.trim()) {
        return attachmentName
      }
      return '已上传附件'
    }
    const text = String(value)
    return text.length > 12 ? `${text.slice(0, 12)}...` : text
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Clock className="h-5 w-5 mr-2" />
          审核列表
        </CardTitle>
        <CardDescription>等待审核的报名申请 ({registrations.length})</CardDescription>
      </CardHeader>
      <CardContent>
        {registrations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">暂无待审核的报名</div>
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                {displayFields.map((field) => (
                  <TableHead key={field.id} className="w-[20%] px-1">
                    {field.label}
                  </TableHead>
                ))}
                <TableHead className="w-[22%] px-1">提交时间</TableHead>
                <TableHead className="w-[18%] px-1">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.map((registration) => (
                <TableRow key={registration.id}>
                  {displayFields.map((field) => (
                    <TableCell key={field.id} className="px-1 py-2">
                      <div className="whitespace-pre-wrap break-words text-sm" style={{ maxWidth: '160px', wordBreak: 'break-all' }}>
                        {renderCellValue(registration.team_data?.[field.id])}
                      </div>
                    </TableCell>
                  ))}
                  <TableCell className="whitespace-nowrap px-1 py-2 text-xs">{formatDate(registration.submitted_at)}</TableCell>
                  <TableCell className="px-1 py-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/events/${eventId}/registrations/${registration.id}/review`)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      审核
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
