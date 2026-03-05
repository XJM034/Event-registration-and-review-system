'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Search, Edit, Trash2, Key, Loader2 } from 'lucide-react'
import CreateCoachDialog from './create-coach-dialog'
import EditCoachDialog from './edit-coach-dialog'
import ResetPasswordDialog from './reset-password-dialog'
import ImportCoachesDialog from './import-coaches-dialog'

interface Coach {
  id: string
  phone: string
  name: string | null
  school: string | null
  organization: string | null
  is_active: boolean
  created_at: string
  last_login_at: string | null
  notes: string | null
  created_by_admin: {
    phone: string
    email: string
  } | null
}

interface CoachesTabProps {
  enabled?: boolean
}

export default function CoachesTab({ enabled = true }: CoachesTabProps) {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [schoolFilter, setSchoolFilter] = useState('all')
  const [schoolOptions, setSchoolOptions] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [batchUpdating, setBatchUpdating] = useState(false)

  // 加载教练列表
  const loadCoaches = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        search,
        school: schoolFilter === 'all' ? '' : schoolFilter,
        page: page.toString(),
        pageSize: pageSize.toString(),
        _ts: Date.now().toString()
      })

      const res = await fetch(`/api/admin/coaches?${params}`, {
        cache: 'no-store'
      })
      const data = await res.json()

      if (data.success) {
        const coachRows = Array.isArray(data.data.coaches) ? data.data.coaches : []
        const serverSchoolOptions = Array.isArray(data.data.schoolOptions) ? data.data.schoolOptions : []
        const fallbackSchoolOptions = Array.from(
          new Set(
            coachRows
              .map((coach: Coach) => coach.school?.trim())
              .filter((value: string | undefined): value is string => Boolean(value))
          )
        ).sort((a, b) => a.localeCompare(b, 'zh-CN'))

        setCoaches(coachRows)
        setTotal(data.data.total)
        setSchoolOptions(serverSchoolOptions.length > 0 ? serverSchoolOptions : fallbackSchoolOptions)
      } else {
        // 普通管理员或权限被收回时，接口会返回 403；此场景静默处理
        if (res.status === 403 || data.error === 'Forbidden') {
          setCoaches([])
          setTotal(0)
          return
        }
        console.error('Failed to load coaches:', data.error)
      }
    } catch (error) {
      console.error('Error loading coaches:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    loadCoaches()
  }, [enabled, search, schoolFilter, page, pageSize])

  // 切换账号状态
  const handleToggleActive = async (coach: Coach) => {
    try {
      const res = await fetch(`/api/admin/coaches/${coach.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !coach.is_active })
      })

      const data = await res.json()
      if (data.success) {
        loadCoaches()
      } else {
        alert(`操作失败: ${data.error}`)
      }
    } catch (error) {
      console.error('Error toggling coach status:', error)
      alert('操作失败，请重试')
    }
  }

  // 删除教练
  const handleDelete = async () => {
    if (!selectedCoach) return
    const deletingCoachId = selectedCoach.id

    try {
      setDeleteLoading(true)
      const res = await fetch(`/api/admin/coaches/${deletingCoachId}`, {
        method: 'DELETE'
      })

      const data = await res.json()
      if (data.success) {
        // 先本地移除，避免出现“已删除但列表还在”的瞬时状态
        setCoaches(prev => prev.filter(coach => coach.id !== deletingCoachId))
        setTotal(prev => Math.max(0, prev - 1))

        // 如果删掉的是当前页最后一条，回到上一页并触发自动刷新
        if (coaches.length === 1 && page > 1) {
          setPage(prev => prev - 1)
        } else {
          await loadCoaches()
        }
        // 然后关闭对话框和清空状态
        setShowDeleteDialog(false)
        setSelectedCoach(null)
        alert('教练账号已删除')
      } else {
        alert(`删除失败: ${data.error}`)
      }
    } catch (error) {
      console.error('Error deleting coach:', error)
      alert('删除失败，请重试')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleBatchUpdateActive = async (isActive: boolean) => {
    const actionLabel = isActive ? '启用' : '禁用'
    const hasFilter = Boolean(search.trim()) || schoolFilter !== 'all'
    const scopeLabel = hasFilter ? '当前筛选结果中的全部教练账号' : '全部教练账号'

    if (!window.confirm(`确认将${scopeLabel}${actionLabel}吗？`)) {
      return
    }

    try {
      setBatchUpdating(true)
      const res = await fetch('/api/admin/coaches/batch-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_active: isActive,
          search,
          school: schoolFilter === 'all' ? '' : schoolFilter,
        }),
      })
      const data = await res.json()

      if (!data.success) {
        alert(`批量${actionLabel}失败: ${data.error || '未知错误'}`)
        return
      }

      await loadCoaches()
      const updatedCount = data?.data?.updatedCount ?? 0
      const authUpdateFailedCount = data?.data?.authUpdateFailedCount ?? 0
      alert(
        authUpdateFailedCount > 0
          ? `已批量${actionLabel} ${updatedCount} 个账号，另有 ${authUpdateFailedCount} 个账号的登录禁用状态同步失败（不影响列表状态）。`
          : `已批量${actionLabel} ${updatedCount} 个账号。`
      )
    } catch (error) {
      console.error(`Batch ${actionLabel} coaches failed:`, error)
      alert(`批量${actionLabel}失败，请重试`)
    } finally {
      setBatchUpdating(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2 flex-1 max-w-3xl">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="搜索手机号、姓名、参赛单位..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="pl-10"
            />
          </div>
          <Select
            value={schoolFilter}
            onValueChange={(value) => {
              setSchoolFilter(value)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="筛选参赛单位" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部参赛单位</SelectItem>
              {schoolOptions.map((school) => (
                <SelectItem key={school} value={school}>
                  {school}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            批量导入
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            创建教练账号
          </Button>
        </div>
      </div>

      {/* 表格 */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>手机号</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>参赛单位</TableHead>
              <TableHead>
                <div className="flex items-center gap-2">
                  <span>状态</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={loading || batchUpdating}
                    onClick={() => handleBatchUpdateActive(true)}
                  >
                    {batchUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : '全部启用'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={loading || batchUpdating}
                    onClick={() => handleBatchUpdateActive(false)}
                  >
                    {batchUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : '全部禁用'}
                  </Button>
                </div>
              </TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : coaches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  暂无教练账号
                </TableCell>
              </TableRow>
            ) : (
              coaches.map((coach) => (
                <TableRow key={coach.id}>
                  <TableCell className="font-medium">{coach.phone}</TableCell>
                  <TableCell>{coach.name || '-'}</TableCell>
                  <TableCell>{coach.school || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={coach.is_active}
                        onCheckedChange={() => handleToggleActive(coach)}
                      />
                      <Badge variant={coach.is_active ? 'default' : 'secondary'}>
                        {coach.is_active ? '启用' : '禁用'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(coach.created_at).toLocaleDateString('zh-CN')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedCoach(coach)
                          setShowEditDialog(true)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedCoach(coach)
                          setShowResetPasswordDialog(true)
                        }}
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedCoach(coach)
                          setShowDeleteDialog(true)
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          共 {total} 条记录，第 {page} / {totalPages} 页
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(1)}
            disabled={page === 1}
          >
            首页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
          >
            下一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
          >
            末页
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      <CreateCoachDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={loadCoaches}
      />

      <ImportCoachesDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onSuccess={loadCoaches}
      />

      {selectedCoach && (
        <>
          <EditCoachDialog
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
            coach={selectedCoach}
            onSuccess={loadCoaches}
          />

          <ResetPasswordDialog
            open={showResetPasswordDialog}
            onOpenChange={setShowResetPasswordDialog}
            coach={selectedCoach}
          />

          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除</AlertDialogTitle>
                <AlertDialogDescription>
                  确定要删除教练 <strong>{selectedCoach.name || selectedCoach.phone}</strong> 吗？
                  <br />
                  此操作不可恢复，该教练将无法再登录系统。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteLoading}>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deleteLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  确认删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}
