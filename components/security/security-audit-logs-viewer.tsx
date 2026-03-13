'use client'

import { useEffect, useState } from 'react'
import { Eye, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type AuditLog = {
  id: string
  created_at: string
  actor_type: string | null
  actor_id: string | null
  actor_role: string | null
  action: string | null
  resource_type: string | null
  resource_id: string | null
  event_id: string | null
  registration_id: string | null
  target_user_id: string | null
  result: string | null
  reason: string | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  request_id: string | null
}

type QueryFilters = {
  action: string
  actorType: string
  result: string
  from: string
  to: string
}

const defaultFilters: QueryFilters = {
  action: '',
  actorType: 'all',
  result: 'all',
  from: '',
  to: '',
}

function formatDateTime(value: string | null) {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function formatActor(log: AuditLog) {
  if (log.actor_role) {
    return `${log.actor_role}${log.actor_id ? ` · ${log.actor_id}` : ''}`
  }
  if (log.actor_type) {
    return `${log.actor_type}${log.actor_id ? ` · ${log.actor_id}` : ''}`
  }
  return '-'
}

function formatResource(log: AuditLog) {
  const parts = [
    log.resource_type,
    log.resource_id,
    log.event_id ? `event:${log.event_id}` : '',
    log.registration_id ? `registration:${log.registration_id}` : '',
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' / ') : '-'
}

function formatMetadata(metadata: AuditLog['metadata']) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return '无额外元数据'
  }

  return JSON.stringify(metadata, null, 2)
}

function getResultBadgeClass(result: string | null) {
  if (result === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
  }

  if (result === 'failure') {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
  }

  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
}

async function syncAdminSession() {
  const tabToken = sessionStorage.getItem('tab_admin_session_token')
  if (!tabToken) {
    return
  }

  await fetch('/api/auth/admin-session', {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'x-admin-session-token': tabToken,
    },
  })
}

