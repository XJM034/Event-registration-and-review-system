import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession } from '@/lib/auth'
import type { TemplateDocumentType } from '@/lib/template-document-export'

const BASE_TEMPLATE_FILES: Record<TemplateDocumentType, string> = {
  registration_form: '报名表模板.pdf',
  athlete_info_form: '附件2：运动员信息表模板.pdf',
}

function parseDocumentType(value: string | null): TemplateDocumentType | null {
  return value === 'registration_form' || value === 'athlete_info_form' ? value : null
}

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 },
      )
    }

    const documentType = parseDocumentType(request.nextUrl.searchParams.get('documentType'))
    if (!documentType) {
      return NextResponse.json(
        { success: false, error: '模板类型无效' },
        { status: 400 },
      )
    }

    const fileName = BASE_TEMPLATE_FILES[documentType]
    const filePath = path.join(process.cwd(), 'docs', fileName)
    const buffer = await readFile(filePath)

    return new NextResponse(buffer as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Download base template error:', error)
    return NextResponse.json(
      { success: false, error: '下载标准模板失败' },
      { status: 500 },
    )
  }
}
