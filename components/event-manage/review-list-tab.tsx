'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Clock, Download, Eye } from 'lucide-react'
import ExportConfigDialog, { ExportConfig } from './export-config-dialog'
import { buildPrioritizedTeamFields, DEFAULT_TEAM_FIELDS, getTeamFieldValue, TeamDisplayField } from './team-display-fields'

interface Registration {
  id: string
  team_data: Record<string, unknown>
  submitted_at: string
}

interface ReviewListTabProps {
  eventId: string
  onReviewComplete?: () => void
}

export default function ReviewListTab({ eventId }: ReviewListTabProps) {
  const router = useRouter()
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [teamFields, setTeamFields] = useState<TeamDisplayField[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showExportDialog, setShowExportDialog] = useState(false)

  const fetchRegistrationSettings = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/registration-settings`)
      const result = await response.json()

      if (result.success && result.data) {
        const settings = Array.isArray(result.data)
          ? (result.data.find((item: any) => item?.team_requirements) || result.data[0])
          : result.data
        const teamRequirements = settings?.team_requirements
        if (!teamRequirements) {
          setTeamFields(DEFAULT_TEAM_FIELDS)
          return
        }
        const fields: TeamDisplayField[] = teamRequirements.allFields || [
          ...(teamRequirements.commonFields || []),
          ...(teamRequirements.customFields || []),
        ]
        setTeamFields(fields.length > 0 ? fields : DEFAULT_TEAM_FIELDS)
      } else {
        setTeamFields(DEFAULT_TEAM_FIELDS)
      }
    } catch (error) {
      console.error('Error fetching registration settings:', error)
      setTeamFields(DEFAULT_TEAM_FIELDS)
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

  const displayFields = useMemo(() => {
    return buildPrioritizedTeamFields(teamFields)
  }, [teamFields])

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

        const contentDisposition = response.headers.get('content-disposition')
        const filenameMatch = contentDisposition?.match(/filename="(.+?)"/)
        const filename = filenameMatch
          ? decodeURIComponent(filenameMatch[1])
          : `待审核报名_${new Date().toISOString().split('T')[0]}.zip`

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
                <Clock className="h-5 w-5 mr-2" />
                审核列表
              </CardTitle>
              <CardDescription>等待审核的报名申请 ({registrations.length})</CardDescription>
            </div>
            <Button variant="outline" onClick={handleDownload} className="h-10 w-full sm:w-auto md:self-start">
              <Download className="h-4 w-4 mr-2" />
              下载 {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">暂无待审核的报名</div>
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
                        {displayFields.map((field) => {
                          const value = getTeamFieldValue(registration.team_data || {}, field)
                          return (
                            <div key={field.id}>
                              <p className="text-xs text-muted-foreground">{field.label}</p>
                              <p className="break-words text-sm font-medium text-foreground">{renderCellValue(value)}</p>
                            </div>
                          )
                        })}
                        <div>
                          <p className="text-xs text-muted-foreground">提交时间</p>
                          <p className="text-sm text-foreground">{formatDate(registration.submitted_at)}</p>
                        </div>
                      </div>
                      <Checkbox
                        checked={selectedIds.includes(registration.id)}
                        onCheckedChange={() => toggleSelection(registration.id)}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-4 h-10 w-full"
                      onClick={() => router.push(`/events/${eventId}/registrations/${registration.id}/review`)}
                    >
                      <Eye className="mr-1 h-4 w-4" />
                      审核
                    </Button>
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
                      {displayFields.map((field) => (
                        <TableHead key={field.id} className="w-[14%] px-1">
                          {field.label}
                        </TableHead>
                      ))}
                      <TableHead className="w-[20%] px-1">提交时间</TableHead>
                      <TableHead className="w-[18%] px-1">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registrations.map((registration) => {
                      return (
                        <TableRow key={registration.id} className="bg-background transition-colors hover:bg-accent/40">
                          <TableCell className="px-1 py-2">
                            <Checkbox
                              checked={selectedIds.includes(registration.id)}
                              onCheckedChange={() => toggleSelection(registration.id)}
                            />
                          </TableCell>
                          {displayFields.map((field) => {
                            const value = getTeamFieldValue(registration.team_data || {}, field)

                            return (
                              <TableCell key={field.id} className="px-1 py-2">
                                <div className="whitespace-pre-wrap break-words text-sm" style={{ maxWidth: '160px', wordBreak: 'break-all' }}>
                                  {renderCellValue(value)}
                                </div>
                              </TableCell>
                            )
                          })}
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
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
