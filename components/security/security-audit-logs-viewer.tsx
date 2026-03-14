'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Eye, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getCurrentTabAdminSessionToken } from '@/lib/admin-session-client'
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
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_ACTOR_TYPE_OPTIONS,
  AUDIT_RESULT_OPTIONS,
  AUDIT_SCOPE_OPTIONS,
  areSecurityAuditLogFiltersEqual,
  buildSecurityAuditLogViewerSearchParams,
  DEFAULT_SECURITY_AUDIT_LOG_PAGE,
  formatAuditTechnicalMetadata,
  getAuditActionLabel,
  getAuditActorLabel,
  getAuditObjectLabel,
  getAuditResultLabel,
  getAuditSummary,
  parseSecurityAuditLogViewerSearchParams,
  SECURITY_AUDIT_LOG_PAGE_SIZE_OPTIONS,
  type SecurityAuditLogQueryFilters,
  type SecurityAuditLogRecord,
} from '@/lib/security-audit-log-view'

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

function getResultBadgeClass(result: string | null) {
  if (result === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
  }

  if (result === 'failed') {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
  }

  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
}

async function syncAdminSession() {
  const tabToken = getCurrentTabAdminSessionToken()
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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()
  const initialState = useMemo(
    () => parseSecurityAuditLogViewerSearchParams(searchParams),
    [searchParams],
  )
  const [filters, setFilters] = useState<SecurityAuditLogQueryFilters>(initialState.filters)
  const [query, setQuery] = useState<SecurityAuditLogQueryFilters>(initialState.filters)
  const [page, setPage] = useState(initialState.page)
  const [pageSize, setPageSize] = useState(initialState.pageSize)
  const [logs, setLogs] = useState<SecurityAuditLogRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedLog, setSelectedLog] = useState<SecurityAuditLogRecord | null>(null)

  useEffect(() => {
    const nextState = parseSecurityAuditLogViewerSearchParams(searchParams)

    setFilters((current) => (
      areSecurityAuditLogFiltersEqual(current, nextState.filters) ? current : nextState.filters
    ))
    setQuery((current) => (
      areSecurityAuditLogFiltersEqual(current, nextState.filters) ? current : nextState.filters
    ))
    setPage((current) => (current === nextState.page ? current : nextState.page))
    setPageSize((current) => (current === nextState.pageSize ? current : nextState.pageSize))
  }, [searchParams, searchParamsString])

  useEffect(() => {
    const nextSearchParams = buildSecurityAuditLogViewerSearchParams({
      filters: query,
      page,
      pageSize,
    })
    const nextSearchString = nextSearchParams.toString()
    if (nextSearchString === searchParamsString) {
      return
    }

    router.replace(
      nextSearchString ? `${pathname}?${nextSearchString}` : pathname,
      { scroll: false },
    )
  }, [page, pageSize, pathname, query, router, searchParamsString])

  useEffect(() => {
    let cancelled = false

    async function loadLogs() {
      setLoading(true)
      setError('')

      try {
        await syncAdminSession()
        const requestSearchParams = buildSecurityAuditLogViewerSearchParams({
          filters: query,
          page,
          pageSize,
        })

        const response = await fetch(`/api/admin/security-audit-logs?${requestSearchParams.toString()}`, {
          cache: 'no-store',
          credentials: 'include',
        })

        const result = await response.json()

        if (!response.ok || !result?.success) {
          throw new Error(result?.error || '获取关键操作轨迹失败')
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
        setError(fetchError instanceof Error ? fetchError.message : '获取关键操作轨迹失败')
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

  const pageStats = useMemo(() => {
    return logs.reduce(
      (stats, log) => {
        if (log.result === 'success') stats.success += 1
        else if (log.result === 'failed') stats.failed += 1
        else if (log.result === 'denied') stats.denied += 1
        return stats
      },
      { success: 0, failed: 0, denied: 0 },
    )
  }, [logs])

  const handleSearch = () => {
    setPage(DEFAULT_SECURITY_AUDIT_LOG_PAGE)
    setQuery(filters)
  }

  const handleRefresh = () => {
    setQuery({ ...query })
  }

  const applyQuickScope = (scope: string) => {
    const nextFilters: SecurityAuditLogQueryFilters = {
      ...filters,
      scope,
      action: 'all',
    }
    setFilters(nextFilters)
    setPage(1)
    setQuery(nextFilters)
  }

  const applyLoginTrailFilter = () => {
    const nextFilters: SecurityAuditLogQueryFilters = {
      ...filters,
      scope: 'all',
      action: 'account_login',
    }
    setFilters(nextFilters)
    setPage(DEFAULT_SECURITY_AUDIT_LOG_PAGE)
    setQuery(nextFilters)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-background p-4">
        <div className="mb-3 text-sm font-medium text-foreground">常用关键范围</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => applyQuickScope('critical')}>
            全部关键操作
          </Button>
          <Button variant="outline" size="sm" onClick={() => applyQuickScope('review_flow')}>
            审批与报名
          </Button>
          <Button variant="outline" size="sm" onClick={() => applyQuickScope('account_changes')}>
            账号与权限
          </Button>
          <Button variant="outline" size="sm" onClick={() => applyQuickScope('export_and_files')}>
            导出与资料
          </Button>
          <Button variant="outline" size="sm" onClick={applyLoginTrailFilter}>
            账号登录
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Select
          value={filters.scope}
          onValueChange={(value) => setFilters((current) => ({ ...current, scope: value, action: 'all' }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="关键范围" />
          </SelectTrigger>
          <SelectContent>
            {AUDIT_SCOPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.action}
          onValueChange={(value) => setFilters((current) => ({ ...current, action: value }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="关键动作" />
          </SelectTrigger>
          <SelectContent>
            {AUDIT_ACTION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.actorType}
          onValueChange={(value) => setFilters((current) => ({ ...current, actorType: value }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="操作人类型" />
          </SelectTrigger>
          <SelectContent>
            {AUDIT_ACTOR_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.result}
          onValueChange={(value) => setFilters((current) => ({ ...current, result: value }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="结果" />
          </SelectTrigger>
          <SelectContent>
            {AUDIT_RESULT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
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
          <Badge variant="outline">关键记录 {total}</Badge>
          <Badge variant="outline">当前页 {page}/{pageCount}</Badge>
          <Badge variant="outline">本页成功 {pageStats.success}</Badge>
          <Badge variant="outline">需关注 {pageStats.failed + pageStats.denied}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(value) => {
            setPage(DEFAULT_SECURITY_AUDIT_LOG_PAGE)
            setPageSize(Number.parseInt(value, 10))
          }}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="每页条数" />
            </SelectTrigger>
            <SelectContent>
              {SECURITY_AUDIT_LOG_PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / 页
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <TableHead>谁在操作</TableHead>
            <TableHead>关键操作</TableHead>
            <TableHead>影响对象</TableHead>
            <TableHead>结果</TableHead>
            <TableHead>操作轨迹</TableHead>
            <TableHead className="text-right">详情</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                正在加载关键操作轨迹...
              </TableCell>
            </TableRow>
          ) : logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                当前筛选条件下没有关键操作记录
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="max-w-[160px] whitespace-normal text-xs">
                  {formatDateTime(log.created_at)}
                </TableCell>
                <TableCell className="max-w-[140px] whitespace-normal text-sm">
                  {getAuditActorLabel(log)}
                </TableCell>
                <TableCell className="max-w-[180px] whitespace-normal font-medium">
                  {getAuditActionLabel(log.action)}
                </TableCell>
                <TableCell className="max-w-[220px] whitespace-normal text-sm">
                  {getAuditObjectLabel(log)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getResultBadgeClass(log.result)}>
                    {getAuditResultLabel(log.result)}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[420px] whitespace-normal text-sm text-muted-foreground">
                  {getAuditSummary(log)}
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
            <DialogTitle>{selectedLog ? `${getAuditActionLabel(selectedLog.action)} · 轨迹详情` : '日志详情'}</DialogTitle>
            <DialogDescription>
              先看“操作轨迹”“影响对象”和“结果”，只有排查技术问题时才需要展开最下面的技术详情。
            </DialogDescription>
          </DialogHeader>
          {selectedLog ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="mb-2 text-sm font-medium text-foreground">操作轨迹</div>
                <div className="text-sm text-muted-foreground">{getAuditSummary(selectedLog)}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">发生时间</div>
                  <div>{formatDateTime(selectedLog.created_at)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">结果</div>
                  <div>{getAuditResultLabel(selectedLog.result)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">操作人</div>
                  <div>{getAuditActorLabel(selectedLog)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">影响对象</div>
                  <div>{getAuditObjectLabel(selectedLog)}</div>
                </div>
              </div>

              <details className="rounded-lg border p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  查看技术详情（仅排查异常时需要）
                </summary>
                <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
                  {formatAuditTechnicalMetadata(selectedLog)}
                </pre>
              </details>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
