import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentAdminSession } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// POST - 重置管理员密码
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { password } = body

    // 获取当前管理员信息
    const currentAdmin = await getCurrentAdminSession()
    if (!currentAdmin) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    // 验证密码
    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: '密码长度至少为6位' },
        { status: 400 }
      )
    }

    // 获取管理员的 auth_id
    const { data: admin, error: fetchError } = await supabaseAdmin
      .from('admin_users')
      .select('auth_id')
      .eq('id', id)
      .single()

    if (fetchError || !admin) {
      return NextResponse.json(
        { success: false, error: '管理员不存在' },
        { status: 404 }
      )
    }

    if (!admin.auth_id) {
      return NextResponse.json(
        { success: false, error: '该管理员没有关联的认证账号' },
        { status: 400 }
      )
    }

    // 使用 Admin API 重置密码
    const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(
      admin.auth_id,
      { password }
    )

    if (resetError) {
      console.error('Error resetting password:', resetError)
      return NextResponse.json(
        { success: false, error: `重置密码失败: ${resetError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in POST /api/admin/admins/[id]/reset-password:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