export default function SecurityAuditLogsViewer() {
  const [filters, setFilters] = useState<QueryFilters>(defaultFilters)
  const [query, setQuery] = useState<QueryFilters>(defaultFilters)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadLogs() {
      setLoading(true)
      setError('')

      try {
        await syncAdminSession()

        const searchParams = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        })

        if (query.action.trim()) {
          searchParams.set('action', query.action.trim())
        }
        if (query.actorType !== 'all') {
          searchParams.set('actorType', query.actorType)
        }
        if (query.result !== 'all') {
          searchParams.set('result', query.result)
        }
        if (query.from) {
          searchParams.set('from', query.from)
        }
        if (query.to) {
          searchParams.set('to', query.to)
        }

        const response = await fetch(`/api/admin/security-audit-logs?${searchParams.toString()}`, {
          cache: 'no-store',
          credentials: 'include',
        })

        const result = await response.json()

        if (!response.ok || !result?.success) {
          throw new Error(result?.error || '获取审计日志失败')
        }

        if (cancelled) {
          return
        }

        setLogs(Array.isArray(result.data?.logs) ? result.data.logs : [])
        setTotal(typeof result.data?.total === 'number' ? result.data.total : 0)
      } catch (fetchError) {
        if (cancelled) {
          return
        }
        setLogs([])
        setTotal(0)
        setError(fetchError instanceof Error ? fetchError.message : '获取审计日志失败')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadLogs()

    return () => {
      cancelled = true
    }
  }, [page, pageSize, query])

  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const handleSearch = () => {
    setPage(1)
    setQuery(filters)
  }

  const handleReset = () => {
    setFilters(defaultFilters)
    setPage(1)
    setPageSize(20)
    setQuery(defaultFilters)
  }

  const handleRefresh = () => {
    setQuery({ ...query })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Input
          value={filters.action}
          onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
          placeholder="按 action 精确筛选"
        />
        <Select
          value={filters.actorType}
          onValueChange={(value) => setFilters((current) => ({ ...current, actorType: value }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="操作人类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部操作人</SelectItem>
            <SelectItem value="admin">管理员</SelectItem>
            <SelectItem value="coach">教练</SelectItem>
            <SelectItem value="public">公开访问</SelectItem>
            <SelectItem value="system">系统</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.result}
          onValueChange={(value) => setFilters((current) => ({ ...current, result: value }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="操作结果" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部结果</SelectItem>
            <SelectItem value="success">成功</SelectItem>
            <SelectItem value="failure">失败</SelectItem>
            <SelectItem value="denied">拒绝</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filters.from}
          onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
        />
        <Input
          type="date"
          value={filters.to}
          onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">总记录 {total}</Badge>
          <Badge variant="outline">当前页 {page}/{pageCount}</Badge>
          <Badge variant="outline">每页 {pageSize}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(value) => {
            setPage(1)
            setPageSize(Number.parseInt(value, 10))
          }}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="每页条数" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20 / 页</SelectItem>
              <SelectItem value="50">50 / 页</SelectItem>
              <SelectItem value="100">100 / 页</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleReset} disabled={loading}>
            重置筛选
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <Button onClick={handleSearch} disabled={loading}>
            查询
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>操作人</TableHead>
            <TableHead>动作</TableHead>
            <TableHead>资源</TableHead>
            <TableHead>结果</TableHead>
            <TableHead>请求 ID</TableHead>
            <TableHead className="text-right">详情</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                正在加载审计日志...
              </TableCell>
            </TableRow>
          ) : logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                当前筛选条件下没有审计日志
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="max-w-[160px] whitespace-normal text-xs">
                  {formatDateTime(log.created_at)}
                </TableCell>
                <TableCell className="max-w-[180px] whitespace-normal text-xs">
                  {formatActor(log)}
                </TableCell>
                <TableCell className="max-w-[220px] whitespace-normal font-medium">
                  {log.action || '-'}
                </TableCell>
                <TableCell className="max-w-[240px] whitespace-normal text-xs">
                  {formatResource(log)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getResultBadgeClass(log.result)}>
                    {log.result || 'unknown'}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[180px] whitespace-normal text-xs text-muted-foreground">
                  {log.request_id || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setSelectedLog(log)}>
                    <Eye className="mr-2 h-4 w-4" />
                    查看
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={loading || page <= 1}
        >
          上一页
        </Button>
        <Button
          variant="outline"
          onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          disabled={loading || page >= pageCount}
        >
          下一页
        </Button>
      </div>

      <Dialog open={selectedLog !== null} onOpenChange={(open) => {
        if (!open) {
          setSelectedLog(null)
        }
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>审计日志详情</DialogTitle>
            <DialogDescription>
              用于排查单次安全相关操作的上下文信息，仅超级管理员可见。
            </DialogDescription>
          </DialogHeader>
          {selectedLog ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">时间</div>
                  <div>{formatDateTime(selectedLog.created_at)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">结果</div>
                  <div>{selectedLog.result || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">操作人</div>
                  <div>{formatActor(selectedLog)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">动作</div>
                  <div>{selectedLog.action || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">资源</div>
                  <div>{formatResource(selectedLog)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">请求 ID</div>
                  <div className="break-all">{selectedLog.request_id || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">IP</div>
                  <div className="break-all">{selectedLog.ip_address || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">目标用户</div>
                  <div className="break-all">{selectedLog.target_user_id || '-'}</div>
                </div>
              </div>

              <div>
                <div className="mb-1 text-muted-foreground">原因</div>
                <div className="rounded-md border bg-muted/20 px-3 py-2 whitespace-pre-wrap break-words">
                  {selectedLog.reason || '无'}
                </div>
              </div>

              <div>
                <div className="mb-1 text-muted-foreground">User-Agent</div>
                <div className="rounded-md border bg-muted/20 px-3 py-2 whitespace-pre-wrap break-all">
                  {selectedLog.user_agent || '-'}
                </div>
              </div>

              <div>
                <div className="mb-1 text-muted-foreground">元数据</div>
                <pre className="max-h-[320px] overflow-auto rounded-md border bg-muted/20 px-3 py-3 text-xs whitespace-pre-wrap break-all">
                  {formatMetadata(selectedLog.metadata)}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
