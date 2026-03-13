import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession } from '@/lib/auth'
import { buildWorkbookBuffer, type WorkbookSheetInput } from '@/lib/excel-workbook'
import { applyExportFieldFilters, parseExportRequest, resolveRoleForExport } from '@/lib/export/export-route-utils'
import { applyRateLimitHeaders, buildRateLimitKey, takeRateLimit } from '@/lib/rate-limit'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'
import { applySensitiveResponseHeaders } from '@/lib/sensitive-response-headers'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { collectStorageObjectRefs, type StorageObjectRef } from '@/lib/storage-object'
import type { UploadBucket } from '@/lib/upload-file-validation'
import JSZip from 'jszip'

interface RouteParams {
  params: Promise<{ id: string }>
}

const INVALID_SHEET_CHARS = /[:\\/?*\[\]]/g
const INVALID_PATH_CHARS = /[\\/?%*:|"<>]/g
const EXPORT_REGISTRATION_COLUMNS = 'id, team_data, players_data, submitted_at'
const EXPORT_SETTINGS_COLUMNS = 'division_id, team_requirements, player_requirements'
const EXPORT_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
}

type ExportDivisionRow = {
  id: string
  name: string
}

type ExportRegistrationRow = {
  id: string
  team_data?: Record<string, any> | null
  players_data?: any[] | null
  submitted_at?: string | null
  division?: ExportDivisionRow | null
}

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

const inferExtensionFromRef = (
  ref: StorageObjectRef,
  blobType?: string,
) => {
  const pathExtension = ref.path.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase()
  if (pathExtension) return pathExtension

  const contentType = blobType || ''
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('gif')) return 'gif'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('pdf')) return 'pdf'
  if (contentType.includes('wordprocessingml')) return 'docx'
  if (contentType.includes('msword')) return 'doc'
  if (contentType.includes('spreadsheetml')) return 'xlsx'
  if (contentType.includes('ms-excel')) return 'xls'
  return 'bin'
}

