import { NextResponse } from 'next/server'
import { getOptionalSupabaseAnonKey } from '@/lib/env'
import { createClient } from '@/lib/supabase/client'

export async function GET() {
  try {
    console.log('🔍 测试 MemFire Cloud 连接...')

    // 获取环境变量
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = getOptionalSupabaseAnonKey()

    console.log('URL:', supabaseUrl)
    console.log('Key 前10位:', supabaseKey?.substring(0, 10) + '...')

    // 创建客户端
    const supabase = createClient()

    // 检查服务类型
    const serviceType = supabaseUrl?.includes('memfiredb.com') ? 'MemFire Cloud' :
                       supabaseUrl?.includes('supabase.co') ? 'Supabase' : '未知服务'

    console.log('检测到服务:', serviceType)

    const results = {
      serviceType,
      url: supabaseUrl,
      keyPrefix: supabaseKey?.substring(0, 10) + '...',
      tests: [] as any[]
    }

    // 测试1: 基本连接
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('count')
        .limit(1)

      if (error) {
        results.tests.push({
          name: '基本连接',
          status: 'failed',
          error: error.message,
          details: error
        })
      } else {
        results.tests.push({
          name: '基本连接',
          status: 'success',
          data: data
        })
      }
    } catch (err: any) {
      results.tests.push({
        name: '基本连接',
        status: 'error',
        error: err.message
      })
    }

    // 测试2: 检查核心表
    const tables = ['admin_users', 'events', 'registrations']

    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1)

        if (error) {
          results.tests.push({
            name: `表 ${table}`,
            status: 'failed',
            error: error.message
          })
        } else {
          results.tests.push({
            name: `表 ${table}`,
            status: 'success',
            recordCount: data?.length || 0
          })
        }
      } catch (err: any) {
        results.tests.push({
          name: `表 ${table}`,
          status: 'error',
          error: err.message
        })
      }
    }

    // 测试3: 认证功能
    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession()

      if (authError) {
        results.tests.push({
          name: '认证服务',
          status: 'warning',
          error: authError.message
        })
      } else {
        results.tests.push({
          name: '认证服务',
          status: 'success',
          hasSession: !!session
        })
      }
    } catch (authErr: any) {
      results.tests.push({
        name: '认证服务',
        status: 'error',
        error: authErr.message
      })
    }

    // 统计结果
    const successCount = results.tests.filter(t => t.status === 'success').length
    const totalCount = results.tests.length

    return NextResponse.json({
      success: successCount > 0,
      summary: `${successCount}/${totalCount} 测试通过`,
      ...results
    })

  } catch (error: any) {
    console.error('MemFire 连接测试失败:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}
