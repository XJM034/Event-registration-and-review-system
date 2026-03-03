import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'
import { applyExportFieldFilters, parseExportRequest, resolveRoleForExport } from '@/lib/export/export-route-utils'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'

interface RouteParams {
  params: Promise<{ id: string }>
}

const INVALID_SHEET_CHARS = /[:\\/?*\[\]]/g
const INVALID_PATH_CHARS = /[\\/?%*:|"<>]/g

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

const extractFileUrls = (value: unknown): string[] => {
  if (!value) return []
  if (typeof value === 'string' && value.startsWith('http')) return [value]
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'object' && item && 'url' in item ? (item as any).url : null))
      .filter((url): url is string => typeof url === 'string' && url.startsWith('http'))
  }
  if (typeof value === 'object' && value && 'url' in value) {
    const url = (value as any).url
    if (typeof url === 'string' && url.startsWith('http')) return [url]
  }
  return []
}

const ensureUniqueFolderName = (baseName: string, used: Set<string>): string => {
  let name = baseName
  let counter = 2
  while (used.has(name)) {
    name = `${baseName}-${counter}`
    counter += 1
  }
  used.add(name)
  return name
}

export async function POST(
  request: NextRequest,
  context: RouteParams
) {
  console.log('Export route called')
  try {
    const { id: eventId } = await context.params
    console.log('Event ID:', eventId)

    const session = await getCurrentAdminSession()
    console.log('Session:', session ? 'Valid' : 'Invalid')
    if (!session) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const rawBody: unknown = await request.json().catch(() => null)
    const body = parseExportRequest(rawBody)
    if (!body) {
      return NextResponse.json(
        { success: false, error: '请求参数无效' },
        { status: 400 }
      )
    }
    const { registrationIds, config } = body
    console.log('Export config:', config)

    const supabase = await createSupabaseServer()

    // 获取赛事信息
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('name')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      console.error('获取赛事信息失败:', eventError)
      return NextResponse.json(
        { success: false, error: '获取赛事信息失败' },
        { status: 500 }
      )
    }

    // 构建查询条件
    let query = supabase
      .from('registrations')
      .select('*')
      .eq('event_id', eventId)

    // 根据 exportScope 添加条件
    if (config.exportScope === 'selected') {
      if (!registrationIds || registrationIds.length === 0) {
        return NextResponse.json(
          { success: false, error: '请选择要导出的报名信息' },
          { status: 400 }
        )
      }
      query = query.in('id', registrationIds)
    } else if (config.exportScope === 'approved') {
      query = query.eq('status', 'approved')
    } else if (config.exportScope === 'pending') {
      query = query.in('status', ['pending', 'submitted'])
    } else if (config.exportScope === 'all') {
      query = query.neq('status', 'draft')
    }

    query = query.order('submitted_at', { ascending: true })

    const { data: registrations, error } = await query

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

    console.log(`Found ${registrations.length} registrations to export`)

    // 获取组别信息（从 team_data.division_id）
    const divisionIds = [...new Set(
      registrations
        .map(r => r.team_data?.division_id)
        .filter(Boolean)
    )]

    let divisionMap = new Map()
    if (divisionIds.length > 0) {
      const { data: divisions } = await supabase
        .from('divisions')
        .select('id, name')
        .in('id', divisionIds)
      divisionMap = new Map(divisions?.map(d => [d.id, d]) || [])
    }

    // 将组别信息附加到报名数据
    registrations.forEach((reg: any) => {
      const divisionId = reg.team_data?.division_id
      reg.division = divisionId ? divisionMap.get(divisionId) : null
    })

    // 根据 groupBy 排序
    if (config.groupBy === 'division') {
      registrations.sort((a, b) => {
        const aDiv = a.division?.name || '未分组'
        const bDiv = b.division?.name || '未分组'
        return aDiv.localeCompare(bDiv, 'zh-CN')
      })
    } else if (config.groupBy === 'unit') {
      registrations.sort((a, b) => {
        const aUnit = a.team_data?.unit || a.team_data?.['参赛单位'] || '未知单位'
        const bUnit = b.team_data?.unit || b.team_data?.['参赛单位'] || '未知单位'
        return aUnit.localeCompare(bUnit, 'zh-CN')
      })
    } else if (config.groupBy === 'division_unit') {
      registrations.sort((a, b) => {
        const aDiv = a.division?.name || '未分组'
        const bDiv = b.division?.name || '未分组'
        if (aDiv !== bDiv) return aDiv.localeCompare(bDiv, 'zh-CN')

        const aUnit = a.team_data?.unit || a.team_data?.['参赛单位'] || '未知单位'
        const bUnit = b.team_data?.unit || b.team_data?.['参赛单位'] || '未知单位'
        return aUnit.localeCompare(bUnit, 'zh-CN')
      })
    }

    // 获取报名设置以了解字段配置
    const { data: settings } = await supabase
      .from('registration_settings')
      .select('*')
      .eq('event_id', eventId)

    // 合并所有组别的字段配置
    let allTeamFields: any[] = []
    let allPlayerRoles: any[] = []
    const teamFieldsSet = new Set<string>()
    const playerFieldsSet = new Set<string>()

    if (settings && settings.length > 0) {
      settings.forEach(setting => {
        if (setting.team_requirements) {
          const teamReq = setting.team_requirements
          const fields = teamReq.allFields || [
            ...(teamReq.commonFields || []),
            ...(teamReq.customFields || [])
          ]
          fields.forEach((f: any) => {
            if (!teamFieldsSet.has(f.id)) {
              teamFieldsSet.add(f.id)
              allTeamFields.push(f)
            }
          })
        }

        if (setting.player_requirements?.roles) {
          setting.player_requirements.roles.forEach((role: any) => {
            const existingRole = allPlayerRoles.find(r => r.id === role.id)
            if (!existingRole) {
              allPlayerRoles.push(role)
            } else {
              // 合并字段
              const fields = role.allFields || [
                ...(role.commonFields || []),
                ...(role.customFields || [])
              ]
              fields.forEach((f: any) => {
                const roleFieldKey = `${role.id}:${f.id}`
                if (!playerFieldsSet.has(roleFieldKey)) {
                  playerFieldsSet.add(roleFieldKey)
                  if (!existingRole.allFields) existingRole.allFields = []
                  existingRole.allFields.push(f)
                }
              })
            }
          })
        }
      })
    }

    // 如果没有配置，使用默认
    if (allTeamFields.length === 0) {
      allTeamFields = []
    }

    if (allPlayerRoles.length === 0) {
      allPlayerRoles = [{
        id: 'player',
        name: '队员信息',
        allFields: []
      }]
    }

    // 应用字段过滤
    const filteredFields = applyExportFieldFilters(allTeamFields, allPlayerRoles, config)
    allTeamFields = filteredFields.teamFields as any[]
    allPlayerRoles = filteredFields.playerRoles as any[]

    // 创建 zip 对象（统一使用 zip 格式）
    const zip = new JSZip()
    const attachmentPromises: Promise<void>[] = []

    // 按分组处理报名数据
    const groupedRegistrations = new Map<string, any[]>()

    registrations.forEach((reg: any) => {
      let groupKey = ''

      if (config.groupBy === 'none') {
        groupKey = 'root'
      } else if (config.groupBy === 'division') {
        const divisionName = reg.division?.name || '未分组'
        groupKey = sanitizePathSegment(divisionName, '未分组')
      } else if (config.groupBy === 'unit') {
        const unitName = reg.team_data?.unit || reg.team_data?.['参赛单位'] || '未知单位'
        groupKey = sanitizePathSegment(unitName, '未知单位')
      } else if (config.groupBy === 'division_unit') {
        const divisionName = reg.division?.name || '未分组'
        const unitName = reg.team_data?.unit || reg.team_data?.['参赛单位'] || '未知单位'
        groupKey = `${sanitizePathSegment(divisionName, '未分组')}/${sanitizePathSegment(unitName, '未知单位')}`
      }

      if (!groupedRegistrations.has(groupKey)) {
        groupedRegistrations.set(groupKey, [])
      }
      groupedRegistrations.get(groupKey)!.push(reg)
    })

    console.log(`Grouped into ${groupedRegistrations.size} groups`)

    // 处理每个分组
    for (const [groupPath, groupRegs] of groupedRegistrations.entries()) {
      const groupUsedFolderNames = new Set<string>()

      for (let index = 0; index < groupRegs.length; index++) {
        const registration = groupRegs[index]
        const teamData = registration.team_data || {}
        const playersData = registration.players_data || []

        // 生成队伍文件夹名称
        let teamFolderName = teamData['队伍名称']
          || teamData['name']
          || teamData['团队名称']
          || teamData['队名']

        if (!teamFolderName) {
          // 使用前三个非附件字段
          const firstThreeFields = allTeamFields.slice(0, 3)
          const folderNameParts: string[] = []
          firstThreeFields.forEach(field => {
            if (!['image', 'attachment', 'attachments'].includes(field.type)) {
              const value = teamData[field.id]
              if (value) {
                folderNameParts.push(String(value))
              }
            }
          })
          teamFolderName = folderNameParts.length > 0 ? folderNameParts.join('-') : `队伍${index + 1}`
        }

        teamFolderName = sanitizePathSegment(teamFolderName, `队伍${index + 1}`)
        teamFolderName = ensureUniqueFolderName(teamFolderName, groupUsedFolderNames)

        const teamBasePath = groupPath === 'root' ? teamFolderName : `${groupPath}/${teamFolderName}`

        // 生成队伍 Excel
        const wb = XLSX.utils.book_new()
        const usedSheetNames = new Set<string>()

        // 队伍信息 sheet
        const teamRow: any = { '序号': index + 1 }

        allTeamFields.forEach(field => {
          // Logo 字段特殊处理：前端保存时使用 team_logo 作为 key
          let fieldKey = field.id
          if (field.type === 'image' && (field.id === 'logo' || field.id === 'team_logo')) {
            fieldKey = 'team_logo'
          }

          const fieldValue = teamData[fieldKey]

          if (['image', 'attachment', 'attachments'].includes(field.type)) {
            // 处理附件
            const urls = extractFileUrls(fieldValue)
            if (urls.length > 0) {
              const fieldLabel = field.label || field.id
              const safeFieldLabel = sanitizePathSegment(String(fieldLabel), '字段')
              urls.forEach((url, urlIndex) => {
                attachmentPromises.push(
                  (async () => {
                    try {
                      const response = await fetch(url)
                      if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                      }
                      const arrayBuffer = await response.arrayBuffer()
                      let extension = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1]?.toLowerCase()
                      if (!extension) {
                        const contentType = response.headers.get('content-type') || ''
                        if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = 'jpg'
                        else if (contentType.includes('png')) extension = 'png'
                        else if (contentType.includes('gif')) extension = 'gif'
                        else if (contentType.includes('webp')) extension = 'webp'
                        else if (contentType.includes('pdf')) extension = 'pdf'
                        else extension = 'bin'
                      }
                      const fileName = urls.length > 1 ? `${safeFieldLabel}-${urlIndex + 1}.${extension}` : `${safeFieldLabel}.${extension}`
                      const filePath = `${teamBasePath}/队伍附件/${fileName}`
                      zip.file(filePath, arrayBuffer)
                    } catch (err) {
                      console.error(`Failed to download team attachment:`, err)
                    }
                  })()
                )
              })
            }
          } else {
            teamRow[field.label] = fieldValue || ''
          }
        })

        const teamSheet = XLSX.utils.json_to_sheet([teamRow])
        XLSX.utils.book_append_sheet(wb, teamSheet, '队伍信息')

        // 队员信息 sheets（按角色）
        const rolesById = new Map(allPlayerRoles.map(role => [role.id, role]))
        const roleSheetData: Map<string, any[]> = new Map()
        allPlayerRoles.forEach(role => {
          roleSheetData.set(role.id, [])
        })

        const roleCounters: Map<string, number> = new Map()

        playersData.forEach((player: any) => {
          const rawRoleId = player.role || player.roleId || 'player'
          const { role: currentRole, effectiveRoleId } = resolveRoleForExport(rawRoleId, rolesById, allPlayerRoles[0])
          if (!currentRole) return

          const currentCount = (roleCounters.get(effectiveRoleId) || 0) + 1
          roleCounters.set(effectiveRoleId, currentCount)

          const playerRow: any = {
            '序号': `${index + 1}-${currentCount}`,
            '所属队伍': teamFolderName
          }

          const playerFields = currentRole.allFields || []
          playerFields.forEach((field: any) => {
            if (['image', 'attachment', 'attachments'].includes(field.type)) {
              const urls = extractFileUrls(player[field.id])
              if (urls.length > 0) {
                const fieldLabel = field.label || field.id
                const playerName = player['姓名'] || player['name'] || `${currentRole.name}${currentCount}`
                const safeRoleName = sanitizePathSegment(String(currentRole.name || currentRole.id), '角色')
                const safeFieldLabel = sanitizePathSegment(String(fieldLabel), '字段')
                const safePlayerName = sanitizePathSegment(String(playerName), '队员')
                urls.forEach((url, urlIndex) => {
                  attachmentPromises.push(
                    (async () => {
                      try {
                        const response = await fetch(url)
                        if (!response.ok) {
                          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                        }
                        const arrayBuffer = await response.arrayBuffer()
                        let extension = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1]?.toLowerCase()
                        if (!extension) {
                          const contentType = response.headers.get('content-type') || ''
                          if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = 'jpg'
                          else if (contentType.includes('png')) extension = 'png'
                          else if (contentType.includes('gif')) extension = 'gif'
                          else if (contentType.includes('webp')) extension = 'webp'
                          else if (contentType.includes('pdf')) extension = 'pdf'
                          else extension = 'bin'
                        }
                        const fileName = urls.length > 1 ? `${safePlayerName}-${urlIndex + 1}.${extension}` : `${safePlayerName}.${extension}`
                        const filePath = `${teamBasePath}/人员附件/${safeRoleName}-${safeFieldLabel}/${fileName}`
                        zip.file(filePath, arrayBuffer)
                      } catch (err) {
                        console.error(`Failed to download player attachment:`, err)
                      }
                    })()
                  )
                })
              }
            } else {
              playerRow[field.label] = player[field.id] || ''
            }
          })

          if (!roleSheetData.has(effectiveRoleId)) {
            roleSheetData.set(effectiveRoleId, [])
          }
          roleSheetData.get(effectiveRoleId)!.push(playerRow)
        })

        // 添加角色 sheets
        allPlayerRoles.forEach(role => {
          const roleData = roleSheetData.get(role.id)
          if (roleData && roleData.length > 0) {
            const roleSheet = XLSX.utils.json_to_sheet(roleData)
            const sheetName = ensureUniqueSheetName(String(role.name || role.id), usedSheetNames, '队员信息')
            XLSX.utils.book_append_sheet(wb, roleSheet, sheetName)
          }
        })

        // 生成 Excel 文件
        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
        const excelFileName = `${teamFolderName}_报名信息.xlsx`
        zip.file(`${teamBasePath}/${excelFileName}`, excelBuffer)
      }
    }

    // 等待所有附件下载完成
    if (attachmentPromises.length > 0) {
      console.log(`Downloading ${attachmentPromises.length} attachments...`)
      await Promise.allSettled(attachmentPromises)
      console.log('All attachments processed')
    }

    // 生成 zip 文件
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    // 生成文件名
    const dateStr = new Date().toISOString().split('T')[0]
    const zipFileName = `${config.fileNamePrefix || event.name}_报名信息_${dateStr}.zip`

    // 返回 zip 文件
    return new NextResponse(zipBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(zipFileName)}"`,
      },
    })
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