const downloadStorageObject = async (
  supabase: ReturnType<typeof createServiceRoleClient>,
  ref: StorageObjectRef,
) => {
  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .download(ref.path)

  if (error || !data) {
    throw error || new Error('Storage download failed')
  }

  return {
    arrayBuffer: await data.arrayBuffer(),
    extension: inferExtensionFromRef(ref, data.type),
  }
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

function createSensitiveExportJsonResponse(
  body: unknown,
  init?: ResponseInit,
  rateLimit?: ReturnType<typeof takeRateLimit>,
) {
  const response = NextResponse.json(body, init)
  applySensitiveResponseHeaders(response.headers)
  if (rateLimit) {
    applyRateLimitHeaders(response.headers, rateLimit)
  }
  return response
}

export async function POST(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { id: eventId } = await context.params

    const session = await getCurrentAdminSession()
    const actorRole = session?.user?.is_super === true ? 'super_admin' : 'admin'
    if (!session) {
      await writeSecurityAuditLog({
        request,
        action: 'export_registrations',
        actorType: 'admin',
        actorRole: 'admin',
        resourceType: 'event',
        resourceId: eventId,
        eventId,
        result: 'denied',
        reason: 'unauthorized',
      })
      return createSensitiveExportJsonResponse(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const rateLimit = takeRateLimit({
      key: buildRateLimitKey({
        request,
        scope: 'registrations:export',
        subject: session.user.id,
      }),
      limit: 6,
      windowMs: 10 * 60_000,
    })

    if (!rateLimit.allowed) {
      await writeSecurityAuditLog({
        request,
        action: 'export_registrations',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'event',
        resourceId: eventId,
        eventId,
        result: 'denied',
        reason: 'rate_limited',
      })
      return createSensitiveExportJsonResponse(
        { success: false, error: '导出过于频繁，请稍后再试' },
        { status: 429 },
        rateLimit,
      )
    }

    const rawBody: unknown = await request.json().catch(() => null)
    const body = parseExportRequest(rawBody)
    if (!body) {
      await writeSecurityAuditLog({
        request,
        action: 'export_registrations',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'event',
        resourceId: eventId,
        eventId,
        result: 'failed',
        reason: 'invalid_request_body',
      })
      return createSensitiveExportJsonResponse(
        { success: false, error: '请求参数无效' },
        { status: 400 },
        rateLimit,
      )
    }
    const { registrationIds, config } = body

    const supabase = createServiceRoleClient()

    // 获取赛事信息
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('name')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      console.error('获取赛事信息失败:', eventError)
      await writeSecurityAuditLog({
        request,
        action: 'export_registrations',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'event',
        resourceId: eventId,
        eventId,
        result: 'failed',
        reason: 'event_lookup_failed',
      })
      return createSensitiveExportJsonResponse(
        { success: false, error: '获取赛事信息失败' },
        { status: 500 },
        rateLimit,
      )
    }

    // 构建查询条件
    let query = supabase
      .from('registrations')
      .select(EXPORT_REGISTRATION_COLUMNS)
      .eq('event_id', eventId)

    // 根据 exportScope 添加条件
    if (config.exportScope === 'selected') {
      if (!registrationIds || registrationIds.length === 0) {
        await writeSecurityAuditLog({
          request,
          action: 'export_registrations',
          actorType: 'admin',
          actorId: session.user.id,
          actorRole,
          resourceType: 'event',
          resourceId: eventId,
          eventId,
          result: 'failed',
          reason: 'selected_export_missing_registration_ids',
          metadata: {
            export_scope: config.exportScope,
          },
        })
        return createSensitiveExportJsonResponse(
          { success: false, error: '请选择要导出的报名信息' },
          { status: 400 },
          rateLimit,
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
      await writeSecurityAuditLog({
        request,
        action: 'export_registrations',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'event',
        resourceId: eventId,
        eventId,
        result: 'failed',
        reason: 'registrations_query_failed',
        metadata: {
          export_scope: config.exportScope,
        },
      })
      return createSensitiveExportJsonResponse(
        { success: false, error: '获取报名信息失败' },
        { status: 500 },
        rateLimit,
      )
    }

    const exportRegistrations: ExportRegistrationRow[] = (registrations || []).map((registration) => ({
      ...registration,
    }))

    if (exportRegistrations.length === 0) {
      await writeSecurityAuditLog({
        request,
        action: 'export_registrations',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'event',
        resourceId: eventId,
        eventId,
        result: 'failed',
        reason: 'no_registrations_found',
        metadata: {
          export_scope: config.exportScope,
        },
      })
      return createSensitiveExportJsonResponse(
        { success: false, error: '未找到报名信息' },
        { status: 404 },
        rateLimit,
      )
    }

    // 获取组别信息（从 team_data.division_id）
    const divisionIds = [...new Set(
      exportRegistrations
        .map(r => r.team_data?.division_id)
        .filter(Boolean)
    )]

    let divisionMap = new Map<string, ExportDivisionRow>()
    if (divisionIds.length > 0) {
      const { data: divisions } = await supabase
        .from('divisions')
        .select('id, name')
        .in('id', divisionIds)
      divisionMap = new Map(divisions?.map(d => [d.id, d]) || [])
    }

    // 将组别信息附加到报名数据
    exportRegistrations.forEach((reg) => {
      const divisionId = reg.team_data?.division_id
      reg.division = divisionId ? divisionMap.get(divisionId) : null
    })

    // 根据 groupBy 排序
    if (config.groupBy === 'division') {
      exportRegistrations.sort((a, b) => {
        const aDiv = a.division?.name || '未分组'
        const bDiv = b.division?.name || '未分组'
        return aDiv.localeCompare(bDiv, 'zh-CN')
      })
    } else if (config.groupBy === 'unit') {
      exportRegistrations.sort((a, b) => {
        const aUnit = a.team_data?.unit || a.team_data?.['参赛单位'] || '未知单位'
        const bUnit = b.team_data?.unit || b.team_data?.['参赛单位'] || '未知单位'
        return aUnit.localeCompare(bUnit, 'zh-CN')
      })
    } else if (config.groupBy === 'division_unit') {
      exportRegistrations.sort((a, b) => {
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
      .select(EXPORT_SETTINGS_COLUMNS)
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

    exportRegistrations.forEach((reg) => {
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
        const usedSheetNames = new Set<string>()
        const workbookSheets: WorkbookSheetInput[] = []

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
            const fallbackBucket: UploadBucket =
              fieldKey === 'team_logo' ? 'registration-files' : 'team-documents'
            const refs = collectStorageObjectRefs(fieldValue, fallbackBucket)
            if (refs.length > 0) {
              const fieldLabel = field.label || field.id
              const safeFieldLabel = sanitizePathSegment(String(fieldLabel), '字段')
              refs.forEach((ref, refIndex) => {
                attachmentPromises.push(
                  (async () => {
                    try {
                      const { arrayBuffer, extension } = await downloadStorageObject(supabase, ref)
                      const fileName = refs.length > 1 ? `${safeFieldLabel}-${refIndex + 1}.${extension}` : `${safeFieldLabel}.${extension}`
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

        workbookSheets.push({
          name: '队伍信息',
          rows: [teamRow],
        })

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
              const fallbackBucket: UploadBucket =
                field.type === 'image' ? 'player-photos' : 'team-documents'
              const refs = collectStorageObjectRefs(player[field.id], fallbackBucket)
              if (refs.length > 0) {
                const fieldLabel = field.label || field.id
                const playerName = player['姓名'] || player['name'] || `${currentRole.name}${currentCount}`
                const safeRoleName = sanitizePathSegment(String(currentRole.name || currentRole.id), '角色')
                const safeFieldLabel = sanitizePathSegment(String(fieldLabel), '字段')
                const safePlayerName = sanitizePathSegment(String(playerName), '队员')
                refs.forEach((ref, refIndex) => {
                  attachmentPromises.push(
                    (async () => {
                      try {
                        const { arrayBuffer, extension } = await downloadStorageObject(supabase, ref)
                        const fileName = refs.length > 1 ? `${safePlayerName}-${refIndex + 1}.${extension}` : `${safePlayerName}.${extension}`
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
            const sheetName = ensureUniqueSheetName(String(role.name || role.id), usedSheetNames, '队员信息')
            workbookSheets.push({
              name: sheetName,
              rows: roleData,
            })
          }
        })

        // 生成 Excel 文件
        const excelBuffer = await buildWorkbookBuffer(workbookSheets)
        const excelFileName = `${teamFolderName}_报名信息.xlsx`
        zip.file(`${teamBasePath}/${excelFileName}`, excelBuffer)
      }
    }

    // 等待所有附件下载完成
    if (attachmentPromises.length > 0) {
      await Promise.allSettled(attachmentPromises)
    }

    // 生成 zip 文件
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    // 生成文件名
    const dateStr = new Date().toISOString().split('T')[0]
    const zipFileName = `${config.fileNamePrefix || event.name}_报名信息_${dateStr}.zip`

    // 返回 zip 文件
    const response = new NextResponse(zipBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(zipFileName)}"`,
        ...EXPORT_NO_STORE_HEADERS,
      },
    })
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    applyRateLimitHeaders(response.headers, rateLimit)

    await writeSecurityAuditLog({
      request,
      action: 'export_registrations',
      actorType: 'admin',
      actorId: session.user.id,
      actorRole,
      resourceType: 'event',
      resourceId: eventId,
      eventId,
      result: 'success',
      metadata: {
        export_scope: config.exportScope,
        group_by: config.groupBy,
        registration_count: exportRegistrations.length,
        file_name_prefix: config.fileNamePrefix || null,
      },
    })

    return response
  } catch (error: any) {
    console.error('导出失败:', error)
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack
    })
    return createSensitiveExportJsonResponse(
      { success: false, error: '导出失败，请稍后重试' },
      { status: 500 }
    )
  }
}
