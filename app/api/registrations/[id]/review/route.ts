import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'

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

    const supabase = await createSupabaseServer()

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
    if (data && data.coach_id) {
      const eventName = data.events?.short_name || data.events?.name || '赛事'

      let notificationData = {
        coach_id: data.coach_id,
        type: status === 'approved' ? 'approval' : 'rejection',
        title: status === 'approved' ? '报名审核通过' : '报名已驳回',
        message: status === 'approved'
          ? `您的${eventName}报名已通过审核，请及时查看。`
          : `您的${eventName}报名被驳回。${rejection_reason ? `原因：${rejection_reason}` : ''}`,
        is_read: false,
        event_id: data.event_id,
        registration_id: data.id,
        metadata: {
          team_name: data.team_data?.team_name,
          status: status,
          rejection_reason: rejection_reason
        }
      }

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notificationData)

      if (notifError) {
        console.error('创建通知失败:', notifError)
        // 不影响审核流程，只是记录错误
      } else {
        console.log('通知创建成功')
      }
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