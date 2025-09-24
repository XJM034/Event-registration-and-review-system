import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

// 获取报名设置
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
    
    const { data, error } = await supabase
      .from('registration_settings')
      .select('*')
      .eq('event_id', id)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
      console.error('Fetch settings error:', error)
      return NextResponse.json(
        { error: '获取设置失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || null,
    })
  } catch (error) {
    console.error('Settings API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 创建或更新报名设置
export async function POST(request: NextRequest, context: RouteParams) {
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

    // 先检查是否已存在设置
    const { data: existing } = await supabase
      .from('registration_settings')
      .select('id')
      .eq('event_id', id)
      .single()

    let result
    if (existing) {
      // 更新现有设置
      result = await supabase
        .from('registration_settings')
        .update({
          team_requirements: body.team_requirements,
          player_requirements: body.player_requirements,
          updated_at: new Date().toISOString()
        })
        .eq('event_id', id)
        .select()
        .single()
    } else {
      // 创建新设置
      result = await supabase
        .from('registration_settings')
        .insert({
          event_id: id,
          team_requirements: body.team_requirements,
          player_requirements: body.player_requirements
        })
        .select()
        .single()
    }

    if (result.error) {
      console.error('Save settings error:', result.error)
      return NextResponse.json(
        { error: '保存设置失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    })
  } catch (error) {
    console.error('Save settings API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}