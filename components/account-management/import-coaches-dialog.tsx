'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Download, Loader2, Upload } from 'lucide-react'
import { IMPORTED_COACH_PASSWORD_RULE } from '@/lib/password-policy'

interface ImportCoachesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export default function ImportCoachesDialog({
  open,
  onOpenChange,
  onSuccess,
}: ImportCoachesDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fileName = useMemo(() => file?.name || '', [file])

  const handleDownloadTemplate = async () => {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('教练账号导入模板')
    worksheet.columns = [
      { header: '手机号', key: 'phone', width: 18 },
      { header: '姓名', key: 'name', width: 18 },
      { header: '参赛单位', key: 'school', width: 28 },
      { header: '备注', key: 'notes', width: 24 },
    ]
    worksheet.addRow({
      phone: '13800000001',
      name: '测试教练1234',
      school: '示例参赛单位A',
      notes: '备注示例',
    })
    worksheet.addRow({
      phone: '13800000002',
      name: '测试教练5678',
      school: '示例参赛单位B',
      notes: '可留空',
    })
    const output = await workbook.xlsx.writeBuffer()
    const blob = new Blob([output], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '教练账号导入模板.xlsx'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    if (!file) {
      alert('请先选择 Excel 文件')
      return
    }

    try {
      setSubmitting(true)
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/admin/coaches/import', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json()

      if (!result.success) {
        alert(`导入失败: ${result.error || '未知错误'}`)
        return
      }

      const summary = result.data
      const failedExamples = Array.isArray(summary.details)
        ? summary.details
            .filter((item: { status?: string }) => item.status === 'failed')
            .slice(0, 5)
            .map((item: { row: number; reason?: string }) => `第 ${item.row} 行: ${item.reason || '失败'}`)
        : []

      const lines = [
        `导入完成`,
        `有效行数: ${summary.processedCount}`,
        `成功创建: ${summary.createdCount}`,
        `已存在跳过: ${summary.skippedCount}`,
        `失败: ${summary.failedCount}`,
        summary.defaultPasswordRule || IMPORTED_COACH_PASSWORD_RULE,
      ]
      if (failedExamples.length > 0) {
        lines.push('', '失败示例：', ...failedExamples)
      }
      alert(lines.join('\n'))

      setFile(null)
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      console.error('Import coaches failed:', error)
      alert('导入失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>批量导入教练账号</DialogTitle>
          <DialogDescription>
            上传 Excel 文件（第一列手机号，第二列姓名，第三列参赛单位，第四列备注）。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">
            {IMPORTED_COACH_PASSWORD_RULE}，教练可登录后在“账号设置”中修改密码。
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="text-sm text-gray-600">建议先下载模板填写，再上传导入</div>
            <Button type="button" variant="outline" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              下载模板
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coach-import-file">Excel 文件</Label>
            <Input
              id="coach-import-file"
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {fileName ? (
              <p className="text-xs text-gray-500">已选择: {fileName}</p>
            ) : (
              <p className="text-xs text-gray-500">仅支持 .xlsx</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button type="button" onClick={handleImport} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            开始导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
