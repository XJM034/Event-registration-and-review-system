import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer, getCurrentAdminSession } from '@/lib/auth'
import { normalizeReferenceTemplate } from '@/lib/reference-templates'
import {
  generateTemplateDocumentExport,
  type TemplateDocumentType,
} from '@/lib/template-document-export'
import type { EventReferenceTemplate } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

type PreviewRequestBody = {
  documentType?: unknown
  template?: unknown
  referenceTemplates?: unknown
  divisionId?: unknown
}

function parseDocumentType(value: unknown): TemplateDocumentType | null {
  return value === 'registration_form' || value === 'athlete_info_form' ? value : null
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

function normalizePreviewReferenceTemplates(value: unknown): EventReferenceTemplate[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => normalizeReferenceTemplate(
      item && typeof item === 'object'
        ? item as Partial<EventReferenceTemplate>
        : null,
    ))
    .filter((item): item is EventReferenceTemplate => Boolean(item))
}

function buildPreviewPlayers(): Array<Record<string, string>> {
  const players: Array<Record<string, string>> = [
    {
      role: 'leader',
      name: '示例领队',
      contact: '13800000001',
    },
    {
      role: 'coach',
      name: '示例教练A',
      contact: '13800000002',
    },
    {
      role: 'coach',
      name: '示例教练B',
      contact: '13800000003',
    },
  ]

  for (let index = 1; index <= 8; index += 1) {
    players.push({
      role: 'player',
      name: `示例队员${index}`,
      gender: index % 2 === 0 ? '女' : '男',
      id_type: '身份证',
      id_number: `51010120120${String(index).padStart(2, '0')}1234`,
      player_number: `${10 + index}`,
      contact_phone: '13800000088',
    })
  }

  return players
}

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { id: eventId } = await context.params
    const session = await getCurrentAdminSession()

    if (!session) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 },
      )
    }

    const body = await request.json() as PreviewRequestBody
    const documentType = parseDocumentType(body.documentType)

    if (!documentType) {
      return NextResponse.json(
        { success: false, error: '模板类型无效' },
        { status: 400 },
      )
    }

    const template = normalizeDedicatedTemplate(body.template, documentType)
    if (!template) {
      return NextResponse.json(
        { success: false, error: '请先上传模板后再预览' },
        { status: 400 },
      )
    }

    const normalizedTemplates = normalizePreviewReferenceTemplates(body.referenceTemplates)
    const referenceTemplates = [
      template,
      ...normalizedTemplates,
    ].filter((item, index, templates) => {
      if (!item) return false
      const identity = item.path || item.url || `${item.templateType}:${item.name}`
      return templates.findIndex((candidate) => (
        (candidate?.path || candidate?.url || `${candidate?.templateType}:${candidate?.name}`) === identity
      )) === index
    })

    const divisionId = typeof body.divisionId === 'string' && body.divisionId.trim()
      ? body.divisionId.trim()
      : null

    const supabase = await createSupabaseServer()

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, name')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json(
        { success: false, error: '赛事不存在' },
        { status: 404 },
      )
    }

    let divisionName: string | undefined
    if (divisionId) {
      const { data: division } = await supabase
        .from('divisions')
        .select('name')
        .eq('id', divisionId)
        .maybeSingle()

      if (typeof division?.name === 'string' && division.name.trim()) {
        divisionName = division.name.trim()
      }
    }

    const source = {
      eventName: event.name,
      teamData: {
        unit: '示例参赛单位',
        name: '示例参赛队伍',
        participationGroup: divisionName || '示例组别',
      },
      playersData: buildPreviewPlayers(),
      referenceTemplates,
      divisionName,
    }

    const result = await generateTemplateDocumentExport(
      source,
      documentType,
      'pdf',
      { requiredDocumentTypes: [documentType] },
    )

    return new NextResponse(result.buffer as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(result.fileName)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Admin template preview error:', error)
    return NextResponse.json(
      { success: false, error: '模板预览失败，请稍后重试' },
      { status: 500 },
    )
  }
}
