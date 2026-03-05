'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Plus, Search, Shield, ShieldOff, Key, Trash2, Loader2, Edit } from 'lucide-react'
import { CreateAdminDialog } from './create-admin-dialog'
import EditAdminDialog from './edit-admin-dialog'

interface Admin {
  id: string
  phone: string
  name: string | null
  email: string | null
  is_super: boolean
  created_at: string
  auth_id: string | null
}

interface AdminsTabProps {
  enabled?: boolean
}

export function AdminsTab({ enabled = true }: AdminsTabProps) {
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    loadAdmins()
  }, [enabled, page, pageSize, search])

  useEffect(() => {
    if (!enabled) return
    // 获取当前登录的管理员 ID
    const fetchCurrentAdmin = async () => {
      try {
        const res = await fetch('/api/admin/current')
        const data = await res.json()
        if (data.success) {
          setCurrentAdminId(data.data.id)
        }
      } catch (error) {
        console.error('Error fetching current admin:', error)
      }
    }
    fetchCurrentAdmin()
  }, [enabled])

  const loadAdmins = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        search: search,
        _ts: Date.now().toString()
      })

      const res = await fetch(`/api/admin/admins?${params}`, {
        cache: 'no-store'
      })
      const data = await res.json()

      if (data.success) {
        setAdmins(data.data.admins)
        setTotal(data.data.total)
      } else {
        // 权限不足时静默处理，避免在非超级管理员场景出现误导性报错
        if (res.status === 403 || data.error === 'Forbidden') {
          setAdmins([])
          setTotal(0)
          return
        }
        alert(data.error || '加载管理员列表失败')
      }
    } catch (error) {
      console.error('Error loading admins:', error)
      alert('加载管理员列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedAdmin) return
    const deletingAdminId = selectedAdmin.id

    try {
      setDeleteLoading(true)
      const res = await fetch(`/api/admin/admins/${deletingAdminId}`, {
        method: 'DELETE'
      })

      const data = await res.json()

      if (data.success) {
        // 先本地移除，避免首次删除后列表仍显示旧数据
        setAdmins(prev => prev.filter(admin => admin.id !== deletingAdminId))
        setTotal(prev => Math.max(0, prev - 1))

        // 如果删掉的是当前页最后一条，翻到上一页并触发自动刷新
        if (admins.length === 1 && page > 1) {
          setPage(prev => prev - 1)
        } else {
          await loadAdmins()
        }
        setShowDeleteDialog(false)
        setSelectedAdmin(null)
        alert('管理员账号已删除')
      } else {
        alert(data.error || '删除失败')
      }
    } catch (error) {
      console.error('Error deleting admin:', error)
      alert('删除失败，请重试')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAdmin) return

    if (password.length < 6) {
      alert('密码长度至少为6位')
      return
    }

    if (password !== confirmPassword) {
      alert('两次输入的密码不一致')
      return
    }

    try {
      setResetPasswordLoading(true)
      const res = await fetch(`/api/admin/admins/${selectedAdmin.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })

      const data = await res.json()

      if (data.success) {
        alert('密码重置成功')
        setPassword('')
        setConfirmPassword('')
        setShowResetPasswordDialog(false)
        setSelectedAdmin(null)
      } else {
        alert(`重置失败: ${data.error}`)
      }
    } catch (error) {
      console.error('Error resetting password:', error)
      alert('重置失败，请重试')
    } finally {
      setResetPasswordLoading(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  // 将当前登录的管理员排在第一位
  const sortedAdmins = [...admins].sort((a, b) => {
    if (a.id === currentAdminId) return -1
    if (b.id === currentAdminId) return 1
    return 0
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="搜索手机号或邮箱..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="pl-10"
            />
          </div>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          创建管理员
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>手机号</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>权限</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  加载中...
                </TableCell>
              </TableRow>
            ) : admins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  暂无管理员
                </TableCell>
              </TableRow>
            ) : (
              sortedAdmins.map((admin) => {
                const isCurrentAdmin = admin.id === currentAdminId
                return (
                  <TableRow
                    key={admin.id}
                    className={isCurrentAdmin ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}
                  >
                    <TableCell className="font-medium">
                      {admin.phone}
                      {isCurrentAdmin && (
                        <Badge variant="default" className="ml-2">
                          <Shield className="h-3 w-3 mr-1" />
                          当前账号
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{admin.name || '-'}</TableCell>
                  <TableCell>
                    {admin.is_super ? (
                      <Badge variant="default">
                        <Shield className="h-3 w-3 mr-1" />
                        超级管理员
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <ShieldOff className="h-3 w-3 mr-1" />
                        普通管理员
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(admin.created_at).toLocaleDateString('zh-CN')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedAdmin(admin)
                          setShowEditDialog(true)
                        }}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedAdmin(admin)
                          setPassword('')
                          setConfirmPassword('')
                          setShowResetPasswordDialog(true)
                        }}
                      >
                        <Key className="h-4 w-4 mr-1" />
                        重置密码
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setSelectedAdmin(admin)
                          setShowDeleteDialog(true)
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {total > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            共 {total} 个管理员
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => {
                setPageSize(parseInt(value))
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 条/页</SelectItem>
                <SelectItem value="20">20 条/页</SelectItem>
                <SelectItem value="50">50 条/页</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                上一页
              </Button>
              <span className="text-sm px-4">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                下一页
              </Button>
            </div>
          </div>
        </div>
      )}

      <CreateAdminDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={loadAdmins}
      />

      {selectedAdmin && (
        <EditAdminDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          admin={selectedAdmin}
          onSuccess={loadAdmins}
        />
      )}

      <Dialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>
              为管理员 <strong>{selectedAdmin?.phone}</strong> 重置登录密码
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">
                  新密码 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="至少6位"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">
                  确认密码 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="再次输入新密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  ⚠️ 重置后，管理员需要使用新密码登录
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPassword('')
                  setConfirmPassword('')
                  setShowResetPasswordDialog(false)
                  setSelectedAdmin(null)
                }}
                disabled={resetPasswordLoading}
              >
                取消
              </Button>
              <Button type="submit" disabled={resetPasswordLoading}>
                {resetPasswordLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                确认重置
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除管理员 <strong>{selectedAdmin?.phone}</strong> 吗？
              <br />
              此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteLoading ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
