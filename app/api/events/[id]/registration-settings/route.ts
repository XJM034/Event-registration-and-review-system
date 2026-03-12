import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

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

    const supabase = createServiceRoleClient()

    // 检查是否指定了 division_id
    const { searchParams } = new URL(request.url)
    const divisionId = searchParams.get('division_id')

    let query = supabase
      .from('registration_settings')
      .select('*')
      .eq('event_id', id)

    if (divisionId) {
      query = query.eq('division_id', divisionId)
      const { data, error } = await query.single()

      if (error && error.code !== 'PGRST116') {
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
    } else {
      // 无 division_id 时返回所有设置（兼容旧赛事）
      const { data, error } = await query

      if (error) {
        console.error('Fetch settings error:', error)
        return NextResponse.json(
          { error: '获取设置失败', success: false },
          { status: 500 }
        )
      }

      // 兼容：如果只有一条且无 division_id，按旧逻辑返回单条
      if (data && data.length === 1 && !data[0].division_id) {
        return NextResponse.json({
          success: true,
          data: data[0],
        })
      }

      return NextResponse.json({
        success: true,
        data: data || [],
      })
    }
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
    const supabase = createServiceRoleClient()
    const divisionId = body.division_id || null

    // 先检查是否已存在设置
    let existingQuery = supabase
      .from('registration_settings')
      .select('id')
      .eq('event_id', id)

    if (divisionId) {
      existingQuery = existingQuery.eq('division_id', divisionId)
    } else {
      existingQuery = existingQuery.is('division_id', null)
    }

    const { data: existing } = await existingQuery.single()

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
        .eq('id', existing.id)
        .select()
        .single()
    } else {
      // 创建新设置
      result = await supabase
        .from('registration_settings')
        .insert({
          event_id: id,
          division_id: divisionId,
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
