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

// PUT - 更新管理员权限
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { is_super, name } = body

    // 获取当前管理员信息
    const currentAdmin = await getCurrentAdminSession()
    if (!currentAdmin) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    // 如果修改权限，不能修改自己的权限
    if (is_super !== undefined && currentAdmin.user.id === id) {
      return NextResponse.json(
        { success: false, error: '不能修改自己的权限' },
        { status: 400 }
      )
    }

    // 如果要取消超级管理员权限，检查是否是最后一个超级管理员
    if (is_super === false) {
      const { data: superAdmins, error: countError } = await supabaseAdmin
        .from('admin_users')
        .select('id')
        .eq('is_super', true)

      if (countError) {
        console.error('Error counting super admins:', countError)
        return NextResponse.json(
          { success: false, error: '检查超级管理员数量失败' },
          { status: 500 }
        )
      }

      if (superAdmins && superAdmins.length <= 1) {
        return NextResponse.json(
          { success: false, error: '不能取消最后一个超级管理员的权限' },
          { status: 400 }
        )
      }
    }

    // 构建更新数据
    const updateData: { is_super?: boolean; name?: string } = {}
    if (is_super !== undefined) {
      updateData.is_super = is_super
    }
    if (name !== undefined) {
      updateData.name = name
    }

    // 更新管理员信息
    const { error: updateError } = await supabaseAdmin
      .from('admin_users')
      .update(updateData)
      .eq('id', id)

    if (updateError) {
      console.error('Error updating admin:', updateError)
      console.error('Update data:', updateData)
      console.error('Admin ID:', id)
      return NextResponse.json(
        { success: false, error: `更新管理员信息失败: ${updateError.message}` },
        { status: 500 }
      )
    }

    // 同步更新 auth.users 的 user_metadata
    const { data: admin } = await supabaseAdmin
      .from('admin_users')
      .select('auth_id')
      .eq('id', id)
      .single()

    if (admin?.auth_id) {
      const metadataUpdate: { is_super?: boolean; name?: string } = {}
      if (is_super !== undefined) {
        metadataUpdate.is_super = is_super
      }
      if (name !== undefined) {
        metadataUpdate.name = name
      }

      await supabaseAdmin.auth.admin.updateUserById(admin.auth_id, {
        user_metadata: metadataUpdate
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in PUT /api/admin/admins/[id]:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// DELETE - 删除管理员
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 获取当前管理员信息
    const currentAdmin = await getCurrentAdminSession()
    if (!currentAdmin) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    // 不能删除自己
    if (currentAdmin.user.id === id) {
      return NextResponse.json(
        { success: false, error: '不能删除自己的账号' },
        { status: 400 }
      )
    }

    // 获取管理员信息
    const { data: admin, error: fetchError } = await supabaseAdmin
      .from('admin_users')
      .select('auth_id, is_super')
      .eq('id', id)
      .single()

    if (fetchError || !admin) {
      return NextResponse.json(
        { success: false, error: '管理员不存在' },
        { status: 404 }
      )
    }

    // 检查是否是最后一个超级管理员
    if (admin.is_super) {
      const { data: superAdmins, error: countError } = await supabaseAdmin
        .from('admin_users')
        .select('id')
        .eq('is_super', true)

      if (countError) {
        console.error('Error counting super admins:', countError)
        return NextResponse.json(
          { success: false, error: '检查超级管理员数量失败' },
          { status: 500 }
        )
      }

      if (superAdmins && superAdmins.length <= 1) {
        return NextResponse.json(
          { success: false, error: '不能删除最后一个超级管理员' },
          { status: 400 }
        )
      }
    }

    // 检查是否有审核记录
    const { data: reviews, error: reviewError } = await supabaseAdmin
      .from('registrations')
      .select('id')
      .eq('reviewer_id', id)
      .limit(1)

    if (reviewError) {
      console.error('Error checking reviews:', reviewError)
    }

    if (reviews && reviews.length > 0) {
      return NextResponse.json(
        { success: false, error: '该管理员有审核记录，无法删除' },
        { status: 400 }
      )
    }

    // 删除 auth 用户
    if (admin.auth_id) {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(admin.auth_id)
      if (authDeleteError) {
        console.error('Error deleting auth user:', authDeleteError)
        // 继续尝试删除 admin_users 记录
      }
    }

    // 删除 admin_users 记录
    const { error: deleteError } = await supabaseAdmin
      .from('admin_users')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting admin:', deleteError)
      return NextResponse.json(
        { success: false, error: `删除管理员失败: ${deleteError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/admin/admins/[id]:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
