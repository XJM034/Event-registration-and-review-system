'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import {
  User,
  Mail,
  Phone,
  Building,
  Lock,
  Shield,
  Bell,
  Eye,
  EyeOff,
  LogOut,
  Trash2,
  Save,
  AlertCircle
} from 'lucide-react'

export default function AccountSettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [coach, setCoach] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 个人信息表单
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    organization: ''
  })
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // 密码修改
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

  // 通知设置
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    registrationUpdates: true,
    eventUpdates: true,
    systemNotices: true
  })

  // 账号注销
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    try {
      const supabase = createClient()

      // 获取当前用户
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

      if (authError || !authUser) {
        router.push('/auth/login')
        return
      }

      setUser(authUser)

      // 获取教练信息
      const { data: coachData } = await supabase
        .from('coaches')
        .select('*')
        .eq('auth_id', authUser.id)
        .single()

      if (coachData) {
        setCoach(coachData)
        setProfileForm({
          name: coachData.name || '',
          phone: coachData.phone || '',
          organization: coachData.organization || ''
        })
      }
    } catch (error) {
      console.error('加载用户数据失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleProfileUpdate = async () => {
    setIsSavingProfile(true)
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('coaches')
        .update({
          name: profileForm.name,
          phone: profileForm.phone,
          organization: profileForm.organization,
          updated_at: new Date().toISOString()
        })
        .eq('id', coach.id)

      if (error) {
        alert('更新失败: ' + error.message)
      } else {
        alert('个人信息更新成功')
        setCoach({ ...coach, ...profileForm })
      }
    } catch (error) {
      console.error('更新个人信息失败:', error)
      alert('更新失败')
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handlePasswordUpdate = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('新密码和确认密码不一致')
      return
    }

    if (passwordForm.newPassword.length < 6) {
      alert('新密码长度不能少于6位')
      return
    }

    setIsUpdatingPassword(true)

    try {
      const supabase = createClient()

      // 更新密码
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword
      })

      if (error) {
        alert('密码更新失败: ' + error.message)
      } else {
        alert('密码更新成功')
        setIsPasswordDialogOpen(false)
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      }
    } catch (error) {
      console.error('更新密码失败:', error)
      alert('更新密码失败')
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const handleDeleteAccount = async () => {
    // 实际应该调用删除账号的API
    alert('账号注销功能暂未开放，请联系管理员')
    setIsDeleteDialogOpen(false)
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">加载中...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">账号设置</h1>
        <p className="text-muted-foreground">管理您的账号信息和偏好设置</p>
      </div>

      {/* 个人信息 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            个人信息
          </CardTitle>
          <CardDescription>更新您的基本信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">姓名</Label>
              <Input
                id="name"
                value={profileForm.name}
                onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="请输入您的姓名"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">邮箱</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="email"
                  value={user?.email || ''}
                  disabled
                  className="flex-1"
                />
                <Badge variant="secondary">已验证</Badge>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">手机号</Label>
              <Input
                id="phone"
                value={profileForm.phone}
                onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="请输入手机号"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="organization">单位/学校</Label>
              <Input
                id="organization"
                value={profileForm.organization}
                onChange={(e) => setProfileForm(prev => ({ ...prev, organization: e.target.value }))}
                placeholder="请输入所在单位或学校"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleProfileUpdate} disabled={isSavingProfile}>
              <Save className="h-4 w-4 mr-2" />
              {isSavingProfile ? '保存中...' : '保存更改'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 安全设置 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            安全设置
          </CardTitle>
          <CardDescription>管理您的账号安全</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">修改密码</p>
                <p className="text-sm text-muted-foreground">定期更改密码以保护账号安全</p>
              </div>
            </div>
            <Button onClick={() => setIsPasswordDialogOpen(true)}>修改</Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">邮箱地址</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <Badge variant="secondary">已验证</Badge>
          </div>
        </CardContent>
      </Card>

      {/* 通知设置 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            通知设置
          </CardTitle>
          <CardDescription>选择您想要接收的通知类型</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>邮件通知</Label>
              <p className="text-sm text-muted-foreground">通过邮件接收重要通知</p>
            </div>
            <Switch
              checked={notificationSettings.emailNotifications}
              onCheckedChange={(checked) =>
                setNotificationSettings(prev => ({ ...prev, emailNotifications: checked }))
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>报名状态更新</Label>
              <p className="text-sm text-muted-foreground">报名审核结果通知</p>
            </div>
            <Switch
              checked={notificationSettings.registrationUpdates}
              onCheckedChange={(checked) =>
                setNotificationSettings(prev => ({ ...prev, registrationUpdates: checked }))
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>赛事信息更新</Label>
              <p className="text-sm text-muted-foreground">赛事时间、地点变更通知</p>
            </div>
            <Switch
              checked={notificationSettings.eventUpdates}
              onCheckedChange={(checked) =>
                setNotificationSettings(prev => ({ ...prev, eventUpdates: checked }))
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>系统公告</Label>
              <p className="text-sm text-muted-foreground">系统维护和更新通知</p>
            </div>
            <Switch
              checked={notificationSettings.systemNotices}
              onCheckedChange={(checked) =>
                setNotificationSettings(prev => ({ ...prev, systemNotices: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* 其他操作 */}
      <Card>
        <CardHeader>
          <CardTitle>其他操作</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" className="w-full justify-start" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            退出登录
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start text-red-600 hover:text-red-700"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            注销账号
          </Button>
        </CardContent>
      </Card>

      {/* 修改密码对话框 */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>
              请输入新密码，密码长度至少6位
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="new-password">新密码</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  placeholder="请输入新密码"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm-password">确认密码</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="请再次输入新密码"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handlePasswordUpdate} disabled={isUpdatingPassword}>
              {isUpdatingPassword ? '更新中...' : '确认修改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 注销账号确认对话框 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认注销账号</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2">
                <p>注销账号后，您的所有数据将被永久删除，包括：</p>
                <ul className="list-disc list-inside text-sm">
                  <li>个人信息和资料</li>
                  <li>所有报名记录</li>
                  <li>队伍和队员信息</li>
                </ul>
                <p className="font-semibold text-red-600">此操作不可恢复，请谨慎操作！</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              className="bg-red-600 hover:bg-red-700"
            >
              确认注销
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}