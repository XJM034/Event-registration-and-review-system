import { NextRequest, NextResponse } from 'next/server'
import {
  canMutateSharedRegistration,
  getShareTokenAccessError,
  isShareWriteClosed,
  pickRegistrationSettings,
  resolveSharedPlayerData,
} from '@/lib/player-share-token'
import { getCurrentAdminSession, getCurrentCoachSession } from '@/lib/auth'
import { applyRateLimitHeaders, buildRateLimitKey, createRateLimitResponse, takeRateLimit } from '@/lib/rate-limit'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'
import { applySensitiveResponseHeaders } from '@/lib/sensitive-response-headers'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  isCoachOwnedStoragePath,
  isPublicShareOwnedStoragePath,
  isUploadBucket,
  isPrivateStorageBucket,
  storedValueIncludesStorageRef,
  type StorageObjectRef,
} from '@/lib/storage-object'

interface StorageAccessContext {
  actorType: 'admin' | 'coach' | 'public_share'
  actorId?: string | null
  actorRole?: string | null
  eventId?: string | null
  registrationId?: string | null
  metadata?: Record<string, unknown>
}

function applyNoStoreHeaders(headers: Headers) {
  applySensitiveResponseHeaders(headers)
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  applySensitiveResponseHeaders(headers)

  return NextResponse.json(body, {
    ...init,
    headers,
  })
}

async function getAdminAccessContext(): Promise<StorageAccessContext | null> {
  const adminSession = await getCurrentAdminSession()
  if (!adminSession?.user) {
    return null
  }

  return {
    actorType: 'admin',
    actorId: adminSession.user.id,
    actorRole: adminSession.user.is_super === true ? 'super_admin' : 'admin',
  }
}

async function getCoachAccessContext(ref: StorageObjectRef): Promise<StorageAccessContext | null> {
  const coachSession = await getCurrentCoachSession()
  if (!coachSession?.user?.id) {
    return null
  }

  if (isCoachOwnedStoragePath(ref.path, coachSession.user.id)) {
    return {
      actorType: 'coach',
      actorId: coachSession.user.id,
      actorRole: 'coach',
      metadata: {
        access_scope: 'owned_upload',
      },
    }
  }

  const supabase = createServiceRoleClient()
  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('team_data, players_data')
    .eq('coach_id', coachSession.user.id)

  if (error || !registrations) {
    console.error('Coach file access lookup failed:', error)
    return null
  }

  const allowed = registrations.some((registration) => (
    storedValueIncludesStorageRef(registration.team_data, ref, ref.bucket)
    || storedValueIncludesStorageRef(registration.players_data, ref, ref.bucket)
  ))

  if (!allowed) {
    return null
  }

  return {
    actorType: 'coach',
    actorId: coachSession.user.id,
    actorRole: 'coach',
    metadata: {
      access_scope: 'registration',
    },
  }
}

