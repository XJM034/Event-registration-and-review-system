import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'

type RouteParams = {
  params: Promise<{ id: string }>
}

// 更新组别
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
    const { name, project_id, description, display_order, is_enabled, rules } = body

    if (!name || !project_id) {
      return NextResponse.json(
        { error: '名称和项目不能为空', success: false },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServer()

    const { data, error } = await supabase
      .from('divisions')
      .update({
        name,
        project_id,
        description,
        display_order,
        is_enabled,
        rules: rules || {},
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Update division error:', error)
      return NextResponse.json(
        { error: '更新组别失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Update division API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 删除组别
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

    // 检查是否有关联的赛事
    const { data: eventDivisions, error: eventDivisionsError } = await supabase
      .from('event_divisions')
      .select('id')
      .eq('division_id', id)

    if (eventDivisionsError) {
      return NextResponse.json(
        { error: '检查关联数据失败', success: false },
        { status: 500 }
      )
    }

    if (eventDivisions && eventDivisions.length > 0) {
      return NextResponse.json(
        {
          error: `无法删除：该组别已被 ${eventDivisions.length} 个赛事使用`,
          success: false
        },
        { status: 400 }
      )
    }

    // 执行删除
    const { error } = await supabase
      .from('divisions')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Delete division error:', error)
      return NextResponse.json(
        { error: '删除组别失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '删除成功',
    })
  } catch (error) {
    console.error('Delete division API error:', error)
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

    if (!session || !session.user.is_super) {
      return NextResponse.json(
        { error: '需要超级管理员权限', success: false },
        { status: 403 }
      )
    }

    const body = await request.json()
    const supabase = await createSupabaseServer()

    const { data, error } = await supabase
      .from('divisions')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Patch division error:', error)
      return NextResponse.json(
        { error: '更新组别失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Patch division API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
