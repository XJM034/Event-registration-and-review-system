import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'

// 获取赛事列表
export async function GET() {
  try {
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const supabase = await createSupabaseServer()
    
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch events error:', error)
      return NextResponse.json(
        { error: '获取赛事列表失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: events || [],
    })
  } catch (error) {
    console.error('Events API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 创建赛事
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const body = await request.json()
    const {
      name,
      short_name,
      type,
      start_date,
      end_date,
      address,
      details,
      phone,
      poster_url,
    } = body

    // 验证必填字段
    if (!name || !type || !start_date || !end_date) {
      return NextResponse.json(
        { error: '请填写所有必填字段', success: false },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServer()

    const { data: event, error } = await supabase
      .from('events')
      .insert({
        name,
        short_name,
        type,
        start_date,
        end_date,
        address,
        details,
        phone,
        poster_url,
        is_visible: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Create event error:', error)
      return NextResponse.json(
        { error: '创建赛事失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: event,
    })
  } catch (error) {
    console.error('Create event API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}