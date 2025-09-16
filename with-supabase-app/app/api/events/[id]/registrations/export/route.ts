import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentAdminSession } from '@/lib/auth'
import * as XLSX from 'xlsx'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const { registrationIds } = await request.json()

    if (!registrationIds || registrationIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '请选择要导出的报名信息' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // 获取选中的报名信息
    const { data: registrations, error } = await supabase
      .from('registrations')
      .select('*')
      .in('id', registrationIds)
      .eq('event_id', params.id)

    if (error) {
      console.error('获取报名信息失败:', error)
      return NextResponse.json(
        { success: false, error: '获取报名信息失败' },
        { status: 500 }
      )
    }

    if (!registrations || registrations.length === 0) {
      return NextResponse.json(
        { success: false, error: '未找到报名信息' },
        { status: 404 }
      )
    }

    // 准备导出数据
    const exportData: any[] = []

    registrations.forEach((registration, index) => {
      const teamData = registration.team_data || {}
      const playersData = registration.players_data || []

      // 基础信息行
      const baseRow = {
        '序号': index + 1,
        '报名时间': new Date(registration.submitted_at).toLocaleString('zh-CN'),
        '审核状态': registration.status === 'approved' ? '已通过' :
                  registration.status === 'rejected' ? '已驳回' : '待审核',
        '审核时间': registration.reviewed_at ?
                  new Date(registration.reviewed_at).toLocaleString('zh-CN') : '-',
      }

      // 添加队伍信息
      Object.keys(teamData).forEach(key => {
        if (typeof teamData[key] === 'object') {
          // 如果是对象类型（如文件），转换为字符串
          baseRow[`队伍-${key}`] = JSON.stringify(teamData[key])
        } else {
          baseRow[`队伍-${key}`] = teamData[key]
        }
      })

      // 如果有队员信息，为每个队员创建一行
      if (playersData.length > 0) {
        playersData.forEach((player: any, playerIndex: number) => {
          const row = { ...baseRow }
          row['队员序号'] = playerIndex + 1

          Object.keys(player).forEach(key => {
            if (typeof player[key] === 'object') {
              row[`队员-${key}`] = JSON.stringify(player[key])
            } else {
              row[`队员-${key}`] = player[key]
            }
          })

          exportData.push(row)
        })
      } else {
        // 没有队员信息的话，只添加队伍信息
        exportData.push(baseRow)
      }
    })

    // 创建工作簿
    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '报名信息')

    // 设置列宽
    const colWidths = Object.keys(exportData[0] || {}).map(() => ({ wch: 15 }))
    ws['!cols'] = colWidths

    // 生成Excel文件
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // 返回文件
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="registrations_${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('导出失败:', error)
    return NextResponse.json(
      { success: false, error: '导出失败' },
      { status: 500 }
    )
  }
}