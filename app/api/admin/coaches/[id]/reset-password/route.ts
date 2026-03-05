import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentAdminSession } from '@/lib/auth'

// 创建 Admin Client
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

// POST - 重置教练密码
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { password } = body

    // 验证密码
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: '密码长度至少为6位', success: false },
        { status: 400 }
      )
    }

    // 获取教练的 auth_id
    const { data: coach, error: fetchError } = await supabaseAdmin
      .from('coaches')
      .select('auth_id, phone')
      .eq('id', id)
      .single()

    if (fetchError || !coach) {
      return NextResponse.json(
        { error: '教练不存在', success: false },
        { status: 404 }
      )
    }

    if (!coach.auth_id) {
      return NextResponse.json(
        { error: '该教练没有关联的认证账号', success: false },
        { status: 400 }
      )
    }

    // 使用 Admin API 重置密码
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      coach.auth_id,
      { password }
    )

    if (authError) {
      console.error('Error resetting password:', authError)
      return NextResponse.json(
        { error: `重置密码失败: ${authError.message}`, success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '密码重置成功'
    })
  } catch (error) {
    console.error('POST /api/admin/coaches/[id]/reset-password error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
