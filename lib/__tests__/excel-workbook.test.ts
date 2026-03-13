import { describe, expect, it } from 'vitest'
import { buildWorkbookBuffer, readFirstWorksheetRows } from '@/lib/excel-workbook'

describe('excel workbook helpers', () => {
  it('builds workbook buffers that can be read back from the first worksheet', async () => {
    const buffer = await buildWorkbookBuffer([
      {
        name: '教练账号导入模板',
        rows: [
          {
            手机号: '13800000001',
            姓名: '测试教练1234',
            参赛单位: '示例参赛单位A',
            备注: '备注示例',
          },
        ],
      },
    ])

    const { sheetName, rows } = await readFirstWorksheetRows(buffer, 4)

    expect(sheetName).toBe('教练账号导入模板')
    expect(rows[0]).toEqual(['手机号', '姓名', '参赛单位', '备注'])
    expect(rows[1]).toEqual(['13800000001', '测试教练1234', '示例参赛单位A', '备注示例'])
  })

  it('creates a fallback row when a sheet has no data rows', async () => {
    const buffer = await buildWorkbookBuffer([
      {
        name: '空工作表',
        rows: [],
        emptyMessage: '没有可导出的数据',
      },
    ])

    const { rows } = await readFirstWorksheetRows(buffer, 1)

    expect(rows[0]).toEqual(['信息'])
    expect(rows[1]).toEqual(['没有可导出的数据'])
  })
})
