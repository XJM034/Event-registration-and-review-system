import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/auth'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

type EventRecord = Record<string, unknown>
type EventWithMeta = EventRecord & {
  _meta: {
    settingsQueryDuration: number
    settingsError?: string
    processingError?: string
    settingsSuccess?: boolean
  }
}

// 模拟 Portal Events API 的确切行为，但不需要认证
export async function GET() {
  const startTime = Date.now()
  console.log('Portal Simulation API - Request started at:', new Date().toISOString())

  try {
    const supabase = await createSupabaseServer()
    console.log('Portal Simulation API - Supabase client created in:', Date.now() - startTime, 'ms')

    // 完全复制 portal events API 的逻辑
    let events: EventRecord[] = []
    let error: { message?: string } | null = null
    const queryStartTime = Date.now()
    try {
      console.log('Portal Simulation API - Starting events query...')
      const result = await supabase
        .from('events')
        .select('*')
        .eq('is_visible', true)
        .order('created_at', { ascending: false })

      events = result.data || []
      error = result.error
      console.log('Portal Simulation API - Events query completed in:', Date.now() - queryStartTime, 'ms')
      console.log('Portal Simulation API - Found events count:', events?.length || 0)
    } catch (fetchError) {
      console.error('Portal Simulation API - Supabase连接失败:', fetchError)
      console.error('Portal Simulation API - Query duration before failure:', Date.now() - queryStartTime, 'ms')
      return NextResponse.json(
        { success: false, error: '数据库连接失败，请稍后重试' },
        { status: 503 }
      )
    }

    if (error) {
      console.error('Portal Simulation API - 获取赛事列表失败:', error)
      return NextResponse.json(
        { success: false, error: '获取赛事列表失败' },
        { status: 500 }
      )
    }

    // 获取每个赛事的报名设置 - 这是最可能出问题的地方
    console.log('Portal Simulation API - Starting registration settings queries...')
    const settingsStartTime = Date.now()
    const eventsWithSettings: EventWithMeta[] = await Promise.all(
      events.map(async (event, index) => {
        const eventStartTime = Date.now()
        try {
          let settings: Record<string, unknown> | null = null
          let settingsError: { code?: string } | null = null
          try {
            console.log(`Portal Simulation API - Querying settings for event ${index + 1}/${events.length}: ${event.id}`)
            const result = await supabase
              .from('registration_settings')
              .select('*')
              .eq('event_id', event.id)
              .single()

            settings = result.data
            settingsError = result.error
            console.log(`Portal Simulation API - Event ${index + 1} settings query completed in:`, Date.now() - eventStartTime, 'ms')
          } catch (fetchError) {
            console.warn(`Portal Simulation API - Event ${index + 1} settings fetch error:`, fetchError)
            return {
              ...event,
              registration_settings: null,
              _meta: {
                settingsQueryDuration: Date.now() - eventStartTime,
                settingsError: getErrorMessage(fetchError)
              }
            }
          }

          if (settingsError && settingsError.code !== 'PGRST116') {
            console.warn(`Portal Simulation API - Event ${index + 1} settings error:`, settingsError)
          }

          return {
            ...event,
            registration_settings: settingsError ? null : settings,
            _meta: {
              settingsQueryDuration: Date.now() - eventStartTime,
              settingsSuccess: !settingsError
            }
          }
        } catch (error: unknown) {
          console.warn(`Portal Simulation API - Event ${index + 1} processing error:`, error)
          return {
            ...event,
            registration_settings: null,
            _meta: {
              settingsQueryDuration: Date.now() - eventStartTime,
              processingError: getErrorMessage(error)
            }
          }
        }
      })
    )
    console.log('Portal Simulation API - All settings queries completed in:', Date.now() - settingsStartTime, 'ms')

    const totalDuration = Date.now() - startTime
    console.log('Portal Simulation API - Total request duration:', totalDuration, 'ms')
    console.log('Portal Simulation API - Response size:', eventsWithSettings.length, 'events')

    // 分析查询性能
    const settingsMetrics = eventsWithSettings.map((e) => e._meta)
    const avgSettingsTime = settingsMetrics.reduce((sum, m) => sum + m.settingsQueryDuration, 0) / settingsMetrics.length
    const failedSettings = settingsMetrics.filter(m => m.settingsError || m.processingError).length

    return NextResponse.json({
      success: true,
      data: eventsWithSettings,
      _diagnostics: {
        totalDuration,
        eventsCount: events.length,
        settingsQueries: {
          averageDuration: avgSettingsTime,
          failedCount: failedSettings,
          successRate: ((settingsMetrics.length - failedSettings) / settingsMetrics.length * 100).toFixed(1) + '%'
        },
        timestamps: {
          start: new Date(startTime).toISOString(),
          end: new Date().toISOString()
        }
      }
    })
  } catch (error: unknown) {
    console.error('Portal Simulation API - API错误:', error)
    console.error('Portal Simulation API - Total duration before error:', Date.now() - startTime, 'ms')
    return NextResponse.json(
      {
        success: false,
        error: '服务器错误',
        errorDetails: getErrorMessage(error),
        duration: Date.now() - startTime
      },
      { status: 500 }
    )
  }
}
