import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

interface RouteParams {
  params: Promise<{ id: string }>
}

// 审核报名
export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()

    if (!session?.user) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { status, rejection_reason } = body

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: '无效的审核状态', success: false },
        { status: 400 }
      )
    }

    // 使用服务密钥创建客户端，��过 RLS（管理端审核需要操作通知表）
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const updateData: {
      status: string
      reviewer_id: string
      reviewed_at: string
      last_status_change: string
      rejection_reason?: string | null
      last_status_read_at?: string | null
    } = {
      status,
      reviewer_id: session.user.id,
      reviewed_at: new Date().toISOString(),
      last_status_change: new Date().toISOString()  // 添加状态变更时间
    }

    if (status === 'rejected' && rejection_reason) {
      updateData.rejection_reason = rejection_reason
    } else if (status === 'approved') {
      // 通过审核时清空驳回理由，并重置已读状态以确保显示未读消息
      updateData.rejection_reason = null
      updateData.last_status_read_at = null  // 重置已读状态，确保显示未读消息
    }

    const { data, error } = await supabase
      .from('registrations')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        events (
          name,
          short_name
        )
      `)
      .single()

    if (error) {
      console.error('Review registration error:', error)
      return NextResponse.json(
        { error: '审核失败', success: false },
        { status: 500 }
      )
    }

    // 创建通知
    console.log('审核完成，准备创建通知:', {
      hasData: !!data,
      coach_id: data?.coach_id,
      event_id: data?.event_id,
      registration_id: data?.id,
      status
    })

    if (data && data.coach_id) {
      const eventName = data.events?.short_name || data.events?.name || '赛事'

      const notificationData = {
        coach_id: data.coach_id,
        type: status === 'approved' ? 'approval' : 'rejection',
        title: status === 'approved' ? '报名审核通过' : '报名已驳回',
        message: status === 'approved'
          ? `您的${eventName}报名已通过审核，请及时查看。`
          : `您的${eventName}报名被驳回。${rejection_reason ? `原因：${rejection_reason}` : ''}`,
        is_read: false,
        event_id: data.event_id,
        registration_id: data.id
      }

      console.log('插入通知数据:', notificationData)

      const { data: notifResult, error: notifError } = await supabase
        .from('notifications')
        .insert(notificationData)
        .select()

      if (notifError) {
        console.error('创建通知失败:', notifError)
      } else {
        console.log('通知创建成功:', notifResult)
      }
    } else {
      console.warn('无法创建通知: 缺少 coach_id', { data })
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Review API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}