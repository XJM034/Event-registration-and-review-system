import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer, getCurrentCoachSession } from '@/lib/auth'
import {
  findReferenceTemplateByType,
  normalizeReferenceTemplate,
  parseReferenceTemplates,
} from '@/lib/reference-templates'
import {
  generateTemplateDocumentExport,
  previewTemplateDocumentExport,
  type TemplateDocumentType,
  type TemplateExportFormat,
} from '@/lib/template-document-export'
import type { EventReferenceTemplate } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

type RegistrationSettingRow = {
  division_id?: string | null
  team_requirements?: {
    registrationFormTemplate?: unknown
    athleteInfoTemplate?: unknown
    registrationFormTemplateState?: unknown
    athleteInfoTemplateState?: unknown
  } | null
  player_requirements?: {
    roles?: Array<{ id?: string; name?: string }>
  }
}

function parseDocumentType(value: string | null): TemplateDocumentType | null {
  return value === 'registration_form' || value === 'athlete_info_form' ? value : null
}

function parseExportFormat(value: string | null): TemplateExportFormat | null {
  return value === 'pdf' ? value : null
}

function buildRoleNameMap(
  settings: RegistrationSettingRow[] | null,
  divisionId?: string,
): Record<string, string> {
  const orderedSettings = Array.isArray(settings)
    ? [...settings].sort((a, b) => {
        if (a.division_id === divisionId) return -1
        if (b.division_id === divisionId) return 1
        return 0
      })
    : []

  const roleNameMap: Record<string, string> = {}

  orderedSettings.forEach((setting) => {
    setting.player_requirements?.roles?.forEach((role) => {
      const roleId = typeof role.id === 'string' ? role.id.trim() : ''
      const roleName = typeof role.name === 'string' ? role.name.trim() : ''
      if (roleId && roleName && !roleNameMap[roleId]) {
        roleNameMap[roleId] = roleName
      }
    })
  })

  return roleNameMap
}

function pickEffectiveSetting(
  settings: RegistrationSettingRow[] | null,
  divisionId?: string,
): RegistrationSettingRow | null {
  if (!Array.isArray(settings) || settings.length === 0) return null

  return settings.find((setting) => setting.division_id === divisionId)
    || settings.find((setting) => !setting.division_id)
    || settings[0]
    || null
}

function normalizeDedicatedTemplate(
  value: unknown,
  templateType: TemplateDocumentType,
): EventReferenceTemplate | null {
  const template = normalizeReferenceTemplate(
    value && typeof value === 'object'
      ? { ...(value as Partial<EventReferenceTemplate>), templateType }
      : null,
  )

  return template ? { ...template, templateType } : null
}

function readPublishedTemplateConfig(
  stateValue: unknown,
  legacyTemplateValue: unknown,
  templateType: TemplateDocumentType,
  fallbackTemplate: EventReferenceTemplate | null,
): EventReferenceTemplate | null {
  const published = stateValue && typeof stateValue === 'object'
    ? (stateValue as {
        published?: {
          template?: unknown
        } | null
      }).published
    : null

  const publishedTemplate = normalizeDedicatedTemplate(published?.template, templateType)
  const legacyTemplate = normalizeDedicatedTemplate(legacyTemplateValue, templateType)

  return publishedTemplate || legacyTemplate || fallbackTemplate
}

