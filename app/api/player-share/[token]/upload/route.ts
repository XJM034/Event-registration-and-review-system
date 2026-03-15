import { NextRequest, NextResponse } from 'next/server'
import {
  canMutateSharedRegistration,
  getShareTokenAccessError,
  isShareWriteClosed,
  pickRegistrationSettings,
  summarizeShareTokenForAudit,
} from '@/lib/player-share-token'
import { buildRateLimitKey, createRateLimitResponse, takeRateLimit } from '@/lib/rate-limit'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'
import { generateSecureId } from '@/lib/security-random'
import { applySensitiveResponseHeaders } from '@/lib/sensitive-response-headers'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  PUBLIC_SHARE_ALLOWED_UPLOAD_BUCKETS,
  validateUploadFile,
} from '@/lib/upload-file-validation'
import {
  buildPublicShareOwnedStoragePath,
  buildStorageObjectUrl,
} from '@/lib/storage-object'

const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024
const MAX_DOCUMENT_FILE_SIZE = 20 * 1024 * 1024
const DEFAULT_BUCKET = 'player-photos'

interface RouteParams {
  params: Promise<{ token: string }>
}

function createPublicShareResponse(
  body: unknown,
  rateLimit: ReturnType<typeof takeRateLimit>,
  init?: ResponseInit,
) {
  const response = createRateLimitResponse(body, rateLimit, init)
  applySensitiveResponseHeaders(response.headers)
  return response
}

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params
    const resourceId = summarizeShareTokenForAudit(token)
    const rateLimit = takeRateLimit({
      key: buildRateLimitKey({
        request,
        scope: 'player-share:upload',
        subject: token,
      }),
      limit: 10,
      windowMs: 10 * 60_000,
    })

    if (!rateLimit.allowed) {
      await writeSecurityAuditLog({
        request,
        action: 'upload_public_share_file',
        actorType: 'public_share',
        actorRole: 'public_share',
        resourceType: 'share_token',
        resourceId,
        result: 'denied',
        reason: 'rate_limited',
      })
      return createPublicShareResponse(
        { error: '上传过于频繁，请稍后再试', success: false },
        rateLimit,
        { status: 429 },
      )
    }

    const supabase = createServiceRoleClient()

    const { data: shareTokenData, error: shareTokenError } = await supabase
      .from('player_share_tokens')
      .select('registration_id, event_id, player_id, player_index, is_active, expires_at, used_at')
      .eq('token', token)
      .maybeSingle()

    if (shareTokenError) {
      console.error('Share upload token lookup failed:', shareTokenError)
      return createPublicShareResponse(
        { error: '分享链接校验失败', success: false },
        rateLimit,
        { status: 500 }
      )
    }

    const shareTokenAccessError = getShareTokenAccessError(shareTokenData)
    if (shareTokenAccessError) {
      await writeSecurityAuditLog({
        request,
        action: 'upload_public_share_file',
        actorType: 'public_share',
        actorRole: 'public_share',
        resourceType: 'share_token',
        resourceId,
        registrationId: shareTokenData?.registration_id ?? null,
        eventId: shareTokenData?.event_id ?? null,
        result: 'failed',
        reason: `share_token_status_${shareTokenAccessError.status}`,
      })
      return createPublicShareResponse(
        { error: shareTokenAccessError.error, success: false },
        rateLimit,
        { status: shareTokenAccessError.status }
      )
    }

    if (!shareTokenData?.registration_id || !shareTokenData.event_id) {
      await writeSecurityAuditLog({
        request,
        action: 'upload_public_share_file',
        actorType: 'public_share',
        actorRole: 'public_share',
        resourceType: 'share_token',
        resourceId,
        result: 'failed',
        reason: 'share_token_not_found',
      })
      return createPublicShareResponse(
        { error: '分享链接不存在', success: false },
        rateLimit,
        { status: 404 }
      )
    }

    const { data: registrationData, error: registrationError } = await supabase
      .from('registrations')
      .select('id, status, team_data')
      .eq('id', shareTokenData.registration_id)
      .maybeSingle()

    if (registrationError || !registrationData) {
      console.error('Share upload registration lookup failed:', registrationError)
      return createPublicShareResponse(
        { error: '报名信息不存在', success: false },
        rateLimit,
        { status: 404 }
      )
    }

    if (!canMutateSharedRegistration(registrationData.status)) {
      return createPublicShareResponse(
        { error: '当前报名状态不允许继续上传', success: false },
        rateLimit,
        { status: 409 }
      )
    }

    const divisionId =
      typeof registrationData.team_data?.division_id === 'string'
        ? registrationData.team_data.division_id
        : null

    const { data: settingsRows, error: settingsError } = await supabase
      .from('registration_settings')
      .select('division_id, team_requirements')
      .eq('event_id', shareTokenData.event_id)

    if (settingsError) {
      console.error('Share upload settings lookup failed:', settingsError)
      return createPublicShareResponse(
        { error: '获取报名配置失败', success: false },
        rateLimit,
        { status: 500 }
      )
    }

    const selectedSettings = pickRegistrationSettings(settingsRows, divisionId)
    if (selectedSettings && isShareWriteClosed(selectedSettings.team_requirements)) {
      return createPublicShareResponse(
        { error: '当前已过填写截止时间', success: false },
        rateLimit,
        { status: 409 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const bucketValue = formData.get('bucket')
    const bucketRaw =
      typeof bucketValue === 'string' && bucketValue.trim()
        ? bucketValue.trim()
        : DEFAULT_BUCKET
    if (!file) {
      return createPublicShareResponse(
        { error: '请选择文件', success: false },
        rateLimit,
        { status: 400 }
      )
    }

    if (!PUBLIC_SHARE_ALLOWED_UPLOAD_BUCKETS.has(bucketRaw as typeof DEFAULT_BUCKET | 'team-documents')) {
      return createPublicShareResponse(
        { error: '不支持的上传目录', success: false },
        rateLimit,
        { status: 400 }
      )
    }
    const bucket = bucketRaw as 'player-photos' | 'team-documents'

    const mimeType = (file.type || '').toLowerCase()
    const precheck = validateUploadFile({
      fileName: file.name,
      mimeType,
      bucket,
    })

    const maxFileSize = bucket === 'team-documents' ? MAX_DOCUMENT_FILE_SIZE : MAX_IMAGE_FILE_SIZE
    if (!precheck.valid) {
      return createPublicShareResponse(
        { error: precheck.error || '文件格式不支持', success: false },
        rateLimit,
        { status: 400 }
      )
    }

    if (file.size > maxFileSize) {
      return createPublicShareResponse(
        { error: `文件大小不能超过 ${bucket === 'team-documents' ? '20MB' : '5MB'}`, success: false },
        rateLimit,
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    const signatureCheck = validateUploadFile({
      fileName: file.name,
      mimeType,
      bucket,
      fileBytes: uint8Array,
    })

    if (!signatureCheck.valid || !signatureCheck.extension) {
      return createPublicShareResponse(
        { error: signatureCheck.error || '文件内容校验失败', success: false },
        rateLimit,
        { status: 400 }
      )
    }

    const fileName = buildPublicShareOwnedStoragePath(
      {
        registrationId: shareTokenData.registration_id,
        playerId: shareTokenData.player_id,
        playerIndex: shareTokenData.player_index,
      },
      `${generateSecureId('upload')}.${signatureCheck.extension}`,
    )
    const contentType = mimeType || 'application/octet-stream'
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, uint8Array, {
        contentType,
        upsert: false,
      })

    if (uploadError || !uploadData) {
      console.error('Share upload storage failed:', uploadError)
      return createPublicShareResponse(
        { error: '文件上传失败，请稍后重试', success: false },
        rateLimit,
        { status: 500 }
      )
    }

    await writeSecurityAuditLog({
      request,
      action: 'upload_public_share_file',
      actorType: 'public_share',
      actorRole: 'public_share',
      resourceType: 'share_token',
        resourceId,
        registrationId: shareTokenData.registration_id,
        eventId: shareTokenData.event_id,
        result: 'success',
        metadata: {
        bucket,
        file_extension: signatureCheck.extension,
        file_size: file.size,
      },
    })

    return createPublicShareResponse(
      {
        success: true,
        data: {
          bucket,
          path: uploadData.path,
          url: buildStorageObjectUrl(bucket, uploadData.path, {
            shareToken: token,
          }),
          fileName,
          originalName: file.name,
          mimeType: contentType,
          size: file.size,
        },
      },
      rateLimit,
    )
  } catch (error) {
    console.error('Share upload route error:', error)
    const response = NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
    applySensitiveResponseHeaders(response.headers)
    return response
  }
}
