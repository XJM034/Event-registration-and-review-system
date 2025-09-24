import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

// 获取单个赛事
export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()
    
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const supabase = await createSupabaseServer()
    
    const { data: event, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Fetch event error:', error)
      return NextResponse.json(
        { error: '赛事不存在', success: false },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: event,
    })
  } catch (error) {
    console.error('Event API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 更新赛事
export async function PUT(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()
    
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const body = await request.json()
    const supabase = await createSupabaseServer()

    const { data: event, error } = await supabase
      .from('events')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Update event error:', error)
      return NextResponse.json(
        { error: '更新赛事失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: event,
    })
  } catch (error) {
    console.error('Update event API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 部分更新赛事（如切换显示/隐藏）
export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()
    
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const body = await request.json()
    const supabase = await createSupabaseServer()

    const { data: event, error } = await supabase
      .from('events')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Update event error:', error)
      return NextResponse.json(
        { error: '更新赛事失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: event,
    })
  } catch (error) {
    console.error('Patch event API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 删除赛事
export async function DELETE(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()
    
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const supabase = await createSupabaseServer()

    // 删除赛事（会自动删除相关的报名设置和报名记录，因为设置了 CASCADE）
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Delete event error:', error)
      return NextResponse.json(
        { error: '删除赛事失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '赛事删除成功',
    })
  } catch (error) {
    console.error('Delete event API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}