import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  getCurrentCoachSession: vi.fn(),
}))

vi.mock('@/lib/security-random', () => ({
  generateSecureId: vi.fn(() => 'upload-fixed'),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

import { getCurrentCoachSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { POST } from '../../app/api/portal/upload/route'

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47,
  0x0d, 0x0a, 0x1a, 0x0a,
  0x00,
])

function createUploadRequest(bucket: string) {
  const formData = new FormData()
  formData.append('bucket', bucket)
  formData.append('file', new File([pngBytes], 'photo.png', { type: 'image/png' }))

  return new Request('http://localhost/api/portal/upload', {
    method: 'POST',
    body: formData,
  }) as unknown as NextRequest
}

describe('POST /api/portal/upload', () => {
  const mockedGetCurrentCoachSession = vi.mocked(getCurrentCoachSession)
  const mockedCreateServiceRoleClient = vi.mocked(createServiceRoleClient)
  const coachSession = {
    user: { id: 'coach-1' },
    session: null,
  } as Awaited<ReturnType<typeof getCurrentCoachSession>>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects coach uploads to the event-posters bucket', async () => {
    mockedGetCurrentCoachSession.mockResolvedValue(coachSession)

    const response = await POST(createUploadRequest('event-posters'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.success).toBe(false)
    expect(payload.error).toBe('不支持的上传目录')
    expect(mockedCreateServiceRoleClient).not.toHaveBeenCalled()
  })

  it('stores private coach uploads under a coach-owned path and returns a managed preview url', async () => {
    mockedGetCurrentCoachSession.mockResolvedValue(coachSession)

    const uploadMock = vi.fn(async (path: string) => ({
      data: { path },
      error: null,
    }))
    const fromMock = vi.fn(() => ({
      upload: uploadMock,
      getPublicUrl: vi.fn(() => ({
        data: { publicUrl: 'https://example.com/public.png' },
      })),
    }))

    mockedCreateServiceRoleClient.mockReturnValue({
      storage: {
        from: fromMock,
      },
    } as ReturnType<typeof createServiceRoleClient>)

    const response = await POST(createUploadRequest('player-photos'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(fromMock).toHaveBeenCalledWith('player-photos')
    expect(uploadMock).toHaveBeenCalledWith(
      'coach/coach-1/upload-fixed.png',
      expect.any(Uint8Array),
      expect.objectContaining({
        contentType: 'image/png',
        upsert: false,
      }),
    )
    expect(payload.data.path).toBe('coach/coach-1/upload-fixed.png')
    expect(payload.data.url).toBe(
      '/api/storage/object?bucket=player-photos&path=coach%2Fcoach-1%2Fupload-fixed.png',
    )
  })
})
