import ExcelJS from 'exceljs'

export interface WorkbookSheetInput {
  name: string
  rows: Array<Record<string, unknown>>
  emptyMessage?: string
}

export interface FirstWorksheetRowsResult {
  sheetName: string | null
  rows: string[][]
}

function normalizeRowHeaders(rows: Array<Record<string, unknown>>) {
  const headers: string[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        headers.push(key)
      }
    }
  }

  return headers
}

function normalizeWorkbookCellValue(value: unknown): string | number | boolean | Date {
  if (value === null || value === undefined) {
    return ''
  }

  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value instanceof Date
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map(item => normalizeWorkbookCellValue(item))
      .filter(Boolean)
      .join('，')
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

function estimateColumnWidth(header: string, values: Array<string | number | boolean | Date>) {
  const candidates = [header, ...values.map(value => String(value ?? ''))]
  const maxLength = candidates.reduce((current, value) => Math.max(current, value.length), 0)
  return Math.min(Math.max(maxLength + 2, 12), 40)
}

function extractCellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map(item => extractCellText(item)).join('')
  }

  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map(item => item.text || '').join('')
    }

    if ('text' in value && typeof value.text === 'string') {
      return value.text
    }

    if ('result' in value) {
      return extractCellText(value.result as ExcelJS.CellValue)
    }

    if ('formula' in value && typeof value.formula === 'string') {
      return value.formula
    }

    if ('hyperlink' in value && typeof value.hyperlink === 'string') {
      return value.hyperlink
    }
  }

  return String(value)
}

export async function buildWorkbookBuffer(sheets: WorkbookSheetInput[]) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Event Registration System'
  workbook.created = new Date()

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name)
    const normalizedRows = sheet.rows.length > 0
      ? sheet.rows
      : [{ 信息: sheet.emptyMessage || '暂无数据' }]
    const headers = normalizeRowHeaders(normalizedRows)
    const rowValues = normalizedRows.map((row) => (
      Object.fromEntries(
        headers.map((header) => [header, normalizeWorkbookCellValue(row[header])]),
      )
    ))

    worksheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: estimateColumnWidth(header, rowValues.map(row => row[header])),
    }))

    rowValues.forEach((row) => {
      worksheet.addRow(row)
    })
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function readFirstWorksheetRows(
  input: Buffer | Uint8Array | ArrayBuffer,
  minimumColumns = 0,
): Promise<FirstWorksheetRowsResult> {
  const workbook = new ExcelJS.Workbook()
  const buffer = input instanceof ArrayBuffer
    ? Buffer.from(input)
    : Buffer.from(input)
  const workbookInput = buffer as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]
  await workbook.xlsx.load(workbookInput)

  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    return { sheetName: null, rows: [] }
  }

  const rows: string[][] = []
  let detectedColumnCount = Math.max(minimumColumns, worksheet.columnCount)

  worksheet.eachRow({ includeEmpty: true }, (row) => {
    detectedColumnCount = Math.max(detectedColumnCount, row.cellCount)
  })

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const values: string[] = []

    for (let columnIndex = 1; columnIndex <= detectedColumnCount; columnIndex += 1) {
      values.push(extractCellText(row.getCell(columnIndex).value))
    }

    rows.push(values)
  }

  return {
    sheetName: worksheet.name,
    rows,
  }
}
