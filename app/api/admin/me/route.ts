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

// GET - 获取当前管理员信息
export async function GET() {
  try {
    const currentAdmin = await getCurrentAdminSession()
    if (!currentAdmin) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    const { data: admin, error } = await supabaseAdmin
      .from('admin_users')
      .select('id, phone, name, email, is_super, auth_id')
      .eq('id', currentAdmin.user.id)
      .single()

    if (error || !admin) {
      return NextResponse.json(
        { success: false, error: '管理员不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: admin })
  } catch (error) {
    console.error('Error in GET /api/admin/me:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// PUT - 修改当前管理员密码
export async function PUT(request: NextRequest) {
  try {
    const currentAdmin = await getCurrentAdminSession()
    if (!currentAdmin) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const password = typeof body?.password === 'string' ? body.password.trim() : ''

    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: '密码长度至少为6位' },
        { status: 400 }
      )
    }

    const { data: admin, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .select('auth_id')
      .eq('id', currentAdmin.user.id)
      .single()

    if (adminError || !admin) {
      return NextResponse.json(
        { success: false, error: '管理员不存在' },
        { status: 404 }
      )
    }

    if (!admin.auth_id) {
      return NextResponse.json(
        { success: false, error: '当前管理员未关联认证账号' },
        { status: 400 }
      )
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      admin.auth_id,
      { password }
    )

    if (updateError) {
      console.error('Error in PUT /api/admin/me (update password):', updateError)
      return NextResponse.json(
        { success: false, error: `修改密码失败: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in PUT /api/admin/me:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
