import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const bucket = formData.get('bucket') as string || 'player-photos'

    if (!file) {
      return NextResponse.json(
        { error: '请选择文件', success: false },
        { status: 400 }
      )
    }

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: '请上传图片文件', success: false },
        { status: 400 }
      )
    }

    // 验证文件大小 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: '文件大小不能超过 5MB', success: false },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // 生成唯一的文件名
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

    // 将文件转换为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    // 上传到 Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, uint8Array, {
        contentType: file.type,
        upsert: false,
      })

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