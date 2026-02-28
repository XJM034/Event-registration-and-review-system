import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'

type RouteParams = {
  params: Promise<{ id: string }>
}

// 更新项目类型
export async function PUT(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()

    if (!session || !session.user.is_super) {
      return NextResponse.json(
        { error: '需要超级管理员权限', success: false },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, display_order, is_enabled } = body

    if (!name) {
      return NextResponse.json(
        { error: '名称不能为空', success: false },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServer()

    const { data, error } = await supabase
      .from('project_types')
      .update({
        name,
        display_order,
        is_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Update project type error:', error)
      return NextResponse.json(
        { error: '更新项目类型失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Update project type API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 删除项目类型
export async function DELETE(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()

    if (!session || !session.user.is_super) {
      return NextResponse.json(
        { error: '需要超级管理员权限', success: false },
        { status: 403 }
      )
    }

    const supabase = await createSupabaseServer()

    // 检查是否有关联的项目
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id')
      .eq('project_type_id', id)

    if (projectsError) {
      return NextResponse.json(
        { error: '检查关联数据失败', success: false },
        { status: 500 }
      )
    }

    if (projects && projects.length > 0) {
      return NextResponse.json(
        {
          error: `无法删除：该类型下还有 ${projects.length} 个项目，请先删除或移动这些项目`,
          success: false
        },
        { status: 400 }
      )
    }

    // 执行删除
    const { error } = await supabase
      .from('project_types')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Delete project type error:', error)
      return NextResponse.json(
        { error: '删除项目类型失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '删除成功',
    })
  } catch (error) {
    console.error('Delete project type API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 部分更新（启用/禁用、排序）
export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()

    if (!session || !session.user.is_super) {
      return NextResponse.json(
        { error: '需要超级管理员权限', success: false },
        { status: 403 }
      )
    }

    const body = await request.json()
    const supabase = await createSupabaseServer()

    const { data, error } = await supabase
      .from('project_types')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Patch project type error:', error)
      return NextResponse.json(
        { error: '更新项目类型失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Patch project type API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
