import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'

interface RouteParams {
  params: Promise<{ id: string }>
}

const INVALID_SHEET_CHARS = /[:\\/?*\[\]]/g
const INVALID_PATH_CHARS = /[\\\/?%*:|"<>]/g

const sanitizeSheetName = (name: string, fallback: string) => {
  const cleaned = (name || '').replace(INVALID_SHEET_CHARS, '-').trim()
  const base = cleaned || fallback
  return base.length > 31 ? base.slice(0, 31) : base
}

const ensureUniqueSheetName = (rawName: string, used: Set<string>, fallback: string) => {
  const sanitized = sanitizeSheetName(rawName, fallback)
  let name = sanitized
  let counter = 2
  while (used.has(name)) {
    const suffix = `-${counter}`
    const base = sanitized.length > 31 - suffix.length ? sanitized.slice(0, 31 - suffix.length) : sanitized
    name = `${base}${suffix}`
    counter += 1
  }
  used.add(name)
  return name
}

const sanitizePathSegment = (name: string, fallback: string) => {
  const cleaned = (name || '').replace(INVALID_PATH_CHARS, '-').trim()
  return cleaned || fallback
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

    // 获取配置的字段
    let teamFields: any[] = []
    let playerRoles: any[] = []
    let hasAttachments = false
    const imageFields: { team: any[], player: any[] } = { team: [], player: [] }

    if (settings?.team_requirements) {
      const teamReq = settings.team_requirements
      // 获取队伍字段
      teamFields = teamReq.allFields || [
        ...(teamReq.commonFields || []),
        ...(teamReq.customFields || [])
      ]
      // 检查是否有图片字段
      imageFields.team = teamFields.filter(f => f.type === 'image')
      if (imageFields.team.length > 0) hasAttachments = true
    }

    if (settings?.player_requirements?.roles) {
      playerRoles = settings.player_requirements.roles
    }

    if (playerRoles.length === 0) {
      playerRoles = [
        {
          id: 'player',
          name: '队员信息',
          commonFields: [],
          customFields: [],
          allFields: []
        }
      ]
    }

    const rolesById = new Map(playerRoles.map(role => [role.id, role]))
    const defaultRole = rolesById.get('player') || playerRoles[0]

    // 为角色准备sheet名和路径名
    const usedSheetNames = new Set<string>()
    const roleSheetNames = new Map<string, string>()
    const rolePathNames = new Map<string, string>()
    playerRoles.forEach(role => {
      const rawName = String(role?.name || role?.id || '角色')
      const sheetName = ensureUniqueSheetName(rawName, usedSheetNames, '队员信息')
      roleSheetNames.set(role.id, sheetName)
      rolePathNames.set(role.id, sanitizePathSegment(rawName, '角色'))
    })

    // 检查所有角色的图片字段
    playerRoles.forEach(role => {
      const roleFields = role.allFields || [
        ...(role.commonFields || []),
        ...(role.customFields || [])
      ]
      const roleImageFields = roleFields.filter((f: any) => f.type === 'image')
      if (roleImageFields.length > 0) {
        imageFields.player = [...imageFields.player, ...roleImageFields]
        hasAttachments = true
      }
    })

    // 准备Excel数据 - 分为队伍信息和各角色信息的多个sheet
    const teamSheetData: any[] = []
    // 为每个角色创建独立的数据数组
    const roleSheetData: Map<string, any[]> = new Map()
    playerRoles.forEach(role => {
      roleSheetData.set(role.id, [])
    })

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

      // 获取队伍名称
      const teamName = teamData['队伍名称'] || teamData['name'] || teamData['团队名称'] || teamData['队名'] || `队伍${index + 1}`

      // 生成队伍文件夹名称（使用前三个字段的值）
      let teamFolderName = teamName
      if (registrations.length > 1) {
        // 多个队伍时，使用前三个字段命名文件夹
        const firstThreeFields = teamFields.slice(0, 3)
        const folderNameParts: string[] = []
        firstThreeFields.forEach(field => {
          if (field.type !== 'image') {
            const value = teamData[field.id]
            if (value) {
              folderNameParts.push(String(value).replace(/[/\\?%*:|"<>]/g, '-')) // 移除非法文件名字符
            }
          }
        })
        if (folderNameParts.length > 0) {
          teamFolderName = folderNameParts.join('-')
        }
      }

      // 准备队伍信息数据 - 只包含报名设置中的字段
      const teamRow: any = {
        '序号': index + 1
      }

      // 按照报名设置的字段顺序添加数据
      teamFields.forEach(field => {
        const value = teamData[field.id]

        // 跳过图片字段（已经下载到文件夹）
        if (field.type === 'image') {
          if (value && typeof value === 'string' && value.startsWith('http') && zip) {
            // 下载图片
            const fieldLabel = field.label || field.id
            const safeTeamFieldLabel = sanitizePathSegment(String(fieldLabel), '字段')
            attachmentPromises.push(
              (async () => {
                try {
                  const response = await fetch(value, {
                    headers: {
                      'Accept': 'image/*'
                    }
                  })

                  if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                  }

                  const arrayBuffer = await response.arrayBuffer()

                  // 获取文件扩展名
                  let extension = value.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[1]
                  if (!extension) {
                    const contentType = response.headers.get('content-type')
                    if (contentType?.includes('jpeg') || contentType?.includes('jpg')) extension = 'jpg'
                    else if (contentType?.includes('png')) extension = 'png'
                    else if (contentType?.includes('gif')) extension = 'gif'
                    else if (contentType?.includes('webp')) extension = 'webp'
                    else extension = 'jpg'
                  }

                  // 根据报名数量决定文件路径
                  let filePath = ''
                  if (registrations.length === 1) {
                    // 单个队伍：直接放在根目录
                    filePath = `${safeTeamFieldLabel}.${extension}`
                  } else {
                    // 多个队伍：字段文件夹/队伍文件夹/文件名
                    filePath = `${safeTeamFieldLabel}/${teamFolderName}/${safeTeamFieldLabel}.${extension}`
                  }

                  zip.file(filePath, arrayBuffer)
                  console.log(`Downloaded team image: ${filePath}`)
                } catch (err) {
                  console.error(`Failed to download team image:`, err)
                }
              })()
            )
          }
          return // 不在Excel中显示图片字段
        }

        // 添加非图片字段到Excel
        teamRow[field.label] = value || ''
      })

      teamSheetData.push(teamRow)

      // 准备人员信息数据（按角色分别处理）
      if (playersData.length > 0) {
        // 按角色统计人员序号
        const roleCounters: Map<string, number> = new Map()

        for (let playerIndex = 0; playerIndex < playersData.length; playerIndex++) {
          const player: any = playersData[playerIndex]

          // 获取该人员的角色配置
          const roleIdCandidate = player.role || player.roleId
          let currentRole = roleIdCandidate ? rolesById.get(roleIdCandidate) : undefined
          if (!currentRole) {
            const roleNameCandidate = player.roleName || player.role
            if (roleNameCandidate) {
              currentRole = playerRoles.find(r => r.name === roleNameCandidate)
            }
          }
          if (!currentRole) {
            currentRole = defaultRole
            if (currentRole) {
              console.warn(`未找到角色配置: ${roleIdCandidate || player.roleName || '未知'}，已回退到默认角色`)
            }
          }
          if (!currentRole) {
            console.warn('未找到角色配置且无默认角色，跳过该人员')
            continue
          }

          // 获取该角色的字段配置
          const playerFields = currentRole.allFields ||
                              [...(currentRole.commonFields || []),
                               ...(currentRole.customFields || [])] ||
                              []

          // 更新该角色的序号计数
          const roleIdForSheet = currentRole.id
          const currentCount = (roleCounters.get(roleIdForSheet) || 0) + 1
          roleCounters.set(roleIdForSheet, currentCount)

          const playerRow: any = {
            '序号': `${index + 1}-${currentCount}`,
            '所属队伍': teamName
          }

          // 按照该角色的字段顺序添加数据
          playerFields.forEach((field: any) => {
            const value = player[field.id]

            // 跳过图片字段（已经下载到文件夹）
            if (field.type === 'image') {
              if (value && typeof value === 'string' && value.startsWith('http') && zip) {
                // 下载图片
                const fieldLabel = field.label || field.id
                const playerName = player['姓名'] || player['name'] || player['队员姓名'] || `${currentRole.name}${currentCount}`
                const safeRoleSegment = rolePathNames.get(currentRole.id) || sanitizePathSegment(String(currentRole.name || currentRole.id), '角色')
                const safeFieldLabel = sanitizePathSegment(String(fieldLabel), '字段')
                const safePlayerName = sanitizePathSegment(String(playerName), '队员')

                attachmentPromises.push(
                  (async () => {
                    try {
                      const response = await fetch(value, {
                        headers: {
                          'Accept': 'image/*'
                        }
                      })

                      if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                      }

                      const arrayBuffer = await response.arrayBuffer()

                      // 获取文件扩展名
                      let extension = value.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[1]
                      if (!extension) {
                        const contentType = response.headers.get('content-type')
                        if (contentType?.includes('jpeg') || contentType?.includes('jpg')) extension = 'jpg'
                        else if (contentType?.includes('png')) extension = 'png'
                        else if (contentType?.includes('gif')) extension = 'gif'
                        else if (contentType?.includes('webp')) extension = 'webp'
                        else extension = 'jpg'
                      }

                      // 根据报名数量决定文件路径
                      let filePath = ''
                      if (registrations.length === 1) {
                        // 单个队伍：角色-字段名文件夹/队员名
                        filePath = `${safeRoleSegment}-${safeFieldLabel}/${safePlayerName}.${extension}`
                      } else {
                        // 多个队伍：角色-字段名文件夹/队伍文件夹/队员名
                        filePath = `${safeRoleSegment}-${safeFieldLabel}/${teamFolderName}/${safePlayerName}.${extension}`
                      }

                      zip.file(filePath, arrayBuffer)
                      console.log(`Downloaded player image: ${filePath}`)
                    } catch (err) {
                      console.error(`Failed to download player image:`, err)
                    }
                  })()
                )
              }
              return // 不在Excel中显示图片字段
            }

            // 添加非图片字段到Excel
            playerRow[field.label] = value || ''
          })

          // 将数据添加到对应角色的sheet数据中
          if (!roleSheetData.has(roleIdForSheet)) {
            roleSheetData.set(roleIdForSheet, [])
          }
          const roleData = roleSheetData.get(roleIdForSheet)
          if (roleData) {
            roleData.push(playerRow)
          }
        }
      }
    }

    // 等待所有附件下载完成
    if (attachmentPromises.length > 0) {
      console.log(`Downloading ${attachmentPromises.length} attachments...`)
      await Promise.allSettled(attachmentPromises)
      console.log('All attachments processed')
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

    // 为每个角色创建独立的sheet
    let hasAnyRoleData = false
    playerRoles.forEach(role => {
      const roleData = roleSheetData.get(role.id)
      if (roleData && roleData.length > 0) {
        hasAnyRoleData = true
        const roleSheet = XLSX.utils.json_to_sheet(roleData)
        const roleColWidths = Object.keys(roleData[0] || {}).map(() => ({ wch: 15 }))
        roleSheet['!cols'] = roleColWidths
        // 使用角色名称作为sheet名称（需保证合法且唯一）
        const sheetName = roleSheetNames.get(role.id) || ensureUniqueSheetName(String(role.name || role.id), usedSheetNames, '队员信息')
        XLSX.utils.book_append_sheet(wb, roleSheet, sheetName)
      }
    })

    // 如果没有数据，创建一个空sheet
    if (teamSheetData.length === 0 && !hasAnyRoleData) {
      const emptySheet = XLSX.utils.json_to_sheet([{ '信息': '暂无数据' }])
      XLSX.utils.book_append_sheet(wb, emptySheet, '报名信息')
    }

    // 生成Excel文件
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // 决定文件名
    let fileName = '报名信息导出'
    if (registrations.length === 1) {
      const teamData = registrations[0].team_data || {}
      const teamName = teamData['队伍名称'] || teamData['name'] || teamData['团队名称'] || teamData['队名'] || '报名信息'
      fileName = teamName
    }

    // 如果有附件，返回zip文件
    if (zip && hasAttachments) {
      // 添加Excel文件到zip
      zip.file(`${fileName}.xlsx`, excelBuffer)

      // 生成zip文件
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

      // 返回zip文件
      return new NextResponse(zipBuffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}.zip"`,
        },
      })
    } else {
      // 没有附件，直接返回Excel
      return new NextResponse(excelBuffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}.xlsx"`,
        },
      })
    }
  } catch (error: any) {
    console.error('导出失败:', error)
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack
    })
    return NextResponse.json(
      { success: false, error: error?.message || '导出失败' },
      { status: 500 }
    )
  }
}
