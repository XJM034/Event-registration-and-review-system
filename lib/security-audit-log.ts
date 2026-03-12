import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getRequestIp } from '@/lib/rate-limit'

export type SecurityAuditActorType = 'admin' | 'coach' | 'public_share' | 'system'
export type SecurityAuditResult = 'success' | 'denied' | 'failed'

type AuditClient = ReturnType<typeof createServiceRoleClient>

interface SecurityAuditLogInput {
  action: string
  actorType: SecurityAuditActorType
  actorId?: string | null
  actorRole?: string | null
  resourceType: string
  resourceId?: string | null
  eventId?: string | null
  registrationId?: string | null
  targetUserId?: string | null
  result: SecurityAuditResult
  reason?: string | null
  metadata?: Record<string, unknown> | null
  request?: Pick<Request, 'headers'> | null
}

type SecurityAuditLogPayload = {
  action: string
  actor_type: SecurityAuditActorType
  actor_id: string | null
  actor_role: string | null
  resource_type: string
  resource_id: string | null
  event_id: string | null
  registration_id: string | null
  target_user_id: string | null
  ip_address: string | null
  user_agent: string | null
  request_id: string | null
  result: SecurityAuditResult
  reason: string | null
  metadata: Record<string, unknown>
}

const REDACTED_PLACEHOLDER = '[redacted]'
const TRUNCATED_PLACEHOLDER = '[truncated]'
const MAX_STRING_LENGTH = 512
const MAX_ARRAY_LENGTH = 20
const MAX_DEPTH = 5
const MAX_OBJECT_KEYS = 40

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /share/i,
  /players?_data/i,
  /team_data/i,
  /id[_-]?card/i,
  /identity/i,
  /certificate/i,
  /authorization/i,
  /cookie/i,
  /身份证/,
  /证件/,
]

function isMissingAuditTableError(
  error: { message?: string | null; details?: string | null } | null,
) {
  if (!error) return false
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return text.includes('security_audit_logs') && text.includes('does not exist')
}

function sanitizeString(value: string) {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH - 3)}...`
    : value
}

function sanitizeMetadataValue(
  value: unknown,
  depth = 0,
): unknown {
  if (depth >= MAX_DEPTH) {
    return TRUNCATED_PLACEHOLDER
  }

  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'string') {
    return sanitizeString(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeMetadataValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS)
    const sanitized = entries.map(([key, nestedValue]) => {
      const shouldRedact = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))
      return [
        key,
        shouldRedact
          ? REDACTED_PLACEHOLDER
          : sanitizeMetadataValue(nestedValue, depth + 1),
      ]
    })
    return Object.fromEntries(sanitized)
  }

  return sanitizeString(String(value))
}

function getRequestId(request?: Pick<Request, 'headers'> | null) {
  if (!request) return null

  return (
    request.headers.get('x-request-id')
    || request.headers.get('x-vercel-id')
    || null
  )
}

export function buildSecurityAuditLogPayload(
  input: SecurityAuditLogInput,
): SecurityAuditLogPayload {
  return {
    action: input.action,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    actor_role: input.actorRole ?? null,
    resource_type: input.resourceType,
    resource_id: input.resourceId ?? null,
    event_id: input.eventId ?? null,
    registration_id: input.registrationId ?? null,
    target_user_id: input.targetUserId ?? null,
    ip_address: input.request ? getRequestIp(input.request) : null,
    user_agent: input.request ? sanitizeString(input.request.headers.get('user-agent') || '') || null : null,
    request_id: getRequestId(input.request),
    result: input.result,
    reason: input.reason ? sanitizeString(input.reason) : null,
    metadata: (sanitizeMetadataValue(input.metadata || {}) || {}) as Record<string, unknown>,
  }
}

export async function writeSecurityAuditLog(
  input: SecurityAuditLogInput,
  client: AuditClient = createServiceRoleClient(),
) {
  try {
    const payload = buildSecurityAuditLogPayload(input)
    const { error } = await client
      .from('security_audit_logs')
      .insert(payload)

    if (error) {
      if (isMissingAuditTableError(error)) {
        console.warn('security_audit_logs table missing, skip audit log write')
        return false
      }

      console.warn('Security audit log write failed:', error)
      return false
    }

    return true
  } catch (error) {
    console.warn('Security audit log write exception:', error)
    return false
  }
}
