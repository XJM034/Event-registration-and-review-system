import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/auth'

// 获取单个赛事详情（报名端）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params

    if (!eventId) {
      return NextResponse.json(
        { success: false, error: '缺少赛事ID' },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServer()

    // 获取赛事详情
    let event, eventError
    try {
      const result = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .eq('is_visible', true)
        .single()

      event = result.data
      eventError = result.error
    } catch (fetchError) {
      console.error('Supabase连接失败 - 获取赛事详情:', fetchError)
      return NextResponse.json(
        { success: false, error: '数据库连接失败，请稍后重试' },
        { status: 503 }
      )
    }

    if (eventError) {
      console.error('获取赛事详情失败:', eventError)
      return NextResponse.json(
        { success: false, error: '赛事未找到或已下线' },
        { status: 404 }
      )
    }

    // 获取报名设置
    let settings, settingsError
    try {
      const result = await supabase
        .from('registration_settings')
        .select('*')
        .eq('event_id', eventId)
        .single()

      settings = result.data
      settingsError = result.error
    } catch (fetchError) {
      console.warn(`Supabase连接失败 - 获取报名设置:`, fetchError)
      settings = null
      settingsError = null
    }

    if (settingsError && settingsError.code !== 'PGRST116') {
      // PGRST116 是 "not found" 错误，可以忽略
      console.warn(`获取报名设置失败:`, settingsError)
    }

    const eventWithSettings = {
      ...event,
      registration_settings: settingsError ? null : settings
    }

    return NextResponse.json({
      success: true,
      data: eventWithSettings
    })
  } catch (error) {
    console.error('Portal Event Details API error:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}