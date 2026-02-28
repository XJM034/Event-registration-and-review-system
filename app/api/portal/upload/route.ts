import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    // 验证教练身份
    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set() {},
          remove() {},
        },
      }
    )

    const { data: { session } } = await supabaseAuth.auth.getSession()
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const bucketValue = formData.get('bucket')
    const bucket = typeof bucketValue === 'string' && bucketValue.trim() ? bucketValue.trim() : 'player-photos'
    const allowedBuckets = new Set(['player-photos', 'registration-files', 'team-documents'])

    if (!file) {
      return NextResponse.json(
        { error: '请选择文件', success: false },
        { status: 400 }
      )
    }

    if (!allowedBuckets.has(bucket)) {
      return NextResponse.json(
        { error: '不支持的上传目录', success: false },
        { status: 400 }
      )
    }

    const allowedExtensions = new Set([
      'jpg', 'jpeg', 'png', 'gif', 'webp',
      'pdf', 'doc', 'docx', 'xls', 'xlsx'
    ])
    const allowedMimeTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ])
    const fileExt = file.name.split('.').pop()?.toLowerCase() || ''
    const mimeType = (file.type || '').toLowerCase()
    const isMimeTypeAllowed = !mimeType || allowedMimeTypes.has(mimeType)

    if (!allowedExtensions.has(fileExt) || !isMimeTypeAllowed) {
      return NextResponse.json(
        { error: '仅支持 JPG/PNG/GIF/WEBP/PDF/DOC/DOCX/XLS/XLSX 文件', success: false },
        { status: 400 }
      )
    }

    // 验证文件大小 (20MB)
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: '文件大小不能超过 20MB', success: false },
        { status: 400 }
      )
    }

    // 使用服务密钥创建 Supabase 客户端，绕过 RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // 生成唯一的文件名
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

    // 将文件转换为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    const uploadContentType = mimeType || 'application/octet-stream'

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
      const fallback = await supabase.storage
        .from(bucket)
        .upload(fileName, uint8Array, {
          contentType: 'application/octet-stream',
          upsert: false,
        })
      uploadData = fallback.data
      uploadError = fallback.error
    }

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: `文件上传失败: ${uploadError.message}`, success: false },
        { status: 500 }
      )
    }

    // 获取公共 URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName)

    console.log('Upload success:', {
      path: uploadData.path,
      url: urlData.publicUrl,
      fileName,
    })

    return NextResponse.json({
      success: true,
      data: {
        path: uploadData.path,
        url: urlData.publicUrl,
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
