import { NextRequest, NextResponse } from 'next/server'
import {
  COACH_ALLOWED_UPLOAD_BUCKETS,
  type UploadBucket,
  validateUploadFile,
} from '@/lib/upload-file-validation'
import { getCurrentCoachSession } from '@/lib/auth'
import { generateSecureId } from '@/lib/security-random'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  buildCoachOwnedStoragePath,
  buildStorageObjectUrl,
  isPrivateStorageBucket,
} from '@/lib/storage-object'

const MAX_FILE_SIZE = 20 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const coachSession = await getCurrentCoachSession()
    if (!coachSession?.user?.id) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const bucketValue = formData.get('bucket')
    const bucketRaw =
      typeof bucketValue === 'string' && bucketValue.trim()
        ? bucketValue.trim()
        : 'player-photos'

    if (!file) {
      return NextResponse.json(
        { error: '请选择文件', success: false },
        { status: 400 }
      )
    }

    if (!COACH_ALLOWED_UPLOAD_BUCKETS.has(bucketRaw as UploadBucket)) {
      return NextResponse.json(
        { error: '不支持的上传目录', success: false },
        { status: 400 }
      )
    }
    const bucket = bucketRaw as UploadBucket
    const mimeType = (file.type || '').toLowerCase()
    const precheck = validateUploadFile({
      fileName: file.name,
      mimeType,
      bucket,
    })
    if (!precheck.valid) {
      return NextResponse.json(
        { error: precheck.error || '文件格式不支持', success: false },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: '文件大小不能超过 20MB', success: false },
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
      return NextResponse.json(
        { error: signatureCheck.error || '文件内容校验失败', success: false },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()
    const fileName = buildCoachOwnedStoragePath(
      coachSession.user.id,
      `${generateSecureId('upload')}.${signatureCheck.extension}`,
    )
    let uploadContentType = mimeType || 'application/octet-stream'

    // 上传到 Supabase Storage
    let { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, uint8Array, {
        contentType: uploadContentType,
        upsert: false,
      })

    // 部分存储服务/桶配置对 MIME 较严格时，降级为 octet-stream 再重试
    if (
      uploadError &&
      uploadContentType !== 'application/octet-stream' &&
      /mime type .* is not supported/i.test(uploadError.message || '')
    ) {
      uploadContentType = 'application/octet-stream'
      const fallback = await supabase.storage
        .from(bucket)
        .upload(fileName, uint8Array, {
          contentType: uploadContentType,
          upsert: false,
        })
      uploadData = fallback.data
      uploadError = fallback.error
    }

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: '文件上传失败，请稍后重试', success: false },
        { status: 500 }
      )
    }

    if (!uploadData) {
      return NextResponse.json(
        { error: '上传结果为空', success: false },
        { status: 500 }
      )
    }

    const fileUrl = isPrivateStorageBucket(bucket)
      ? buildStorageObjectUrl(bucket, uploadData.path)
      : supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl

    console.log('Upload success:', {
      path: uploadData.path,
      url: fileUrl,
      fileName,
    })

    return NextResponse.json({
      success: true,
      data: {
        bucket,
        path: uploadData.path,
        url: fileUrl,
        fileName,
        originalName: file.name,
        mimeType: uploadContentType,
        size: file.size,
      },
    })
  } catch (error) {
    console.error('Upload API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
