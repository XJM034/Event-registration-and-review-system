import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(
  request: NextRequest,
  context: RouteParams
) {
  console.log('Export route called')
  try {
    const { id } = await context.params
    console.log('Event ID:', id)
    const session = await getCurrentAdminSession()
    console.log('Session:', session ? 'Valid' : 'Invalid')
    if (!session) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const { registrationIds } = await request.json()
    console.log('Registration IDs:', registrationIds)

    if (!registrationIds || registrationIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '请选择要导出的报名信息' },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServer()

    // 获取选中的报名信息
    const { data: registrations, error } = await supabase
      .from('registrations')
      .select('*')
      .in('id', registrationIds)
      .eq('event_id', id)

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

    // 获取报名设置以了解字段配置
    const { data: settings } = await supabase
      .from('registration_settings')
      .select('*')
      .eq('event_id', id)
      .single()

    // 检查是否有附件字段（image类型）
    let hasAttachments = false
    const imageFields = { team: [], player: [] }

    if (settings?.team_requirements) {
      const teamReq = settings.team_requirements
      const allFields = teamReq.allFields || [
        ...(teamReq.commonFields || []),
        ...(teamReq.customFields || [])
      ]
      imageFields.team = allFields.filter(f => f.type === 'image')
      if (imageFields.team.length > 0) hasAttachments = true
    }

    if (settings?.player_requirements?.roles) {
      settings.player_requirements.roles.forEach(role => {
        const allFields = role.allFields || [
          ...(role.commonFields || []),
          ...(role.customFields || [])
        ]
        const roleImageFields = allFields.filter(f => f.type === 'image')
        if (roleImageFields.length > 0) {
          imageFields.player = [...imageFields.player, ...roleImageFields]
          hasAttachments = true
        }
      })
    }

    // 准备导出数据
    const exportData: any[] = []

    // 如果只有一个报名且有附件，使用特定的命名方式
    let zipFileName = '报名信息导出'
    if (registrations.length === 1 && hasAttachments) {
      const reg = registrations[0]
      const teamData = reg.team_data || {}

      // 获取前四个字段的值来命名压缩包
      const teamFieldsToUse = settings?.team_requirements?.allFields?.slice(0, 4) ||
                              [...(settings?.team_requirements?.commonFields || []),
                               ...(settings?.team_requirements?.customFields || [])].slice(0, 4) ||
                              [{ id: 'name', label: '队伍名称' },
                               { id: 'campus', label: '报名校区' },
                               { id: 'contact', label: '联系人' },
                               { id: 'phone', label: '联系方式' }]

      const nameParts = teamFieldsToUse.map(field => teamData[field.id] || '未知').filter(v => v && v !== '未知')
      if (nameParts.length > 0) {
        zipFileName = nameParts.join('-')
      }
    }

    // 准备Excel数据 - 分为队伍信息和队员信息两个sheet
    const teamSheetData: any[] = []
    const playerSheetData: any[] = []

    // 如果有附件，创建zip对象
    let zip: JSZip | null = null
    const attachmentPromises: Promise<void>[] = []

    if (hasAttachments) {
      zip = new JSZip()
    }

    // 处理每个报名的数据
    for (let index = 0; index < registrations.length; index++) {
      const registration = registrations[index]
      const teamData = registration.team_data || {}
      const playersData = registration.players_data || []

      // 准备队伍信息数据
      const teamRow: any = {
        '序号': index + 1,
        '报名时间': new Date(registration.submitted_at).toLocaleString('zh-CN'),
        '审核状态': registration.status === 'approved' ? '已通过' :
                  registration.status === 'rejected' ? '已驳回' : '待审核',
        '审核时间': registration.reviewed_at ?
                  new Date(registration.reviewed_at).toLocaleString('zh-CN') : '-',
      }

      // 添加队伍字段
      for (const [key, value] of Object.entries(teamData)) {
        // 检查是否是图片字段
        const isImageField = imageFields.team.some(f => f.id === key)
        if (isImageField && value && typeof value === 'string' && value.startsWith('http')) {
          // 如果是图片URL，在Excel中保留URL，并下载图片到zip
          teamRow[key] = value

          if (zip && registrations.length === 1) {
            // 下载图片并添加到zip
            const fieldLabel = imageFields.team.find(f => f.id === key)?.label || key
            attachmentPromises.push(
              (async () => {
                try {
                  console.log(`Downloading team image ${fieldLabel}: ${value}`)
                  const response = await fetch(value, {
                    headers: {
                      'Accept': 'image/*'
                    }
                  })

                  if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                  }

                  const arrayBuffer = await response.arrayBuffer()

                  // 从URL中获取文件扩展名
                  let extension = value.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[1]
                  if (!extension) {
                    const contentType = response.headers.get('content-type')
                    if (contentType?.includes('jpeg') || contentType?.includes('jpg')) extension = 'jpg'
                    else if (contentType?.includes('png')) extension = 'png'
                    else if (contentType?.includes('gif')) extension = 'gif'
                    else if (contentType?.includes('webp')) extension = 'webp'
                    else extension = 'jpg'
                  }

                  zip.file(`${fieldLabel}.${extension}`, arrayBuffer)
                  console.log(`Successfully downloaded team image ${fieldLabel}`)
                } catch (err) {
                  console.error(`Failed to download team image ${fieldLabel}:`, err)
                  console.error('Full URL:', value)
                  // 添加占位文件说明下载失败
                  zip.file(`${fieldLabel}_下载失败.txt`,
                    `图片下载失败\n` +
                    `字段: ${fieldLabel}\n` +
                    `URL: ${value}\n` +
                    `错误: ${err.message}\n` +
                    `时间: ${new Date().toLocaleString('zh-CN')}`
                  )
                }
              })()
            )
          }
        } else if (typeof value === 'object') {
          teamRow[key] = JSON.stringify(value)
        } else {
          teamRow[key] = value
        }
      }

      teamSheetData.push(teamRow)

      // 准备队员信息数据
      if (playersData.length > 0) {
        for (let playerIndex = 0; playerIndex < playersData.length; playerIndex++) {
          const player: any = playersData[playerIndex]
          const playerRow: any = {
            '报名序号': index + 1,
            '队员序号': playerIndex + 1,
            '队员姓名': player.姓名 || player.name || '-'
          }

          // 添加队员字段
          for (const [key, value] of Object.entries(player)) {
            if (key === 'id') continue // 跳过ID字段

            // 检查是否是图片字段
            const isImageField = imageFields.player.some(f => f.id === key)
            if (isImageField && value && typeof value === 'string' && value.startsWith('http')) {
              // 如果是图片URL
              playerRow[key] = value

              if (zip && registrations.length === 1) {
                // 下载图片并添加到zip的子文件夹
                const fieldLabel = imageFields.player.find(f => f.id === key)?.label || key
                const playerName = player.姓名 || player.name || `队员${playerIndex + 1}`

                attachmentPromises.push(
                  (async () => {
                    try {
                      console.log(`Downloading player image for ${playerName}: ${value}`)
                      const response = await fetch(value, {
                        headers: {
                          'Accept': 'image/*'
                        }
                      })

                      if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                      }

                      const arrayBuffer = await response.arrayBuffer()

                      // 从URL中获取文件扩展名，如果没有则从content-type推断
                      let extension = value.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[1]
                      if (!extension) {
                        const contentType = response.headers.get('content-type')
                        if (contentType?.includes('jpeg') || contentType?.includes('jpg')) extension = 'jpg'
                        else if (contentType?.includes('png')) extension = 'png'
                        else if (contentType?.includes('gif')) extension = 'gif'
                        else if (contentType?.includes('webp')) extension = 'webp'
                        else extension = 'jpg' // 默认
                      }

                      zip.file(`${fieldLabel}/${playerName}.${extension}`, arrayBuffer)
                      console.log(`Successfully downloaded image for ${playerName}`)
                    } catch (err) {
                      console.error(`Failed to download player image ${playerName}:`, err)
                      console.error('Full URL:', value)
                      console.error('Error details:', err.message)
                      // 添加占位文件说明下载失败
                      zip.file(`${fieldLabel}/${playerName}_下载失败.txt`,
                        `图片下载失败\n` +
                        `队员姓名: ${playerName}\n` +
                        `URL: ${value}\n` +
                        `错误: ${err.message}\n` +
                        `时间: ${new Date().toLocaleString('zh-CN')}`
                      )
                    }
                  })()
                )
              }
            } else if (typeof value === 'object') {
              playerRow[key] = JSON.stringify(value)
            } else {
              playerRow[key] = value
            }
          }

          playerSheetData.push(playerRow)
        }
      }
    }

    // 等待所有附件下载完成
    if (attachmentPromises.length > 0) {
      console.log(`Downloading ${attachmentPromises.length} attachments...`)
      try {
        await Promise.allSettled(attachmentPromises)
        console.log('All attachments processed')
      } catch (err) {
        console.error('Error processing attachments:', err)
        // 继续导出，即使部分附件下载失败
      }
    }

    // 创建工作簿
    const wb = XLSX.utils.book_new()

    // 创建队伍信息sheet
    if (teamSheetData.length > 0) {
      const teamSheet = XLSX.utils.json_to_sheet(teamSheetData)
      const teamColWidths = Object.keys(teamSheetData[0] || {}).map(() => ({ wch: 15 }))
      teamSheet['!cols'] = teamColWidths
      XLSX.utils.book_append_sheet(wb, teamSheet, '队伍信息')
    }

    // 创建队员信息sheet
    if (playerSheetData.length > 0) {
      const playerSheet = XLSX.utils.json_to_sheet(playerSheetData)
      const playerColWidths = Object.keys(playerSheetData[0] || {}).map(() => ({ wch: 15 }))
      playerSheet['!cols'] = playerColWidths
      XLSX.utils.book_append_sheet(wb, playerSheet, '队员信息')
    }

    // 如果没有数据，创建一个空sheet
    if (teamSheetData.length === 0 && playerSheetData.length === 0) {
      const emptySheet = XLSX.utils.json_to_sheet([{ '信息': '暂无数据' }])
      XLSX.utils.book_append_sheet(wb, emptySheet, '报名信息')
    }

    // 生成Excel文件
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // 如果有附件且创建了zip，将Excel添加到zip并返回zip
    if (zip && registrations.length === 1) {
      // 添加Excel文件到zip
      zip.file(`${zipFileName}.xlsx`, excelBuffer)

      // 生成zip文件
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

      // 返回zip文件
      return new NextResponse(zipBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(zipFileName)}.zip"`,
        },
      })
    } else {
      // 没有附件或多个报名，直接返回Excel
      return new NextResponse(excelBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(zipFileName)}_${new Date().toISOString().split('T')[0]}.xlsx"`,
        },
      })
    }
  } catch (error) {
    console.error('导出失败:', error)
    console.error('Error details:', {
      message: error.message,
      stack: error.stack
    })
    return NextResponse.json(
      { success: false, error: error.message || '导出失败' },
      { status: 500 }
    )
  }
}