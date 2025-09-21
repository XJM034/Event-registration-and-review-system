import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/auth'

// 测试 Supabase 连接
export async function GET() {
  const startTime = Date.now()
  console.log('Connection Test API - Request started at:', new Date().toISOString())

  try {
    const supabase = await createSupabaseServer()
    console.log('Connection Test API - Supabase client created in:', Date.now() - startTime, 'ms')

    // 测试连接和基本查询
    const tests = []

    // 测试 1: 简单的 select 查询
    const test1Start = Date.now()
    try {
      const { data, error } = await supabase
        .from('events')
        .select('count')
        .limit(1)

      tests.push({
        name: 'Basic count query',
        success: !error,
        duration: Date.now() - test1Start,
        error: error?.message,
        rowCount: data?.length || 0
      })
    } catch (err) {
      tests.push({
        name: 'Basic count query',
        success: false,
        duration: Date.now() - test1Start,
        error: (err as Error).message
      })
    }

    // 测试 2: 获取所有事件
    const test2Start = Date.now()
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('is_visible', true)

      tests.push({
        name: 'Full events query',
        success: !error,
        duration: Date.now() - test2Start,
        error: error?.message,
        rowCount: data?.length || 0
      })
    } catch (err) {
      tests.push({
        name: 'Full events query',
        success: false,
        duration: Date.now() - test2Start,
        error: (err as Error).message
      })
    }

    // 测试 3: 连接池测试 - 多个并发查询
    const test3Start = Date.now()
    try {
      const promises = Array.from({ length: 5 }, () =>
        supabase
          .from('events')
          .select('id')
          .limit(1)
      )

      const results = await Promise.all(promises)
      const successCount = results.filter(r => !r.error).length

      tests.push({
        name: 'Concurrent queries (5x)',
        success: successCount === 5,
        duration: Date.now() - test3Start,
        successCount: successCount,
        totalQueries: 5
      })
    } catch (err) {
      tests.push({
        name: 'Concurrent queries (5x)',
        success: false,
        duration: Date.now() - test3Start,
        error: (err as Error).message
      })
    }

    // 测试 4: 复杂查询测试
    const test4Start = Date.now()
    try {
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          registration_settings (*)
        `)
        .eq('is_visible', true)
        .order('created_at', { ascending: false })

      tests.push({
        name: 'Complex join query',
        success: !error,
        duration: Date.now() - test4Start,
        error: error?.message,
        rowCount: data?.length || 0
      })
    } catch (err) {
      tests.push({
        name: 'Complex join query',
        success: false,
        duration: Date.now() - test4Start,
        error: (err as Error).message
      })
    }

    const totalDuration = Date.now() - startTime
    const summary = {
      totalDuration,
      totalTests: tests.length,
      successfulTests: tests.filter(t => t.success).length,
      failedTests: tests.filter(t => !t.success).length,
      averageQueryTime: tests.reduce((sum, t) => sum + t.duration, 0) / tests.length
    }

    console.log('Connection Test API - Summary:', summary)
    console.log('Connection Test API - Test Results:', tests)

    return NextResponse.json({
      success: true,
      summary,
      tests,
      timestamp: new Date().toISOString(),
      environment: {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, '').split('.')[0] + '.supabase.co',
        nodeEnv: process.env.NODE_ENV
      }
    })
  } catch (error) {
    console.error('Connection Test API - Fatal error:', error)
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}