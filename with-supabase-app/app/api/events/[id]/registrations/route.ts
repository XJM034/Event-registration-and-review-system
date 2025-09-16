import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

// 获取赛事报名列表
export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()
    
    if (!session?.user) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const supabase = await createSupabaseServer()
    
    let query = supabase
      .from('registrations')
      .select('*')
      .eq('event_id', id)
      .neq('status', 'draft')  // 不显示草稿，显示所有其他状态的报名
      .order('submitted_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Fetch registrations error:', error)
      return NextResponse.json(
        { error: '获取报名列表失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    })
  } catch (error) {
    console.error('Registrations API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 创建新报名（管理员手动添加）
export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()
    
    if (!session?.user) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const body = await request.json()
    const supabase = await createSupabaseServer()

    const { data, error } = await supabase
      .from('registrations')
      .insert({
        event_id: id,
        team_data: body.team_data,
        players_data: body.players_data,
        status: 'approved', // 管理员手动添加的直接通过
        reviewer_id: session.user.id,
        reviewed_at: new Date().toISOString(),
        submitted_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('Create registration error:', error)
      return NextResponse.json(
        { error: '创建报名失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Create registration API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}