function buildDocumentTemplateConfig(
  settings: RegistrationSettingRow[] | null,
  divisionId: string | undefined,
  fallbackTemplates: EventReferenceTemplate[],
): EventReferenceTemplate[] {
  const effectiveSetting = pickEffectiveSetting(settings, divisionId)
  const teamRequirements = effectiveSetting?.team_requirements || null

  const registrationFallbackTemplate = normalizeDedicatedTemplate(
    teamRequirements?.registrationFormTemplate,
    'registration_form',
  ) || findReferenceTemplateByType(fallbackTemplates, 'registration_form')
  const athleteFallbackTemplate = normalizeDedicatedTemplate(
    teamRequirements?.athleteInfoTemplate,
    'athlete_info_form',
  ) || findReferenceTemplateByType(fallbackTemplates, 'athlete_info_form')

  const registrationForm = readPublishedTemplateConfig(
    teamRequirements?.registrationFormTemplateState,
    teamRequirements?.registrationFormTemplate,
    'registration_form',
    registrationFallbackTemplate,
  )
  const athleteInfoForm = readPublishedTemplateConfig(
    teamRequirements?.athleteInfoTemplateState,
    teamRequirements?.athleteInfoTemplate,
    'athlete_info_form',
    athleteFallbackTemplate,
  )

  return [registrationForm, athleteInfoForm].filter(
    (template): template is EventReferenceTemplate => Boolean(template),
  )
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { id: registrationId } = await context.params
    const documentType = parseDocumentType(request.nextUrl.searchParams.get('documentType'))
    const format = parseExportFormat(request.nextUrl.searchParams.get('format'))
    const preview = request.nextUrl.searchParams.get('preview') === '1'

    if (!documentType || !format) {
      return NextResponse.json(
        { success: false, error: '导出参数无效' },
        { status: 400 },
      )
    }

    const coachSession = await getCurrentCoachSession()
    if (!coachSession) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 },
      )
    }

    const supabase = await createSupabaseServer()
    const { data: registration, error: registrationError } = await supabase
      .from('registrations')
      .select('*')
      .eq('id', registrationId)
      .eq('coach_id', coachSession.user.id)
      .single()

    if (registrationError || !registration) {
      return NextResponse.json(
        { success: false, error: '报名记录不存在' },
        { status: 404 },
      )
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, name, reference_templates')
      .eq('id', registration.event_id)
      .single()

    if (eventError || !event) {
      return NextResponse.json(
        { success: false, error: '赛事不存在' },
        { status: 404 },
      )
    }

    const divisionId = typeof registration.team_data?.division_id === 'string'
      ? registration.team_data.division_id
      : undefined

    let divisionName = typeof registration.team_data?.participationGroup === 'string'
      ? registration.team_data.participationGroup
      : undefined
    let divisionRules: Record<string, unknown> | undefined

    if (divisionId) {
      const { data: division } = await supabase
        .from('divisions')
        .select('name, rules')
        .eq('id', divisionId)
        .maybeSingle()

      if (division?.name) {
        divisionName = division.name
      }
      if (division?.rules && typeof division.rules === 'object') {
        divisionRules = division.rules as Record<string, unknown>
      }
    }

    const { data: settings } = await supabase
      .from('registration_settings')
      .select('division_id, team_requirements, player_requirements')
      .eq('event_id', registration.event_id)

    const fallbackTemplates = parseReferenceTemplates(event.reference_templates)

    const templateConfig = buildDocumentTemplateConfig(
      settings as RegistrationSettingRow[] | null,
      divisionId,
      fallbackTemplates,
    )

    const source = {
      eventName: event.name,
      teamData: (registration.team_data || {}) as Record<string, unknown>,
      playersData: Array.isArray(registration.players_data)
        ? registration.players_data as Array<Record<string, unknown>>
        : [],
      referenceTemplates: templateConfig,
      divisionName,
      divisionRules: {
        minPlayers: typeof divisionRules?.minPlayers === 'number' ? divisionRules.minPlayers : undefined,
        maxPlayers: typeof divisionRules?.maxPlayers === 'number' ? divisionRules.maxPlayers : undefined,
      },
      roleNameMap: buildRoleNameMap(settings as RegistrationSettingRow[] | null, divisionId),
    }

    if (preview) {
      const result = previewTemplateDocumentExport(source, documentType)
      return NextResponse.json({
        success: true,
        data: result,
      })
    }

    const result = await generateTemplateDocumentExport(source, documentType, format)
    return new NextResponse(result.buffer as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(result.fileName)}"`,
      },
    })
  } catch (error) {
    console.error('Coach template export error:', error)
    return NextResponse.json(
      { success: false, error: '导出失败，请稍后重试' },
      { status: 500 },
    )
  }
}
