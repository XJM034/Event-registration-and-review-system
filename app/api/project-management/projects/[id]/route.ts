import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'

type RouteParams = {
  params: Promise<{ id: string }>
}

// 更新项目
export async function PUT(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()

    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, project_type_id, display_order, is_enabled } = body

    if (!name || !project_type_id) {
      return NextResponse.json(
        { error: '名称和项目类型不能为空', success: false },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServer()

    const { data, error } = await supabase
      .from('projects')
      .update({
        name,
        project_type_id,
        display_order,
        is_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Update project error:', error)
      return NextResponse.json(
        { error: '更新项目失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Update project API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 删除项目
export async function DELETE(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()

    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 403 }
      )
    }

    const supabase = await createSupabaseServer()

    // 检查是否有关联的组别
    const { data: divisions, error: divisionsError } = await supabase
      .from('divisions')
      .select('id')
      .eq('project_id', id)

    if (divisionsError) {
      return NextResponse.json(
        { error: '检查关联数据失败', success: false },
        { status: 500 }
      )
    }

    if (divisions && divisions.length > 0) {
      return NextResponse.json(
        {
          error: `无法删除：该项目下还有 ${divisions.length} 个组别，请先删除这些组别`,
          success: false
        },
        { status: 400 }
      )
    }

    // 执行删除
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Delete project error:', error)
      return NextResponse.json(
        { error: '删除项目失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '删除成功',
    })
  } catch (error) {
    console.error('Delete project API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 部分更新
export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()

    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 403 }
      )
    }

    const body = await request.json()
    const supabase = await createSupabaseServer()

    const { data, error } = await supabase
      .from('projects')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Patch project error:', error)
      return NextResponse.json(
        { error: '更新项目失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Patch project API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
