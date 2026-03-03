import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentAdminSession: vi.fn(),
}))

import { createClient } from '@supabase/supabase-js'
import { getCurrentAdminSession } from '@/lib/auth'
import { DELETE } from '../../app/api/upload/route'

const createDeleteRequest = (body: unknown): NextRequest => {
  return new Request('http://localhost/api/upload', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

describe('DELETE /api/upload', () => {
  const mockedCreateClient = vi.mocked(createClient)
  const mockedGetCurrentAdminSession = vi.mocked(getCurrentAdminSession)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when admin session is missing', async () => {
    mockedGetCurrentAdminSession.mockResolvedValue(null)

    const response = await DELETE(createDeleteRequest({ paths: ['file.pdf'] }))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.success).toBe(false)
    expect(mockedCreateClient).not.toHaveBeenCalled()
  })

  it('returns 400 when delete path is invalid', async () => {
    mockedGetCurrentAdminSession.mockResolvedValue({
      user: { id: 'admin-id' },
      session: null,
    } as any)

    const response = await DELETE(createDeleteRequest({ paths: ['../file.pdf'] }))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.success).toBe(false)
    expect(payload.error).toContain('文件路径不合法')
  })

  it('removes files and returns deletedCount when request is valid', async () => {
    mockedGetCurrentAdminSession.mockResolvedValue({
      user: { id: 'admin-id' },
      session: null,
    } as any)

    const removeMock = vi.fn().mockResolvedValue({ error: null })
    const fromMock = vi.fn().mockReturnValue({ remove: removeMock })
    mockedCreateClient.mockReturnValue({
      storage: {
        from: fromMock,
      },
    } as any)

    const response = await DELETE(
      createDeleteRequest({
        bucket: 'team-documents',
        paths: ['template-a.docx', 'template-b.pdf'],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data.deletedCount).toBe(2)
    expect(fromMock).toHaveBeenCalledWith('team-documents')
    expect(removeMock).toHaveBeenCalledWith(['template-a.docx', 'template-b.pdf'])
  })

  it('returns 500 when storage remove fails', async () => {
    mockedGetCurrentAdminSession.mockResolvedValue({
      user: { id: 'admin-id' },
      session: null,
    } as any)

    const removeMock = vi.fn().mockResolvedValue({
      error: { message: 'storage failure' },
    })
    mockedCreateClient.mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({ remove: removeMock }),
      },
    } as any)

    const response = await DELETE(createDeleteRequest({ paths: ['template-a.docx'] }))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.success).toBe(false)
    expect(payload.error).toContain('storage failure')
  })
})
