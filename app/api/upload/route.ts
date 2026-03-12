import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession } from '@/lib/auth'
import {
  ALLOWED_UPLOAD_BUCKETS,
  type UploadBucket,
  validateUploadFile,
} from '@/lib/upload-file-validation'
import { generateSecureId } from '@/lib/security-random'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildStorageObjectUrl, isPrivateStorageBucket } from '@/lib/storage-object'

const MAX_FILE_SIZE = 20 * 1024 * 1024

const sanitizeFileName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()

const withValidatedExtension = (fileName: string, extension: string) => {
  const safeName = sanitizeFileName(fileName)
  const baseName = safeName.replace(/\.[^.]+$/, '') || 'file'
  return `${baseName}.${extension}`
}

const createStorageAdminClient = () => {
  return createServiceRoleClient()
}

export async function POST(request: NextRequest) {
  try {
    // 统一使用管理端会话校验（兼容 admin_session + Supabase admin 会话）
    const adminSession = await getCurrentAdminSession()
    if (!adminSession) {
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
        : 'event-posters'

    if (!file) {
      return NextResponse.json(
        { error: '请选择文件', success: false },
        { status: 400 }
      )
    }

    if (!ALLOWED_UPLOAD_BUCKETS.has(bucketRaw as UploadBucket)) {
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

    // 验证文件大小 (20MB)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: '文件大小不能超过 20MB', success: false },
        { status: 400 }
      )
    }

    // 将文件转换为 ArrayBuffer
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

    // 使用服务密钥创建 Supabase 客户端，绕过 RLS
    const supabase = createStorageAdminClient()

    // 生成“唯一目录/原始文件名”路径，既避免重名，也保留下载时的原文件名
    const uniqueDir = generateSecureId('upload')
    const preservedName = withValidatedExtension(file.name, signatureCheck.extension)
    const fileName = `${uniqueDir}/${preservedName}`

    // 上传到 Supabase Storage
    let finalContentType = mimeType || 'application/octet-stream'

    let { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, uint8Array, {
        contentType: finalContentType,
        upsert: false,
      })

    // 部分存储配置对 MIME 较严格时，降级为 octet-stream 再重试
    if (
      uploadError &&
      finalContentType !== 'application/octet-stream' &&
      /mime type .* is not supported/i.test(uploadError.message || '')
    ) {
      finalContentType = 'application/octet-stream'
      const fallback = await supabase.storage
        .from(bucket)
        .upload(fileName, uint8Array, {
          contentType: finalContentType,
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
      ? buildStorageObjectUrl(bucket, fileName)
      : supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl

    return NextResponse.json({
      success: true,
      data: {
        bucket,
        path: uploadData.path,
        url: fileUrl,
        fileName,
        originalName: file.name,
        mimeType: finalContentType,
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

export async function DELETE(request: NextRequest) {
  try {
    const adminSession = await getCurrentAdminSession()
    if (!adminSession) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const rawBody: unknown = await request.json().catch(() => null)
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json(
        { error: '请求参数无效', success: false },
        { status: 400 }
      )
    }

    const body = rawBody as Record<string, unknown>
    const bucketRaw =
      typeof body.bucket === 'string' && body.bucket.trim()
        ? body.bucket.trim()
        : 'team-documents'

    if (!ALLOWED_UPLOAD_BUCKETS.has(bucketRaw as UploadBucket)) {
      return NextResponse.json(
        { error: '不支持的上传目录', success: false },
        { status: 400 }
      )
    }
    const bucket = bucketRaw as UploadBucket

    const rawPaths =
      Array.isArray(body.paths)
        ? body.paths
        : typeof body.path === 'string'
          ? [body.path]
          : []

    const paths = rawPaths
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)

    if (paths.length === 0) {
      return NextResponse.json(
        { error: '缺少要删除的文件路径', success: false },
        { status: 400 }
      )
    }

    const hasInvalidPath = paths.some((path) => path.startsWith('/') || path.includes('..'))
    if (hasInvalidPath) {
      return NextResponse.json(
        { error: '文件路径不合法', success: false },
        { status: 400 }
      )
    }

    const supabase = createStorageAdminClient()
    const { error } = await supabase.storage.from(bucket).remove(paths)

    if (error) {
      console.error('Delete upload file error:', error)
      return NextResponse.json(
        { error: '文件删除失败，请稍后重试', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        bucket,
        deletedCount: paths.length,
      },
    })
  } catch (error) {
    console.error('Upload delete API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
