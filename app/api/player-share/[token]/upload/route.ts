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
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  PUBLIC_SHARE_ALLOWED_UPLOAD_BUCKETS,
  validateUploadFile,
} from '@/lib/upload-file-validation'
import {
  buildPublicShareOwnedStoragePath,
  buildStorageObjectUrl,
} from '@/lib/storage-object'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const BUCKET = 'player-photos'

interface RouteParams {
  params: Promise<{ token: string }>
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
      return createRateLimitResponse(
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
      return createRateLimitResponse(
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
      return createRateLimitResponse(
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
      return createRateLimitResponse(
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
      return createRateLimitResponse(
        { error: '报名信息不存在', success: false },
        rateLimit,
        { status: 404 }
      )
    }

    if (!canMutateSharedRegistration(registrationData.status)) {
      return createRateLimitResponse(
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
      return createRateLimitResponse(
        { error: '获取报名配置失败', success: false },
        rateLimit,
        { status: 500 }
      )
    }

    const selectedSettings = pickRegistrationSettings(settingsRows, divisionId)
    if (selectedSettings && isShareWriteClosed(selectedSettings.team_requirements)) {
      return createRateLimitResponse(
        { error: '当前已过填写截止时间', success: false },
        rateLimit,
        { status: 409 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return createRateLimitResponse(
        { error: '请选择文件', success: false },
        rateLimit,
        { status: 400 }
      )
    }

    if (!PUBLIC_SHARE_ALLOWED_UPLOAD_BUCKETS.has(BUCKET)) {
      return createRateLimitResponse(
        { error: '不支持的上传目录', success: false },
        rateLimit,
        { status: 400 }
      )
    }

    const mimeType = (file.type || '').toLowerCase()
    const precheck = validateUploadFile({
      fileName: file.name,
      mimeType,
      bucket: BUCKET,
    })

    if (!precheck.valid) {
      return createRateLimitResponse(
        { error: precheck.error || '文件格式不支持', success: false },
        rateLimit,
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return createRateLimitResponse(
        { error: '文件大小不能超过 5MB', success: false },
        rateLimit,
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    const signatureCheck = validateUploadFile({
      fileName: file.name,
      mimeType,
      bucket: BUCKET,
      fileBytes: uint8Array,
    })

    if (!signatureCheck.valid || !signatureCheck.extension) {
      return createRateLimitResponse(
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
      .from(BUCKET)
      .upload(fileName, uint8Array, {
        contentType,
        upsert: false,
      })

    if (uploadError || !uploadData) {
      console.error('Share upload storage failed:', uploadError)
      return createRateLimitResponse(
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
        bucket: BUCKET,
        file_extension: signatureCheck.extension,
        file_size: file.size,
      },
    })

    return createRateLimitResponse(
      {
        success: true,
        data: {
          bucket: BUCKET,
          path: uploadData.path,
          url: buildStorageObjectUrl(BUCKET, uploadData.path, {
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
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
