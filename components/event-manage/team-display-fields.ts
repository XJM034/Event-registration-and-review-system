export interface TeamDisplayField {
  id: string
  label: string
  type?: string
}

export const DEFAULT_GROUP_FIELD: TeamDisplayField = { id: 'participationGroup', label: '组别' }

export const DEFAULT_TEAM_FIELDS: TeamDisplayField[] = [
  DEFAULT_GROUP_FIELD,
  { id: 'unit', label: '参赛单位' },
  { id: 'name', label: '队伍名称' },
  { id: 'contact', label: '联系人' },
]

export const GROUP_FIELD_LABELS = ['组别', '队伍组别']

const PRIORITY_FIELD_IDS = ['group', 'unit', 'name', 'contact'] as const

function normalizeGroupField(field: TeamDisplayField): TeamDisplayField {
  if (field.id === 'group' || field.id === DEFAULT_GROUP_FIELD.id || GROUP_FIELD_LABELS.includes(field.label)) {
    return {
      ...field,
      id: DEFAULT_GROUP_FIELD.id,
      label: DEFAULT_GROUP_FIELD.label,
    }
  }

  return field
}

function getComparableFieldId(field: TeamDisplayField): string {
  return normalizeGroupField(field).id
}

export function buildPrioritizedTeamFields(fields: TeamDisplayField[]): TeamDisplayField[] {
  if (fields.length === 0) {
    return DEFAULT_TEAM_FIELDS
  }

  const priorityFields = PRIORITY_FIELD_IDS
    .map((id) => {
      if (id === 'group') {
        const groupField = fields.find((field) =>
          field.id === 'group' ||
          field.id === DEFAULT_GROUP_FIELD.id ||
          GROUP_FIELD_LABELS.includes(field.label)
        )

        return groupField ? normalizeGroupField(groupField) : DEFAULT_GROUP_FIELD
      }

      return fields.find((field) => field.id === id)
    })
    .filter((field): field is TeamDisplayField => field !== undefined)

  if (priorityFields.length >= 4) {
    return priorityFields
  }

  const usedFieldIds = new Set(priorityFields.map(getComparableFieldId))
  const otherFields = fields
    .filter((field) => !['image', 'attachment', 'attachments'].includes(field.type || ''))
    .filter((field) => !usedFieldIds.has(getComparableFieldId(field)))
    .slice(0, 4 - priorityFields.length)
    .map(normalizeGroupField)

  return [...priorityFields, ...otherFields]
}

export function getTeamFieldValue(teamData: Record<string, unknown>, field: TeamDisplayField) {
  if (getComparableFieldId(field) === DEFAULT_GROUP_FIELD.id) {
    return teamData?.participationGroup ?? teamData?.group ?? teamData?.division_name ?? teamData?.divisionName ?? '-'
  }

  return teamData?.[field.id]
}
