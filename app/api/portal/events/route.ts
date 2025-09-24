import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/auth'

// 获取赛事列表（报名端）
export async function GET() {
  const startTime = Date.now()
  console.log('Portal Events API - Request started at:', new Date().toISOString())

  try {
    const supabase = await createSupabaseServer()
    console.log('Portal Events API - Supabase client created in:', Date.now() - startTime, 'ms')

    // 使用单个JOIN查询获取所有数据，避免N+1查询问题
    let eventsWithSettings, error
    const queryStartTime = Date.now()
    try {
      console.log('Portal Events API - Starting optimized join query...')
      const result = await supabase
        .from('events')
        .select(`
          *,
          registration_settings (*)
        `)
        .eq('is_visible', true)
        .order('created_at', { ascending: false })

      eventsWithSettings = result.data
      error = result.error
      console.log('Portal Events API - Optimized query completed in:', Date.now() - queryStartTime, 'ms')
      console.log('Portal Events API - Found events count:', eventsWithSettings?.length || 0)
    } catch (fetchError) {
      console.error('Portal Events API - Supabase连接失败:', fetchError)
      console.error('Portal Events API - Query duration before failure:', Date.now() - queryStartTime, 'ms')
      return NextResponse.json(
        { success: false, error: '数据库连接失败，请稍后重试' },
        { status: 503 }
      )
    }

    if (error) {
      console.error('Portal Events API - 获取赛事列表失败:', error)
      return NextResponse.json(
        { success: false, error: '获取赛事列表失败' },
        { status: 500 }
      )
    }

    // 安全处理JOIN结果，确保registration_settings是单个对象而不是数组
    const processedEvents = eventsWithSettings?.map(event => ({
      ...event,
      registration_settings: Array.isArray(event.registration_settings)
        ? (event.registration_settings.length > 0 ? event.registration_settings[0] : null)
        : event.registration_settings
    })) || []

    console.log('Portal Events API - Data processing completed')

    const totalDuration = Date.now() - startTime
    console.log('Portal Events API - Total request duration:', totalDuration, 'ms')
    console.log('Portal Events API - Response size:', processedEvents.length, 'events')

    return NextResponse.json({
      success: true,
      data: processedEvents
    })
  } catch (error) {
    console.error('Portal Events API - API错误:', error)
    console.error('Portal Events API - Total duration before error:', Date.now() - startTime, 'ms')
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}