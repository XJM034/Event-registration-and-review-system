import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

// GET - 列出所有管理员
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')

    // 查询管理员列表
    let query = supabaseAdmin
      .from('admin_users')
      .select('*', { count: 'exact' })

    // 搜索过滤
    if (search) {
      query = query.or(`phone.ilike.%${search}%,email.ilike.%${search}%`)
    }

    // 分页
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to).order('created_at', { ascending: false })

    const { data: admins, error, count } = await query

    if (error) {
      console.error('Error fetching admins:', error)
      return NextResponse.json(
        { success: false, error: '获取管理员列表失败' },
        {
          status: 500,
          headers: { 'Cache-Control': 'no-store, max-age=0' }
        }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          admins: admins || [],
          total: count || 0
        }
      },
      {
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    )
  } catch (error) {
    console.error('Error in GET /api/admin/admins:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    )
  }
}

// POST - 创建管理员账号
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, name, password, is_super = false } = body

    // 验证必填字段
    if (!phone || !password) {
      return NextResponse.json(
        { success: false, error: '手机号和密码为必填项' },
        { status: 400 }
      )
    }

    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { success: false, error: '手机号格式不正确' },
        { status: 400 }
      )
    }

    // 验证密码长度
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: '密码长度至少为6位' },
        { status: 400 }
      )
    }

    // 检查手机号是否已存在
    const email = `${phone}@system.local`
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const userExists = existingUsers.users.some(u => u.email === email)

    if (userExists) {
      return NextResponse.json(
        { success: false, error: '该手机号已被使用' },
        { status: 400 }
      )
    }

    // 使用 Admin API 创建用户
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        role: 'admin',
        phone: phone,
        name: name || '',
        is_super: is_super
      }
    })

    if (authError) {
      console.error('Error creating auth user:', authError)
      return NextResponse.json(
        { success: false, error: `创建认证账号失败: ${authError.message}` },
        { status: 500 }
      )
    }

    // 触发器会自动创建 admin_users 记录，但我们需要更新 is_super 和 name 字段
    const updateData: { is_super?: boolean; name?: string } = {}
    if (is_super) {
      updateData.is_super = true
    }
    if (name) {
      updateData.name = name
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('admin_users')
        .update(updateData)
        .eq('auth_id', authUser.user.id)

      if (updateError) {
        console.error('Error updating admin:', updateError)
        // 不返回错误，因为账号已创建成功
      }
    }

    // 历史兼容：若因旧触发器/脏数据导致同 auth_id 出现在 coaches，创建管理员后立即清理
    const { error: cleanupCoachError } = await supabaseAdmin
      .from('coaches')
      .delete()
      .eq('auth_id', authUser.user.id)

    if (cleanupCoachError) {
      console.error('Error cleaning up duplicate coach by admin auth_id:', cleanupCoachError)
    }

    return NextResponse.json({
      success: true,
      data: authUser.user
    })
  } catch (error) {
    console.error('Error in POST /api/admin/admins:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
