import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { supabaseServerMock } = vi.hoisted(() => ({
  supabaseServerMock: {
    from: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({
  createSupabaseServer: vi.fn(() => supabaseServerMock),
  getCurrentCoachSession: vi.fn(),
  getCurrentAdminSession: vi.fn(),
}))

vi.mock('@/lib/reference-templates', () => ({
  findReferenceTemplateByType: vi.fn(() => null),
  normalizeReferenceTemplate: vi.fn((value: unknown) => {
    if (!value || typeof value !== 'object') return null
    return {
      name: '示例模板',
      templateType: 'registration_form',
      path: 'templates/example.docx',
      ...(value as Record<string, unknown>),
    }
  }),
  parseReferenceTemplates: vi.fn(() => []),
}))

vi.mock('@/lib/template-document-export', () => ({
  generateTemplateDocumentExport: vi.fn(),
  previewTemplateDocumentExport: vi.fn(),
}))

import { createSupabaseServer, getCurrentAdminSession, getCurrentCoachSession } from '@/lib/auth'
import { generateTemplateDocumentExport } from '@/lib/template-document-export'
import { GET as exportTemplate } from '../../app/api/portal/registrations/[id]/template-export/route'
import { POST as previewTemplate } from '../../app/api/events/[id]/registration-settings/template-preview/route'

const mockedCreateSupabaseServer = vi.mocked(createSupabaseServer)
const mockedGetCurrentCoachSession = vi.mocked(getCurrentCoachSession)
const mockedGetCurrentAdminSession = vi.mocked(getCurrentAdminSession)
const mockedGenerateTemplateDocumentExport = vi.mocked(generateTemplateDocumentExport)

function createGetRequest(url: string): NextRequest {
  const request = new Request(url, { method: 'GET' }) as NextRequest & { nextUrl?: NextRequest['nextUrl'] }
  request.nextUrl = new URL(url) as unknown as NextRequest['nextUrl']
  return request as NextRequest
}

function createPostRequest(url: string, body: unknown): NextRequest {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

describe('template route error sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedCreateSupabaseServer.mockResolvedValue(supabaseServerMock as unknown as Awaited<ReturnType<typeof createSupabaseServer>>)
    mockedGenerateTemplateDocumentExport.mockRejectedValue(new Error('internal stack trace'))
  })

  it('sanitizes coach template export failures', async () => {
    mockedGetCurrentCoachSession.mockResolvedValue({
      user: { id: 'coach-1' },
      session: null,
    } as unknown as Awaited<ReturnType<typeof getCurrentCoachSession>>)

    supabaseServerMock.from.mockImplementation((table: string) => {
      if (table === 'registrations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: 'registration-1',
                    event_id: 'event-1',
                    team_data: {},
                    players_data: [],
                  },
                  error: null,
                })),
              })),
            })),
          })),
        }
      }

      if (table === 'events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: 'event-1', name: '示例赛事', reference_templates: [] },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'registration_settings') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [],
              error: null,
            })),
          })),
        }
      }

      throw new Error(`unexpected table: ${table}`)
    })

    const response = await exportTemplate(
      createGetRequest('http://localhost/api/portal/registrations/registration-1/template-export?documentType=registration_form&format=pdf'),
      { params: Promise.resolve({ id: 'registration-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe('导出失败，请稍后重试')
    expect(payload.error).not.toContain('internal stack trace')
  })

  it('sanitizes admin template preview failures', async () => {
    mockedGetCurrentAdminSession.mockResolvedValue({
      user: { id: 'admin-1', is_super: true },
      session: null,
    } as unknown as Awaited<ReturnType<typeof getCurrentAdminSession>>)

    supabaseServerMock.from.mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: 'event-1', name: '示例赛事' },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'divisions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
              })),
            })),
          })),
        }
      }

      throw new Error(`unexpected table: ${table}`)
    })

    const response = await previewTemplate(
      createPostRequest('http://localhost/api/events/event-1/registration-settings/template-preview', {
        documentType: 'registration_form',
        template: {
          templateType: 'registration_form',
          path: 'templates/example.docx',
        },
      }),
      { params: Promise.resolve({ id: 'event-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe('模板预览失败，请稍后重试')
    expect(payload.error).not.toContain('internal stack trace')
  })
})
