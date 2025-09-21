import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/auth'

// 测试优化后的 Portal Events API 逻辑（无需认证）
export async function GET() {
  const startTime = Date.now()
  console.log('Optimized Portal Test API - Request started at:', new Date().toISOString())

  try {
    const supabase = await createSupabaseServer()
    console.log('Optimized Portal Test API - Supabase client created in:', Date.now() - startTime, 'ms')

    // 使用单个JOIN查询获取所有数据，避免N+1查询问题
    let eventsWithSettings, error
    const queryStartTime = Date.now()
    try {
      console.log('Optimized Portal Test API - Starting optimized join query...')
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
      console.log('Optimized Portal Test API - Optimized query completed in:', Date.now() - queryStartTime, 'ms')
      console.log('Optimized Portal Test API - Found events count:', eventsWithSettings?.length || 0)
    } catch (fetchError) {
      console.error('Optimized Portal Test API - Supabase连接失败:', fetchError)
      console.error('Optimized Portal Test API - Query duration before failure:', Date.now() - queryStartTime, 'ms')
      return NextResponse.json(
        { success: false, error: '数据库连接失败，请稍后重试' },
        { status: 503 }
      )
    }

    if (error) {
      console.error('Optimized Portal Test API - 获取赛事列表失败:', error)
      return NextResponse.json(
        { success: false, error: '获取赛事列表失败' },
        { status: 500 }
      )
    }

    // 处理JOIN结果，确保registration_settings是单个对象而不是数组
    const processingStartTime = Date.now()
    const processedEvents = eventsWithSettings.map(event => ({
      ...event,
      registration_settings: Array.isArray(event.registration_settings)
        ? (event.registration_settings.length > 0 ? event.registration_settings[0] : null)
        : event.registration_settings
    }))
    console.log('Optimized Portal Test API - Data processing completed in:', Date.now() - processingStartTime, 'ms')

    const totalDuration = Date.now() - startTime
    console.log('Optimized Portal Test API - Total request duration:', totalDuration, 'ms')
    console.log('Optimized Portal Test API - Response size:', processedEvents.length, 'events')

    return NextResponse.json({
      success: true,
      data: processedEvents,
      _performance: {
        totalDuration,
        queryDuration: Date.now() - queryStartTime,
        processingDuration: Date.now() - processingStartTime,
        eventsCount: processedEvents.length,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Optimized Portal Test API - API错误:', error)
    console.error('Optimized Portal Test API - Total duration before error:', Date.now() - startTime, 'ms')
    return NextResponse.json(
      {
        success: false,
        error: '服务器错误',
        errorDetails: error.message,
        duration: Date.now() - startTime
      },
      { status: 500 }
    )
  }
}