export interface ExportConfig {
  exportScope: 'selected' | 'approved' | 'pending' | 'all'
  teamFields?: string[]
  playerFields?: string[]
  groupBy: 'none' | 'division' | 'unit' | 'division_unit'
  fileNamePrefix?: string
}

export interface ExportRequest {
  registrationIds?: string[]
  config: ExportConfig
}

export interface ExportField {
  id: string
  label?: string
  type?: string
}

export interface ExportRole {
  id: string
  name?: string
  allFields?: ExportField[]
  commonFields?: ExportField[]
  customFields?: ExportField[]
}

const EXPORT_SCOPES: ExportConfig['exportScope'][] = ['selected', 'approved', 'pending', 'all']
const GROUP_BY_OPTIONS: ExportConfig['groupBy'][] = ['none', 'division', 'unit', 'division_unit']
const TEAM_FIELD_PRIORITY = ['unit', 'name', 'contact', 'phone', 'logo']
const PLAYER_FIELD_PRIORITY = [
  'name',
  'gender',
  'age',
  'player_number',
  'contact',
  'id_type',
  'id_number',
  'emergency_contact',
  'contact_phone',
  'id_photo',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

export const parseExportRequest = (value: unknown): ExportRequest | null => {
  if (!isRecord(value) || !isRecord(value.config)) return null

  const rawConfig = value.config
  const exportScope = rawConfig.exportScope
  const groupBy = rawConfig.groupBy

  if (typeof exportScope !== 'string' || !EXPORT_SCOPES.includes(exportScope as ExportConfig['exportScope'])) {
    return null
  }
  if (typeof groupBy !== 'string' || !GROUP_BY_OPTIONS.includes(groupBy as ExportConfig['groupBy'])) {
    return null
  }

  const hasTeamFields = Object.prototype.hasOwnProperty.call(rawConfig, 'teamFields')
  const hasPlayerFields = Object.prototype.hasOwnProperty.call(rawConfig, 'playerFields')

  if (hasTeamFields && !isStringArray(rawConfig.teamFields)) return null
  if (hasPlayerFields && !isStringArray(rawConfig.playerFields)) return null

  const registrationIds = isStringArray(value.registrationIds) ? value.registrationIds : undefined
  const fileNamePrefix = typeof rawConfig.fileNamePrefix === 'string' ? rawConfig.fileNamePrefix : undefined

  return {
    registrationIds,
    config: {
      exportScope: exportScope as ExportConfig['exportScope'],
      groupBy: groupBy as ExportConfig['groupBy'],
      teamFields: hasTeamFields ? (rawConfig.teamFields as string[]) : undefined,
      playerFields: hasPlayerFields ? (rawConfig.playerFields as string[]) : undefined,
      fileNamePrefix,
    },
  }
}

const normalizeRoleFields = (role: ExportRole): ExportField[] =>
  role.allFields || [
    ...(role.commonFields || []),
    ...(role.customFields || []),
  ]

const sortFieldsByPriority = <T extends ExportField>(
  fields: T[],
  priority: string[]
): T[] => {
  const priorityIndex = new Map(priority.map((fieldId, index) => [fieldId, index]))

  return [...fields].sort((a, b) => {
    const aRank = priorityIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const bRank = priorityIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER

    if (aRank !== bRank) return aRank - bRank

    const aLabel = typeof a.label === 'string' && a.label.trim() ? a.label.trim() : a.id
    const bLabel = typeof b.label === 'string' && b.label.trim() ? b.label.trim() : b.id
    const labelCompare = aLabel.localeCompare(bLabel, 'zh-CN')
    if (labelCompare !== 0) return labelCompare

    return a.id.localeCompare(b.id, 'zh-CN')
  })
}

export const sortTeamFieldsForExport = <T extends ExportField>(fields: T[]) =>
  sortFieldsByPriority(fields, TEAM_FIELD_PRIORITY)

export const sortPlayerFieldsForExport = <T extends ExportField>(fields: T[]) =>
  sortFieldsByPriority(fields, PLAYER_FIELD_PRIORITY)

export const applyExportFieldFilters = (
  allTeamFields: ExportField[],
  allPlayerRoles: ExportRole[],
  config: ExportConfig
) => {
  const sortedTeamFields = sortTeamFieldsForExport(allTeamFields)
  const nextTeamFields =
    config.teamFields === undefined
      ? sortedTeamFields
      : sortedTeamFields.filter((field) => config.teamFields!.includes(field.id))

  const nextPlayerRoles = allPlayerRoles.map((role) => {
    const roleFields = sortPlayerFieldsForExport(normalizeRoleFields(role))
    const nextFields =
      config.playerFields === undefined
        ? roleFields
        : roleFields.filter((field) => config.playerFields!.includes(field.id))

    return {
      ...role,
      allFields: nextFields,
    }
  })

  return {
    teamFields: nextTeamFields,
    playerRoles: nextPlayerRoles,
  }
}

export const resolveRoleForExport = (
  rawRoleId: string,
  rolesById: Map<string, ExportRole>,
  fallbackRole?: ExportRole
) => {
  const role = rolesById.get(rawRoleId) || fallbackRole
  if (!role) {
    return {
      role: undefined,
      effectiveRoleId: rawRoleId,
    }
  }

  return {
    role,
    effectiveRoleId: role.id || rawRoleId,
  }
}
