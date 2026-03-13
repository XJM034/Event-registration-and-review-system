import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/auth'
import { pickEffectiveRegistrationSetting } from '@/lib/registration-settings'

const EVENTS_QUERY_TIMEOUT_MS = 5000

async function withServerTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs = EVENTS_QUERY_TIMEOUT_MS,
  timeoutMessage = 'Server request timed out'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })

  try {
    return await Promise.race([Promise.resolve(promise), timeoutPromise])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

// 获取赛事列表（报名端）
export async function GET() {
  try {
    const supabase = await createSupabaseServer()

    // 使用单个JOIN查询获取所有数据，避免N+1查询问题
    let eventsWithSettings, error
    try {
      const result = await withServerTimeout(
        supabase
          .from('events')
          .select(`
            *,
            registration_settings (*)
          `)
          .eq('is_visible', true)
          .order('created_at', { ascending: false }),
        EVENTS_QUERY_TIMEOUT_MS,
        'Portal events query timed out'
      )

      eventsWithSettings = result.data
      error = result.error
    } catch (fetchError) {
      console.error('Portal Events API - Supabase连接失败:', fetchError)
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

    // 多组别场景下，挑选当前最相关的一条设置返回给前端
    const processedEvents = eventsWithSettings?.map(event => {
      const settings = Array.isArray(event.registration_settings)
        ? pickEffectiveRegistrationSetting(event.registration_settings)
        : event.registration_settings
      return {
        ...event,
        registration_settings: settings
      }
    }) || []

    return NextResponse.json({
      success: true,
      data: processedEvents
    })
  } catch (error) {
    console.error('Portal Events API - API错误:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
