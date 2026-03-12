import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { supabaseAdminMock, xlsxReadMock, sheetToJsonMock } = vi.hoisted(() => ({
  supabaseAdminMock: {
    from: vi.fn(),
    auth: {
      admin: {
        createUser: vi.fn(),
        updateUserById: vi.fn(),
        deleteUser: vi.fn(),
      },
    },
  },
  xlsxReadMock: vi.fn(),
  sheetToJsonMock: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseAdminMock),
}))

vi.mock('xlsx', () => ({
  read: xlsxReadMock,
  utils: {
    sheet_to_json: sheetToJsonMock,
  },
}))

vi.mock('@/lib/auth', () => ({
  getCurrentAdminSession: vi.fn(),
}))

vi.mock('@/lib/security-audit-log', () => ({
  writeSecurityAuditLog: vi.fn().mockResolvedValue(true),
}))

import { getCurrentAdminSession } from '@/lib/auth'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'
import { PUT as updateCoach, DELETE as deleteCoach } from '../../app/api/admin/coaches/[id]/route'
import { POST as importCoaches } from '../../app/api/admin/coaches/import/route'
import { PATCH as batchSetCoachStatus } from '../../app/api/admin/coaches/batch-status/route'

const mockedGetCurrentAdminSession = vi.mocked(getCurrentAdminSession)
const mockedWriteSecurityAuditLog = vi.mocked(writeSecurityAuditLog)
type AdminSession = NonNullable<Awaited<ReturnType<typeof getCurrentAdminSession>>>

function createJsonRequest(
  url: string,
  method: string,
  body: Record<string, unknown>,
): NextRequest {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function createMultipartRequest(formData: FormData): NextRequest {
  return new Request('http://localhost/api/admin/coaches/import', {
    method: 'POST',
    body: formData,
  }) as unknown as NextRequest
}

function createAdminSession(id: string, isSuper: boolean): AdminSession {
  return {
    user: {
      id,
      is_super: isSuper,
    },
    session: null,
  } as unknown as AdminSession
}

describe('admin coach management audit routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseAdminMock.from.mockReset()
    supabaseAdminMock.auth.admin.createUser.mockReset()
    supabaseAdminMock.auth.admin.updateUserById.mockReset()
    supabaseAdminMock.auth.admin.deleteUser.mockReset()
    xlsxReadMock.mockReset()
    sheetToJsonMock.mockReset()
  })

  it('forbids non-super admins from updating coaches and records an audit log', async () => {
    mockedGetCurrentAdminSession.mockResolvedValue(createAdminSession('admin-1', false))

    const response = await updateCoach(
      createJsonRequest('http://localhost/api/admin/coaches/coach-1', 'PUT', {
        name: 'Coach One',
      }),
      { params: Promise.resolve({ id: 'coach-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toBe('Forbidden')
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_coach_account',
        actorId: 'admin-1',
        resourceId: 'coach-1',
        result: 'denied',
        reason: 'forbidden',
      }),
    )
    expect(supabaseAdminMock.from).not.toHaveBeenCalled()
  })

  it('sanitizes coach deletion auth failures and records an audit log', async () => {
    mockedGetCurrentAdminSession.mockResolvedValue(createAdminSession('admin-super', true))

    supabaseAdminMock.from.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { auth_id: 'auth-coach-1', phone: '13800000001' },
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        }
      }

      if (table === 'registrations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              or: vi.fn(async () => ({
                data: [],
                error: null,
              })),
              eq: vi.fn(async () => ({
                data: [],
                error: null,
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({ error: null })),
            })),
            in: vi.fn(async () => ({ error: null })),
          })),
        }
      }

      if (table === 'admin_users') {
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

      throw new Error(`Unexpected table ${table}`)
    })

    supabaseAdminMock.auth.admin.deleteUser.mockResolvedValue({
      error: { message: 'internal auth stack trace' },
    })

    const response = await deleteCoach(
      new Request('http://localhost/api/admin/coaches/coach-1', {
        method: 'DELETE',
      }) as unknown as NextRequest,
      { params: Promise.resolve({ id: 'coach-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe('删除账号失败，请稍后重试')
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete_coach_account',
        actorId: 'admin-super',
        resourceId: 'coach-1',
        result: 'failed',
        reason: 'auth_coach_delete_failed',
      }),
    )
  })

  it('sanitizes per-row import failures and records a summary audit log', async () => {
    mockedGetCurrentAdminSession.mockResolvedValue(createAdminSession('admin-super', true))

    xlsxReadMock.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    })
    sheetToJsonMock.mockReturnValue([
      ['手机号', '姓名', '学校', '备注'],
      ['13800000002', '张三', '一中', ''],
    ])
    supabaseAdminMock.auth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'internal auth stack trace' },
    })

    const formData = new FormData()
    formData.set(
      'file',
      new File(['dummy'], 'coaches.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    )

    const response = await importCoaches(createMultipartRequest(formData))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data.failedCount).toBe(1)
    expect(payload.data.details[0].reason).toBe('创建账号失败，请稍后重试')
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'import_coach_accounts',
        actorId: 'admin-super',
        result: 'success',
        metadata: expect.objectContaining({
          processed_count: 1,
          created_count: 0,
          skipped_count: 0,
          failed_count: 1,
        }),
      }),
    )
  })

  it('records a success audit log for batch coach status changes', async () => {
    mockedGetCurrentAdminSession.mockResolvedValue(createAdminSession('admin-super', true))

    const adminAuthQuery = {
      data: [],
      error: null,
      not: vi.fn(() => adminAuthQuery),
    }

    const coachesQuery = {
      data: [
        { id: 'coach-1', auth_id: 'auth-1', phone: '13800000001' },
      ],
      error: null,
      or: vi.fn(() => coachesQuery),
      eq: vi.fn(() => coachesQuery),
    }

    supabaseAdminMock.from.mockImplementation((table: string) => {
      if (table === 'admin_users') {
        return {
          select: vi.fn(() => adminAuthQuery),
        }
      }

      if (table === 'coaches') {
        return {
          select: vi.fn(() => coachesQuery),
          update: vi.fn(() => ({
            in: vi.fn(async () => ({ error: null })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    })

    supabaseAdminMock.auth.admin.updateUserById.mockResolvedValue({
      error: null,
    })

    const response = await batchSetCoachStatus(
      createJsonRequest('http://localhost/api/admin/coaches/batch-status', 'PATCH', {
        is_active: false,
        search: '138',
        school: '一中',
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data.updatedCount).toBe(1)
    expect(payload.data.authUpdateFailedCount).toBe(0)
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'batch_set_coach_active_status',
        actorId: 'admin-super',
        result: 'success',
        metadata: expect.objectContaining({
          updated_count: 1,
          auth_update_failed_count: 0,
          is_active: false,
        }),
      }),
    )
  })
})
