import { describe, expect, it, vi } from 'vitest'
import {
  buildSecurityAuditLogPayload,
  writeSecurityAuditLog,
} from '@/lib/security-audit-log'

describe('security audit log helpers', () => {
  it('builds payloads with request context and redacts sensitive metadata', () => {
    const request = new Request('https://example.com/api/events/export', {
      headers: {
        'x-forwarded-for': '203.0.113.20, 10.0.0.1',
        'user-agent': 'Vitest Security Audit',
        'x-request-id': 'req-123',
      },
    })

    const payload = buildSecurityAuditLogPayload({
      action: 'export_registrations',
      actorType: 'admin',
      actorId: 'admin-id',
      actorRole: 'super_admin',
      resourceType: 'event',
      resourceId: 'event-id',
      eventId: 'event-id',
      result: 'success',
      request,
      metadata: {
        bucket: 'team-documents',
        path: 'exports/file.zip',
        count: 3,
        share_token: 'share-secret-token',
        password: '123456',
        players_data: [{ name: 'Alice', id_card: '440101199901011234' }],
        nested: {
          身份证号: '440101199901011234',
        },
      },
    })

    expect(payload.ip_address).toBe('203.0.113.20')
    expect(payload.user_agent).toBe('Vitest Security Audit')
    expect(payload.request_id).toBe('req-123')
    expect(payload.metadata).toMatchObject({
      bucket: 'team-documents',
      path: 'exports/file.zip',
      count: 3,
      share_token: '[redacted]',
      password: '[redacted]',
      players_data: '[redacted]',
      nested: {
        身份证号: '[redacted]',
      },
    })
  })

  it('writes sanitized payloads to security_audit_logs', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const fromMock = vi.fn().mockReturnValue({ insert: insertMock })
    const client = {
      from: fromMock,
    } as any

    const result = await writeSecurityAuditLog(
      {
        action: 'download_private_file',
        actorType: 'admin',
        actorId: 'admin-id',
        resourceType: 'storage_object',
        resourceId: 'team-documents:folder/file.pdf',
        result: 'success',
        metadata: {
          token: 'should-not-leak',
          bucket: 'team-documents',
        },
      },
      client,
    )

    expect(result).toBe(true)
    expect(fromMock).toHaveBeenCalledWith('security_audit_logs')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'download_private_file',
        metadata: {
          token: '[redacted]',
          bucket: 'team-documents',
        },
      }),
    )
  })

  it('fails closed when the audit table does not exist', async () => {
    const insertMock = vi.fn().mockResolvedValue({
      error: {
        message: 'relation "public.security_audit_logs" does not exist',
      },
    })
    const client = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as any

    await expect(
      writeSecurityAuditLog(
        {
          action: 'review_registration',
          actorType: 'admin',
          resourceType: 'registration',
          result: 'failed',
        },
        client,
      ),
    ).resolves.toBe(false)
  })
})
