import type { EventReferenceTemplate, ReferenceTemplateType } from './types'

export const SPECIAL_REFERENCE_TEMPLATE_TYPES: ReferenceTemplateType[] = [
  'registration_form',
  'athlete_info_form',
]

export const REFERENCE_TEMPLATE_TYPE_OPTIONS: Array<{
  value: ReferenceTemplateType
  label: string
}> = [
  { value: 'generic', label: '普通模板' },
  { value: 'registration_form', label: '报名表' },
  { value: 'athlete_info_form', label: '运动员信息表' },
]

export function inferReferenceTemplateType(name?: string | null): ReferenceTemplateType {
  const normalized = String(name || '').toLowerCase()

  if (normalized.includes('报名表')) {
    return 'registration_form'
  }

  if (normalized.includes('运动员信息表')) {
    return 'athlete_info_form'
  }

  return 'generic'
}

export function normalizeReferenceTemplateType(type?: string | null, name?: string | null): ReferenceTemplateType {
  if (type === 'registration_form' || type === 'athlete_info_form' || type === 'generic') {
    return type
  }

  return inferReferenceTemplateType(name)
}

export function getReferenceTemplateTypeLabel(type?: ReferenceTemplateType | string | null): string {
  switch (type) {
    case 'registration_form':
      return '报名表'
    case 'athlete_info_form':
      return '运动员信息表'
    default:
      return '普通模板'
  }
}

export function normalizeReferenceTemplate(
  template: Partial<EventReferenceTemplate> | null | undefined,
): EventReferenceTemplate | null {
  if (!template) return null

  const name = String(template.name || '').trim()
  const path = String(template.path || '').trim()
  const url = String(template.url || '').trim()

  if (!name && !path && !url) {
    return null
  }

  return {
    name: name || path || url || '未命名模板',
    path,
    url,
    size: Number(template.size || 0),
    mimeType: String(template.mimeType || ''),
    uploadedAt: String(template.uploadedAt || ''),
    templateType: normalizeReferenceTemplateType(template.templateType, name),
  }
}

export function parseReferenceTemplates(value: unknown): EventReferenceTemplate[] {
  let parsed: unknown = value

  if (!parsed) return []

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return []
    }
  }

  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed
    .map((item) => normalizeReferenceTemplate(item as Partial<EventReferenceTemplate>))
    .filter((item): item is EventReferenceTemplate => Boolean(item))
}

export function findReferenceTemplateByType(
  templates: EventReferenceTemplate[],
  templateType: ReferenceTemplateType,
): EventReferenceTemplate | null {
  const normalizedTemplates = templates.map((template) => ({
    ...template,
    templateType: normalizeReferenceTemplateType(template.templateType, template.name),
  }))

  const matchedByType = normalizedTemplates.find((template) => template.templateType === templateType)
  if (matchedByType) return matchedByType

  const matchedByName = normalizedTemplates.find(
    (template) => inferReferenceTemplateType(template.name) === templateType,
  )
  return matchedByName || null
}

export function findDuplicateSpecialTemplateTypes(
  templates: Array<Pick<EventReferenceTemplate, 'name' | 'templateType'>>,
): ReferenceTemplateType[] {
  const counts = new Map<ReferenceTemplateType, number>()

  templates.forEach((template) => {
    const templateType = normalizeReferenceTemplateType(template.templateType, template.name)
    if (!SPECIAL_REFERENCE_TEMPLATE_TYPES.includes(templateType)) return
    counts.set(templateType, (counts.get(templateType) || 0) + 1)
  })

  return SPECIAL_REFERENCE_TEMPLATE_TYPES.filter((templateType) => (counts.get(templateType) || 0) > 1)
}
