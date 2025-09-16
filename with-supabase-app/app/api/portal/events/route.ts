import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/auth'

// 获取赛事列表（报名端）
export async function GET() {
  try {
    const supabase = await createSupabaseServer()
    
    // 获取所有可见的赛事
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('is_visible', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('获取赛事列表失败:', error)
      return NextResponse.json(
        { success: false, error: '获取赛事列表失败' },
        { status: 500 }
      )
    }

    // 获取每个赛事的报名设置
    const eventsWithSettings = await Promise.all(
      events.map(async (event) => {
        const { data: settings } = await supabase
          .from('registration_settings')
          .select('*')
          .eq('event_id', event.id)
          .single()

        return {
          ...event,
          registration_settings: settings
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: eventsWithSettings
    })
  } catch (error) {
    console.error('API错误:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}