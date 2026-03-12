import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession } from '@/lib/auth'
import { pickEffectiveRegistrationSetting } from '@/lib/registration-settings'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

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

    const supabase = createServiceRoleClient()
    
    const { data: events, error } = await supabase
      .from('events')
      .select(`
        *,
        registration_settings(*)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch events error:', error)
      return NextResponse.json(
        { error: '获取赛事列表失败', success: false },
        { status: 500 }
      )
    }

    // 处理 registration_settings，确保多组别时选中当前最相关的一条配置
    const processedEvents = events?.map(event => ({
      ...event,
      registration_settings: Array.isArray(event.registration_settings)
        ? pickEffectiveRegistrationSetting(event.registration_settings)
        : event.registration_settings
    })) || []

    return NextResponse.json({
      success: true,
      data: processedEvents,
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
      requirements,
      reference_templates,
      division_ids,
    } = body

    // 验证必填字段
    if (!name || !type || !start_date || !end_date) {
      return NextResponse.json(
        { error: '请填写所有必填字段', success: false },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()

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
        requirements,
        reference_templates: Array.isArray(reference_templates) ? reference_templates : [],
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

    // 创建赛事-组别关联
    if (division_ids && division_ids.length > 0) {
      const eventDivisions = division_ids.map((divisionId: string) => ({
        event_id: event.id,
        division_id: divisionId,
      }))

      const { error: divisionError } = await supabase
        .from('event_divisions')
        .insert(eventDivisions)

      if (divisionError) {
        console.error('Create event divisions error:', divisionError)
        // 不阻断，赛事已创建成功
      }
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