async function getShareTokenAccessContext(
  ref: StorageObjectRef,
  token: string,
): Promise<StorageAccessContext | null> {
  const supabase = createServiceRoleClient()

  const { data: shareTokenData, error: shareTokenError } = await supabase
    .from('player_share_tokens')
    .select('registration_id, event_id, player_id, player_index, is_active, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (shareTokenError) {
    console.error('Share token file access lookup failed:', shareTokenError)
    return null
  }

  const shareTokenAccessError = getShareTokenAccessError(shareTokenData)
  if (shareTokenAccessError) {
    return null
  }

  if (!shareTokenData?.registration_id) {
    return null
  }

  const { data: registrationData, error: registrationError } = await supabase
    .from('registrations')
    .select('id, event_id, status, team_data, players_data')
    .eq('id', shareTokenData.registration_id)
    .maybeSingle()

  if (registrationError || !registrationData) {
    console.error('Share token registration access lookup failed:', registrationError)
    return null
  }

  if (!canMutateSharedRegistration(registrationData.status)) {
    return null
  }

  const divisionId =
    typeof registrationData.team_data?.division_id === 'string'
      ? registrationData.team_data.division_id
      : null

  const { data: settingsRows, error: settingsError } = await supabase
    .from('registration_settings')
    .select('division_id, team_requirements')
    .eq('event_id', shareTokenData.event_id || registrationData.event_id)

  if (settingsError) {
    console.error('Share token settings lookup failed:', settingsError)
    return null
  }

  const selectedSettings = pickRegistrationSettings(settingsRows, divisionId)
  if (selectedSettings && isShareWriteClosed(selectedSettings.team_requirements)) {
    return null
  }

  const sharedPlayer = resolveSharedPlayerData(
    registrationData.players_data,
    shareTokenData,
  )

  const matchesPersistedPlayerFile = storedValueIncludesStorageRef(sharedPlayer, ref, ref.bucket)
  const matchesPendingSharedUpload =
    ref.bucket === 'player-photos'
      && isPublicShareOwnedStoragePath(ref.path, {
        registrationId: shareTokenData.registration_id,
        playerId: shareTokenData.player_id,
        playerIndex: shareTokenData.player_index,
      })

  if (!matchesPersistedPlayerFile && !matchesPendingSharedUpload) {
    return null
  }

  return {
    actorType: 'public_share',
    actorRole: 'public_share',
    eventId: shareTokenData.event_id || registrationData.event_id,
    registrationId: shareTokenData.registration_id,
    metadata: {
      player_id: shareTokenData.player_id || null,
      player_index: shareTokenData.player_index ?? null,
      access_scope: matchesPendingSharedUpload ? 'owned_upload' : 'player_record',
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const bucket = searchParams.get('bucket')
    const path = searchParams.get('path')
    const download = searchParams.get('download') === '1'
    const fileName = searchParams.get('filename')
    const shareToken = searchParams.get('share_token')
    const shareRateLimit = shareToken
      ? takeRateLimit({
          key: buildRateLimitKey({
            request,
            scope: 'storage-object:share',
            subject: shareToken,
          }),
          limit: 120,
          windowMs: 60_000,
        })
      : null

    if (!bucket || !path || !isUploadBucket(bucket)) {
      return jsonNoStore(
        { error: '文件参数无效', success: false },
        { status: 400 }
      )
    }

    if (shareRateLimit && !shareRateLimit.allowed) {
      const response = createRateLimitResponse(
        { error: '请求过于频繁，请稍后重试', success: false },
        shareRateLimit,
        { status: 429 },
      )
      applyNoStoreHeaders(response.headers)
      return response
    }

    const ref: StorageObjectRef = {
      bucket,
      path: path.replace(/^\/+/, '').trim(),
    }

    if (!ref.path || ref.path.includes('..')) {
      return jsonNoStore(
        { error: '文件路径无效', success: false },
        { status: 400 }
      )
    }

    let authorized = !isPrivateStorageBucket(bucket)
    let accessContext: StorageAccessContext | null = null

    if (!authorized) {
      accessContext = await getAdminAccessContext()
      authorized = Boolean(accessContext)
    }

    if (!authorized) {
      accessContext = await getCoachAccessContext(ref)
      authorized = Boolean(accessContext)
    }

    if (!authorized && shareToken) {
      accessContext = await getShareTokenAccessContext(ref, shareToken)
      authorized = Boolean(accessContext)
    }

    if (!authorized) {
      if (download && isPrivateStorageBucket(bucket)) {
        await writeSecurityAuditLog({
          request,
          action: 'download_private_file',
          actorType: shareToken ? 'public_share' : 'system',
          actorRole: shareToken ? 'public_share' : 'system',
          resourceType: 'storage_object',
          resourceId: `${bucket}:${ref.path}`,
          result: 'denied',
          reason: 'unauthorized',
          metadata: {
            bucket,
            path: ref.path,
          },
        })
      }

      return jsonNoStore(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(ref.path)

    if (error || !data) {
      console.error('Storage object download failed:', error)
      return jsonNoStore(
        { error: '文件不存在', success: false },
        { status: 404 }
      )
    }

    const arrayBuffer = await data.arrayBuffer()
    const response = new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': data.type || 'application/octet-stream',
        'Cache-Control': isPrivateStorageBucket(bucket) ? 'no-store, max-age=0' : 'public, max-age=300',
      },
    })

    if (isPrivateStorageBucket(bucket)) {
      response.headers.set('Pragma', 'no-cache')
      response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    }

    if (shareRateLimit) {
      applyRateLimitHeaders(response.headers, shareRateLimit)
    }

    if (download) {
      if (isPrivateStorageBucket(bucket)) {
        await writeSecurityAuditLog({
          request,
          action: 'download_private_file',
          actorType: accessContext?.actorType || 'system',
          actorId: accessContext?.actorId || null,
          actorRole: accessContext?.actorRole || null,
          resourceType: 'storage_object',
          resourceId: `${bucket}:${ref.path}`,
          eventId: accessContext?.eventId || null,
          registrationId: accessContext?.registrationId || null,
          result: 'success',
          metadata: {
            bucket,
            path: ref.path,
            ...accessContext?.metadata,
          },
        })
      }

      const fallbackName = ref.path.split('/').pop() || 'file'
      response.headers.set(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(fileName || fallbackName)}"`,
      )
    }

    return response
  } catch (error) {
    console.error('Storage object route error:', error)
    return jsonNoStore(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
