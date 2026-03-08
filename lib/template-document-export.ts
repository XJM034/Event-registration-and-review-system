import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, rgb, type PDFImage, type PDFPage } from 'pdf-lib'
import fontkit, { type Font as FontkitFont, type Glyph } from '@pdf-lib/fontkit'
import ExcelJS from 'exceljs'
import type { EventReferenceTemplate, ReferenceTemplateType } from './types'
import { findReferenceTemplateByType, getReferenceTemplateTypeLabel, normalizeReferenceTemplateType } from './reference-templates'
import { toSafeHttpUrl } from './url-security'

export type TemplateDocumentType = Extract<ReferenceTemplateType, 'registration_form' | 'athlete_info_form'>
export type TemplateExportFormat = 'pdf' | 'excel'

type DivisionRules = {
  minPlayers?: number
  maxPlayers?: number
}

type TemplateTextOverride = {
  title?: string
  attachmentLabel?: string
}

type TemplateExportSource = {
  eventName: string
  teamData: Record<string, unknown>
  playersData: Array<Record<string, unknown>>
  referenceTemplates: EventReferenceTemplate[]
  templateTextOverrides?: Partial<Record<TemplateDocumentType, TemplateTextOverride>>
  divisionName?: string
  divisionRules?: DivisionRules
  roleNameMap?: Record<string, string>
}

type TemplateExportOptions = {
  requiredDocumentTypes?: TemplateDocumentType[]
}

type ExportPerson = {
  index: number
  roleId: string
  roleName: string
  roleLabel: string
  name: string
  gender: string
  idType: string
  idNumber: string
  playerNumber: string
  contact: string
  photoUrl: string
}

type PreparedTemplateExport = {
  eventName: string
  unitName: string
  teamName: string
  groupName: string
  leaders: ExportPerson[]
  coaches: ExportPerson[]
  otherStaff: ExportPerson[]
  players: ExportPerson[]
  athleteCards: ExportPerson[]
  warnings: string[]
  blockingIssues: string[]
  templates: Record<TemplateDocumentType, EventReferenceTemplate | null>
  templateTextOverrides: Partial<Record<TemplateDocumentType, TemplateTextOverride>>
}

type CellBox = {
  left: number
  top: number
  right: number
  bottom: number
}

type AthleteSlotKind = 'leader' | 'coach' | 'player'

type SlotLayout = {
  photo: CellBox
  name: CellBox
  detail: CellBox
  kind: AthleteSlotKind
}

const REGISTRATION_FORM_ROW_LINES = [
  194.25, 238.5, 265.75, 292.75, 318.75, 345.25, 371.75, 395.5, 419.5, 444.5,
  468.5, 492.25, 516.25, 540.25, 564.75, 588.75, 612.5, 636.5, 660.5, 685.0, 709.0, 733.25,
]
const REGISTRATION_FORM_COLUMNS = {
  left: 59.26,
  serial: 122.65,
  name: 228.55,
  gender: 286.0,
  idType: 375.0,
  right: 535.25,
}
const REGISTRATION_FORM_FOOTER = { left: 65, top: 772, right: 126, bottom: 797 }
const REGISTRATION_FORM_TITLE_CLEAR_BOX = { left: 82, top: 142, right: 510, bottom: 242 }
const REGISTRATION_FORM_ATTACHMENT_LABEL_BOX = { left: 58, top: 104, right: 122, bottom: 136 }
const REGISTRATION_FORM_ROW_COUNT = 15

const ATHLETE_PAGE_1_COLUMNS = [46.5, 171.6, 296.5, 416.9, 548.0]
const ATHLETE_PAGE_1_ROWS = [218.94, 405.59, 437.04, 469.49, 660.94, 693.39, 725.09]
const ATHLETE_PAGE_2_COLUMNS = [46.5, 171.1, 297.0, 416.9, 547.5]
const ATHLETE_PAGE_2_ROWS = [87.85, 276.84, 308.29, 340.29, 487.69, 518.64, 551.09, 685.49, 716.44, 748.64]
const ATHLETE_PAGE_1_TITLE_CLEAR_BOX = { left: 102, top: 115, right: 492, bottom: 210 }
const ATHLETE_PAGE_1_ATTACHMENT_LABEL_BOX = { left: 43, top: 96, right: 108, bottom: 128 }
const ATHLETE_PAGE_1_FOOTER = { left: 70, top: 772, right: 126, bottom: 798 }
const ATHLETE_PAGE_2_FOOTER = { left: 438, top: 777, right: 505, bottom: 805 }
const ATHLETE_PAGE_1_SLOT_KINDS: AthleteSlotKind[] = [
  'leader',
  'coach',
  'coach',
  'player',
  'player',
  'player',
  'player',
  'player',
]
const ATHLETE_NAME_VALUE_LEFT_INSET = 38
const ATHLETE_NUMBER_VALUE_LEFT_INSET = 66

let cachedChineseFontBytes: Uint8Array | null = null
let cachedChineseFont: FontkitFont | null = null
const glyphPathCache = new Map<number, string>()

type FontPathCommand = {
  command: 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath'
  args: number[]
}

function sanitizeFileNamePart(value: string, fallback: string): string {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim()
  return cleaned || fallback
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

function toPhotoUrl(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object' && 'url' in value) {
    return toText((value as { url?: unknown }).url)
  }
  return ''
}

function getFieldValue(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    const normalized = key.includes('photo') ? toPhotoUrl(value) : toText(value)
    if (normalized) return normalized
  }
  return ''
}

function resolveRoleName(roleId: string, roleNameMap?: Record<string, string>): string {
  const mapped = roleNameMap?.[roleId]
  if (mapped) return mapped
  if (roleId === 'player') return '队员'
  if (roleId === 'leader') return '领队'
  if (roleId === 'coach') return '教练'
  return roleId
}

function isLeaderRole(roleId: string, roleName: string): boolean {
  return roleId === 'leader' || roleName.includes('领队')
}

function isCoachRole(roleId: string, roleName: string): boolean {
  return roleId === 'coach' || roleName.includes('教练')
}

function isPlayerRole(roleId: string, roleName: string): boolean {
  return roleId === 'player' || roleName.includes('队员')
}

function normalizeRoleLabel(roleId: string, roleName: string): string {
  if (isLeaderRole(roleId, roleName)) return '领队'
  if (isCoachRole(roleId, roleName)) return '教练'
  if (isPlayerRole(roleId, roleName)) return '队员'
  return roleName || roleId
}

function wrapText(
  text: string,
  font: FontkitFont,
  size: number,
  maxWidth: number,
  maxLines = 2,
): string[] {
  const value = text.trim()
  if (!value) return ['']

  const lines: string[] = []
  let current = ''

  for (const char of value) {
    const next = `${current}${char}`
    if (!current || widthOfTextAtSize(next, font, size) <= maxWidth) {
      current = next
      continue
    }

    lines.push(current)
    current = char

    if (lines.length === maxLines - 1) {
      break
    }
  }

  const remaining = lines.length === maxLines - 1 ? `${current}${value.slice(lines.join('').length + current.length)}` : current

  if (remaining) {
    let finalLine = remaining
    while (widthOfTextAtSize(finalLine, font, size) > maxWidth && finalLine.length > 1) {
      finalLine = finalLine.slice(0, -1)
    }
    if (finalLine !== remaining && finalLine.length > 1) {
      finalLine = `${finalLine.slice(0, -1)}…`
    }
    lines.push(finalLine)
  }

  return lines.slice(0, maxLines)
}

function widthOfTextAtSize(text: string, font: FontkitFont, size: number): number {
  if (!text.trim()) return 0
  return (font.layout(text).advanceWidth / font.unitsPerEm) * size
}

function fitFontSize(text: string, font: FontkitFont, maxWidth: number, preferred: number, min = 8): number {
  const value = text.trim()
  if (!value) return preferred

  let size = preferred
  while (size > min && widthOfTextAtSize(value, font, size) > maxWidth) {
    size -= 0.5
  }
  return size
}

function glyphToPdfSvgPath(glyph: Glyph): string {
  const cached = glyphPathCache.get(glyph.id)
  if (cached !== undefined) return cached

  const commands = (glyph.path as { commands?: FontPathCommand[] }).commands || []
  const pathData = commands
    .map((command) => {
      const { args } = command
      switch (command.command) {
        case 'moveTo':
          return `M${args[0]} ${-args[1]}`
        case 'lineTo':
          return `L${args[0]} ${-args[1]}`
        case 'quadraticCurveTo':
          return `Q${args[0]} ${-args[1]} ${args[2]} ${-args[3]}`
        case 'bezierCurveTo':
          return `C${args[0]} ${-args[1]} ${args[2]} ${-args[3]} ${args[4]} ${-args[5]}`
        case 'closePath':
          return 'Z'
        default:
          return ''
      }
    })
    .join(' ')
    .trim()

  glyphPathCache.set(glyph.id, pathData)
  return pathData
}

function drawTextLineAsPath(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: FontkitFont,
  size: number,
  color: ReturnType<typeof rgb>,
): void {
  if (!text.trim()) return

  const run = font.layout(text)
  const scale = size / font.unitsPerEm
  let cursorX = x

  run.glyphs.forEach((glyph, index) => {
    const position = run.positions[index]
    const pathData = glyphToPdfSvgPath(glyph)
    if (pathData) {
      page.drawSvgPath(pathData, {
        x: cursorX + position.xOffset * scale,
        y: y - position.yOffset * scale,
        scale,
        color,
        borderWidth: 0,
      })
    }

    cursorX += position.xAdvance * scale
  })
}

function drawTopRectangle(page: PDFPage, box: CellBox, color = rgb(1, 1, 1)): void {
  page.drawRectangle({
    x: box.left,
    y: page.getHeight() - box.bottom,
    width: box.right - box.left,
    height: box.bottom - box.top,
    color,
  })
}

function drawHorizontalLine(
  page: PDFPage,
  left: number,
  right: number,
  top: number,
  options?: { thickness?: number; color?: ReturnType<typeof rgb> },
): void {
  page.drawLine({
    start: { x: left, y: page.getHeight() - top },
    end: { x: right, y: page.getHeight() - top },
    thickness: options?.thickness ?? 0.8,
    color: options?.color ?? rgb(0, 0, 0),
  })
}

function drawTextInBox(
  page: PDFPage,
  text: string,
  box: CellBox,
  font: FontkitFont,
  options?: {
    size?: number
    color?: ReturnType<typeof rgb>
    align?: 'left' | 'center'
    maxLines?: number
    paddingX?: number
    paddingY?: number
    lineHeight?: number
  },
): void {
  const color = options?.color || rgb(0, 0, 0)
  const paddingX = options?.paddingX ?? 4
  const paddingY = options?.paddingY ?? 2
  const align = options?.align || 'left'
  const preferredSize = options?.size ?? 10
  const innerWidth = Math.max(0, box.right - box.left - paddingX * 2)

  if (!text.trim() || innerWidth <= 0) return

  const size = fitFontSize(text, font, innerWidth, preferredSize)
  const maxLines = options?.maxLines ?? 1
  const lines = maxLines === 1 ? [text.trim()] : wrapText(text, font, size, innerWidth, maxLines)
  const lineHeight = options?.lineHeight ?? size + 1.5
  const totalHeight = lineHeight * lines.length
  let currentTop = box.top + Math.max(paddingY, ((box.bottom - box.top) - totalHeight) / 2)

  lines.forEach((line) => {
    const lineWidth = widthOfTextAtSize(line, font, size)
    const x = align === 'center'
      ? box.left + ((box.right - box.left) - lineWidth) / 2
      : box.left + paddingX

    drawTextLineAsPath(page, line, x, page.getHeight() - currentTop - size, font, size, color)
    currentTop += lineHeight
  })
}

async function getChineseFontBytes(): Promise<Uint8Array> {
  if (cachedChineseFontBytes) return cachedChineseFontBytes

  const bundledFontPath = path.join(process.cwd(), 'assets/fonts/NotoSansCJKsc-Regular.otf')
  cachedChineseFontBytes = await readFile(bundledFontPath)
  return cachedChineseFontBytes
}

async function getChineseFont(): Promise<FontkitFont> {
  if (cachedChineseFont) return cachedChineseFont

  const chineseFontBytes = await getChineseFontBytes()
  cachedChineseFont = fontkit.create(chineseFontBytes)
  return cachedChineseFont
}

async function fetchBinary(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const safeUrl = toSafeHttpUrl(url)
  if (!safeUrl) {
    throw new Error('文件地址无效')
  }

  const response = await fetch(safeUrl)
  if (!response.ok) {
    throw new Error(`下载文件失败: HTTP ${response.status}`)
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || '',
  }
}

function guessImageExtension(url: string, contentType: string): 'png' | 'jpeg' | null {
  const lowerContentType = contentType.toLowerCase()
  if (lowerContentType.includes('png')) return 'png'
  if (lowerContentType.includes('jpeg') || lowerContentType.includes('jpg')) return 'jpeg'

  const normalizedUrl = url.toLowerCase()
  if (normalizedUrl.includes('.png')) return 'png'
  if (normalizedUrl.includes('.jpg') || normalizedUrl.includes('.jpeg')) return 'jpeg'

  return null
}

async function embedImageFromUrl(
  pdfDoc: PDFDocument,
  url: string,
): Promise<{ image: PDFImage; bytes: Uint8Array; extension: 'png' | 'jpeg' } | null> {
  if (!url) return null

  const { bytes, contentType } = await fetchBinary(url)
  const extension = guessImageExtension(url, contentType)
  if (!extension) return null

  const image = extension === 'png'
    ? await pdfDoc.embedPng(bytes)
    : await pdfDoc.embedJpg(bytes)

  return { image, bytes, extension }
}

function drawImageContain(page: PDFPage, image: PDFImage, box: CellBox): void {
  const maxWidth = box.right - box.left
  const maxHeight = box.bottom - box.top
  const widthScale = maxWidth / image.width
  const heightScale = maxHeight / image.height
  const scale = Math.min(widthScale, heightScale)
  const width = image.width * scale
  const height = image.height * scale
  const x = box.left + (maxWidth - width) / 2
  const y = page.getHeight() - box.top - ((maxHeight - height) / 2) - height

  page.drawImage(image, { x, y, width, height })
}

function getRegistrationDataRowBox(rowIndex: number): CellBox {
  const top = REGISTRATION_FORM_ROW_LINES[6 + rowIndex]
  const bottom = REGISTRATION_FORM_ROW_LINES[7 + rowIndex]
  return {
    left: REGISTRATION_FORM_COLUMNS.left + 1.5,
    top: top + 1.2,
    right: REGISTRATION_FORM_COLUMNS.right - 1.5,
    bottom: bottom - 1.2,
  }
}

function getAthletePage1Slots(): SlotLayout[] {
  const slots: SlotLayout[] = []
  for (let rowIndex = 0; rowIndex < 2; rowIndex++) {
    const rowOffset = rowIndex * 3
    const photoTop = ATHLETE_PAGE_1_ROWS[rowOffset]
    const photoBottom = ATHLETE_PAGE_1_ROWS[rowOffset + 1]
    const nameTop = ATHLETE_PAGE_1_ROWS[rowOffset + 1]
    const nameBottom = ATHLETE_PAGE_1_ROWS[rowOffset + 2]
    const detailTop = ATHLETE_PAGE_1_ROWS[rowOffset + 2]
    const detailBottom = ATHLETE_PAGE_1_ROWS[rowOffset + 3]

    for (let colIndex = 0; colIndex < 4; colIndex++) {
      const left = ATHLETE_PAGE_1_COLUMNS[colIndex]
      const right = ATHLETE_PAGE_1_COLUMNS[colIndex + 1]
      slots.push({
        photo: { left: left + 4, top: photoTop + 4, right: right - 4, bottom: photoBottom - 4 },
        name: { left: left + 4, top: nameTop + 2, right: right - 4, bottom: nameBottom - 2 },
        detail: { left: left + 4, top: detailTop + 2, right: right - 4, bottom: detailBottom - 2 },
        kind: ATHLETE_PAGE_1_SLOT_KINDS[slots.length] || 'player',
      })
    }
  }
  return slots
}

function getAthletePage2Slots(): SlotLayout[] {
  const slots: SlotLayout[] = []
  for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
    const rowOffset = rowIndex * 3
    const photoTop = ATHLETE_PAGE_2_ROWS[rowOffset]
    const photoBottom = ATHLETE_PAGE_2_ROWS[rowOffset + 1]
    const nameTop = ATHLETE_PAGE_2_ROWS[rowOffset + 1]
    const nameBottom = ATHLETE_PAGE_2_ROWS[rowOffset + 2]
    const detailTop = ATHLETE_PAGE_2_ROWS[rowOffset + 2]
    const detailBottom = ATHLETE_PAGE_2_ROWS[rowOffset + 3]

    for (let colIndex = 0; colIndex < 4; colIndex++) {
      const left = ATHLETE_PAGE_2_COLUMNS[colIndex]
      const right = ATHLETE_PAGE_2_COLUMNS[colIndex + 1]
      slots.push({
        photo: { left: left + 4, top: photoTop + 4, right: right - 4, bottom: photoBottom - 4 },
        name: { left: left + 4, top: nameTop + 2, right: right - 4, bottom: nameBottom - 2 },
        detail: { left: left + 4, top: detailTop + 2, right: right - 4, bottom: detailBottom - 2 },
        kind: 'player',
      })
    }
  }
  return slots
}

function buildPreparedTemplateExport(
  source: TemplateExportSource,
  options?: TemplateExportOptions,
): PreparedTemplateExport {
  const warnings: string[] = []
  const blockingIssues: string[] = []
  const roleNameMap = source.roleNameMap || {}
  const requiredDocumentTypes = options?.requiredDocumentTypes || [
    'registration_form',
    'athlete_info_form',
  ]

  const templates: Record<TemplateDocumentType, EventReferenceTemplate | null> = {
    registration_form: findReferenceTemplateByType(source.referenceTemplates, 'registration_form'),
    athlete_info_form: findReferenceTemplateByType(source.referenceTemplates, 'athlete_info_form'),
  }

  requiredDocumentTypes.forEach((templateType) => {
    const template = templates[templateType]
    if (!template) {
      blockingIssues.push(`未上传${getReferenceTemplateTypeLabel(templateType)}模板，请在报名设置中上传`)
      return
    }

    const name = template.name || ''
    const mimeType = (template.mimeType || '').toLowerCase()
    const pathLike = `${template.path || ''} ${template.url || ''} ${name}`.toLowerCase()
    const isPdf = mimeType.includes('pdf') || pathLike.includes('.pdf')
    if (!isPdf) {
      blockingIssues.push(`${getReferenceTemplateTypeLabel(templateType)}模板必须上传 PDF 文件`)
    }
  })

  const unitName = getFieldValue(source.teamData, 'unit', '参赛单位')
  const teamName = getFieldValue(source.teamData, 'name', '队伍名称', 'team_name')
  const groupName = source.divisionName || getFieldValue(source.teamData, 'participationGroup', '参赛组别', 'group')

  if (!unitName) warnings.push('参赛单位未填写，导出时将留空')
  if (!teamName) warnings.push('参赛队伍未填写，导出时将留空')
  if (!groupName) warnings.push('参赛组别未填写，导出时将留空')

  const participants = source.playersData.map((player, index) => {
    const roleId = getFieldValue(player, 'role', 'roleId') || 'player'
    const roleName = resolveRoleName(roleId, roleNameMap)

    return {
      index,
      roleId,
      roleName,
      roleLabel: normalizeRoleLabel(roleId, roleName),
      name: getFieldValue(player, 'name', '姓名'),
      gender: getFieldValue(player, 'gender', 'sex', '性别'),
      idType: getFieldValue(player, 'id_type', '证件类型'),
      idNumber: getFieldValue(player, 'id_number', '证件号码', '身份证号码'),
      playerNumber: getFieldValue(player, 'player_number', '参赛号码', '比赛服号码'),
      contact: getFieldValue(player, 'contact', 'contact_phone', '联系方式', '联系电话'),
      photoUrl: getFieldValue(player, 'id_photo', '证件照'),
    } satisfies ExportPerson
  })

  const leaders = participants.filter((person) => isLeaderRole(person.roleId, person.roleName))
  const coaches = participants.filter((person) => isCoachRole(person.roleId, person.roleName))
  const players = participants.filter((person) => isPlayerRole(person.roleId, person.roleName))
  const otherStaff = participants.filter(
    (person) =>
      !isLeaderRole(person.roleId, person.roleName) &&
      !isCoachRole(person.roleId, person.roleName) &&
      !isPlayerRole(person.roleId, person.roleName),
  )

  const athleteCards = [...leaders, ...coaches, ...otherStaff, ...players]

  if (leaders.length === 0) warnings.push('未添加领队，报名表和运动员信息表中领队位置将留空')
  if (coaches.length === 0) warnings.push('未添加教练，报名表和运动员信息表中教练位置将留空')

  const divisionRules = source.divisionRules
  if (divisionRules?.minPlayers !== undefined && players.length < divisionRules.minPlayers) {
    blockingIssues.push(`当前队员人数为 ${players.length}，少于组别最少人数 ${divisionRules.minPlayers}`)
  }
  if (divisionRules?.maxPlayers !== undefined && players.length > divisionRules.maxPlayers) {
    blockingIssues.push(`当前队员人数为 ${players.length}，超过组别最多人数 ${divisionRules.maxPlayers}`)
  }

  leaders.forEach((person, index) => {
    if (!person.name) warnings.push(`领队${index + 1} 未填写姓名，导出时将留空`)
    if (!person.contact) warnings.push(`领队${index + 1} 未填写联系方式，导出时将留空`)
    if (!person.photoUrl) warnings.push(`领队${index + 1} 未上传证件照，导出时将留空`)
  })

  coaches.forEach((person, index) => {
    if (!person.name) warnings.push(`教练${index + 1} 未填写姓名，导出时将留空`)
    if (!person.contact) warnings.push(`教练${index + 1} 未填写联系方式，导出时将留空`)
    if (!person.photoUrl) warnings.push(`教练${index + 1} 未上传证件照，导出时将留空`)
  })

  otherStaff.forEach((person, index) => {
    if (!person.name) warnings.push(`${person.roleLabel || '其他人员'}${index + 1} 未填写姓名，导出时将留空`)
    if (!person.photoUrl) warnings.push(`${person.roleLabel || '其他人员'}${index + 1} 未上传证件照，导出时将留空`)
  })

  players.forEach((person, index) => {
    if (!person.name) warnings.push(`队员${index + 1} 未填写姓名，导出时将留空`)
    if (!person.gender) warnings.push(`队员${index + 1} 未填写性别，导出时将留空`)
    if (!person.idType) warnings.push(`队员${index + 1} 未填写证件类型，导出时将留空`)
    if (!person.idNumber) warnings.push(`队员${index + 1} 未填写证件号码，导出时将留空`)
    if (!person.playerNumber) warnings.push(`队员${index + 1} 未填写比赛服号码，导出时将留空`)
    if (!person.photoUrl) warnings.push(`队员${index + 1} 未上传证件照，导出时将留空`)
  })

  return {
    eventName: source.eventName,
    unitName,
    teamName,
    groupName,
    leaders,
    coaches,
    otherStaff,
    players,
    athleteCards,
    warnings,
    blockingIssues,
    templates,
    templateTextOverrides: source.templateTextOverrides || {},
  }
}

function formatPageNumber(pageNumber: number): string {
  return `—${pageNumber}—`
}

function aggregateNames(people: ExportPerson[]): string {
  return people.map((person) => person.name).filter(Boolean).join('、')
}

function aggregateContacts(people: ExportPerson[]): string {
  return people.map((person) => person.contact).filter(Boolean).join('、')
}

async function generateRegistrationFormPdf(prepared: PreparedTemplateExport): Promise<Buffer> {
  const template = prepared.templates.registration_form
  if (!template?.url) {
    throw new Error('报名表模板不存在')
  }

  const { bytes } = await fetchBinary(template.url)
  const templatePdf = await PDFDocument.load(bytes)
  const outputPdf = await PDFDocument.create()
  const chinese = await getChineseFont()

  const playerPages = Math.max(1, Math.ceil(prepared.players.length / REGISTRATION_FORM_ROW_COUNT))

  for (let pageIndex = 0; pageIndex < playerPages; pageIndex++) {
    const [page] = await outputPdf.copyPages(templatePdf, [0])
    outputPdf.addPage(page)
    const registrationOverride = prepared.templateTextOverrides.registration_form

    if (pageIndex === 0 && registrationOverride?.attachmentLabel?.trim()) {
      drawTopRectangle(page, REGISTRATION_FORM_ATTACHMENT_LABEL_BOX)
      drawTextInBox(page, registrationOverride.attachmentLabel.trim(), REGISTRATION_FORM_ATTACHMENT_LABEL_BOX, chinese, {
        size: 12,
      })
    }

    if (pageIndex === 0 && registrationOverride?.title?.trim()) {
      drawTopRectangle(page, REGISTRATION_FORM_TITLE_CLEAR_BOX)
      drawTextInBox(page, registrationOverride.title.trim(), REGISTRATION_FORM_TITLE_CLEAR_BOX, chinese, {
        size: 16,
        align: 'center',
        maxLines: 3,
        lineHeight: 18,
      })
    }

    drawTextInBox(
      page,
      prepared.unitName,
      {
        left: REGISTRATION_FORM_COLUMNS.left + 72,
        top: REGISTRATION_FORM_ROW_LINES[1] + 4,
        right: REGISTRATION_FORM_COLUMNS.right - 6,
        bottom: REGISTRATION_FORM_ROW_LINES[2] - 4,
      },
      chinese,
      { size: 10.5, maxLines: 2 },
    )

    drawTextInBox(
      page,
      prepared.teamName,
      {
        left: REGISTRATION_FORM_COLUMNS.left + 72,
        top: REGISTRATION_FORM_ROW_LINES[2] + 4,
        right: REGISTRATION_FORM_COLUMNS.gender - 6,
        bottom: REGISTRATION_FORM_ROW_LINES[3] - 4,
      },
      chinese,
      { size: 10.2, maxLines: 2 },
    )

    drawTextInBox(
      page,
      prepared.groupName,
      {
        left: REGISTRATION_FORM_COLUMNS.gender + 72,
        top: REGISTRATION_FORM_ROW_LINES[2] + 4,
        right: REGISTRATION_FORM_COLUMNS.right - 6,
        bottom: REGISTRATION_FORM_ROW_LINES[3] - 4,
      },
      chinese,
      { size: 10.2, maxLines: 2 },
    )

    drawTextInBox(
      page,
      aggregateNames(prepared.leaders),
      {
        left: REGISTRATION_FORM_COLUMNS.serial + 6,
        top: REGISTRATION_FORM_ROW_LINES[3] + 3,
        right: REGISTRATION_FORM_COLUMNS.gender - 6,
        bottom: REGISTRATION_FORM_ROW_LINES[4] - 3,
      },
      chinese,
      { size: 10.2, maxLines: 2 },
    )
    drawTextInBox(
      page,
      aggregateContacts(prepared.leaders),
      {
        left: REGISTRATION_FORM_COLUMNS.idType + 6,
        top: REGISTRATION_FORM_ROW_LINES[3] + 3,
        right: REGISTRATION_FORM_COLUMNS.right - 6,
        bottom: REGISTRATION_FORM_ROW_LINES[4] - 3,
      },
      chinese,
      { size: 10.2, maxLines: 2 },
    )

    drawTextInBox(
      page,
      aggregateNames(prepared.coaches),
      {
        left: REGISTRATION_FORM_COLUMNS.serial + 6,
        top: REGISTRATION_FORM_ROW_LINES[4] + 3,
        right: REGISTRATION_FORM_COLUMNS.gender - 6,
        bottom: REGISTRATION_FORM_ROW_LINES[5] - 3,
      },
      chinese,
      { size: 10.2, maxLines: 2 },
    )
    drawTextInBox(
      page,
      aggregateContacts(prepared.coaches),
      {
        left: REGISTRATION_FORM_COLUMNS.idType + 6,
        top: REGISTRATION_FORM_ROW_LINES[4] + 3,
        right: REGISTRATION_FORM_COLUMNS.right - 6,
        bottom: REGISTRATION_FORM_ROW_LINES[5] - 3,
      },
      chinese,
      { size: 10.2, maxLines: 2 },
    )

    const pagePlayers = prepared.players.slice(
      pageIndex * REGISTRATION_FORM_ROW_COUNT,
      (pageIndex + 1) * REGISTRATION_FORM_ROW_COUNT,
    )

    for (let rowIndex = 0; rowIndex < REGISTRATION_FORM_ROW_COUNT; rowIndex++) {
      const rowTop = REGISTRATION_FORM_ROW_LINES[6 + rowIndex]
      const rowBottom = REGISTRATION_FORM_ROW_LINES[7 + rowIndex]
      const player = pagePlayers[rowIndex]
      const serialValue = String(pageIndex * REGISTRATION_FORM_ROW_COUNT + rowIndex + 1)
      const serialBox = {
        left: REGISTRATION_FORM_COLUMNS.left + 1.5,
        top: rowTop + 1.2,
        right: REGISTRATION_FORM_COLUMNS.serial - 1.5,
        bottom: rowBottom - 1.2,
      }
      const nameBox = {
        left: REGISTRATION_FORM_COLUMNS.serial + 1.5,
        top: rowTop + 1.2,
        right: REGISTRATION_FORM_COLUMNS.name - 1.5,
        bottom: rowBottom - 1.2,
      }
      const genderBox = {
        left: REGISTRATION_FORM_COLUMNS.name + 1.5,
        top: rowTop + 1.2,
        right: REGISTRATION_FORM_COLUMNS.gender - 1.5,
        bottom: rowBottom - 1.2,
      }
      const idTypeBox = {
        left: REGISTRATION_FORM_COLUMNS.gender + 1.5,
        top: rowTop + 1.2,
        right: REGISTRATION_FORM_COLUMNS.idType - 1.5,
        bottom: rowBottom - 1.2,
      }
      const idNumberBox = {
        left: REGISTRATION_FORM_COLUMNS.idType + 1.5,
        top: rowTop + 1.2,
        right: REGISTRATION_FORM_COLUMNS.right - 1.5,
        bottom: rowBottom - 1.2,
      }

      drawTopRectangle(page, serialBox)
      drawTextInBox(page, serialValue, serialBox, chinese, { size: 10, align: 'center' })

      if (!player) continue

      drawTopRectangle(page, nameBox)
      drawTextInBox(page, player.name, nameBox, chinese, { size: 10, align: 'center' })

      drawTopRectangle(page, genderBox)
      drawTextInBox(page, player.gender, genderBox, chinese, { size: 10, align: 'center' })

      if (player.idType && (player.idType !== '身份证' || rowIndex >= 9 || pageIndex > 0)) {
        drawTopRectangle(page, idTypeBox)
        drawTextInBox(page, player.idType, idTypeBox, chinese, { size: 10, align: 'center' })
      }

      drawTopRectangle(page, idNumberBox)
      drawTextInBox(page, player.idNumber, idNumberBox, chinese, { size: 9.2, align: 'center' })
    }
  }

  return Buffer.from(await outputPdf.save())
}

async function generateAthleteInfoPdf(prepared: PreparedTemplateExport): Promise<Buffer> {
  const template = prepared.templates.athlete_info_form
  if (!template?.url) {
    throw new Error('运动员信息表模板不存在')
  }

  const { bytes } = await fetchBinary(template.url)
  const templatePdf = await PDFDocument.load(bytes)
  const outputPdf = await PDFDocument.create()
  const chinese = await getChineseFont()
  const firstPageSlots = getAthletePage1Slots()
  const followPageSlots = getAthletePage2Slots()
  const leaderQueue = [...prepared.leaders]
  const coachQueue = [...prepared.coaches, ...prepared.otherStaff]
  const playerQueue = [...prepared.players]
  const firstPageCards = firstPageSlots.map((slot) => {
    if (slot.kind === 'leader') return leaderQueue.shift()
    if (slot.kind === 'coach') return coachQueue.shift()
    return playerQueue.shift()
  })
  const overflowCards = [...leaderQueue, ...coachQueue, ...playerQueue]
  const extraPageCount = overflowCards.length > 0 ? Math.ceil(overflowCards.length / followPageSlots.length) : 0
  const totalPages = Math.max(1, 1 + extraPageCount)

  const cachedImages = new Map<string, { image: PDFImage; bytes: Uint8Array; extension: 'png' | 'jpeg' } | null>()
  const getCachedImage = async (url: string) => {
    if (!url) return null
    if (cachedImages.has(url)) return cachedImages.get(url) || null
    try {
      const embedded = await embedImageFromUrl(outputPdf, url)
      cachedImages.set(url, embedded)
      return embedded
    } catch {
      cachedImages.set(url, null)
      return null
    }
  }

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const templatePageIndex = pageIndex === 0 ? 0 : 1
    const [page] = await outputPdf.copyPages(templatePdf, [templatePageIndex])
    outputPdf.addPage(page)
    const athleteOverride = prepared.templateTextOverrides.athlete_info_form

    if (pageIndex === 0 && athleteOverride?.attachmentLabel?.trim()) {
      drawTopRectangle(page, ATHLETE_PAGE_1_ATTACHMENT_LABEL_BOX)
      drawTextInBox(page, athleteOverride.attachmentLabel.trim(), ATHLETE_PAGE_1_ATTACHMENT_LABEL_BOX, chinese, {
        size: 12,
      })
    }

    if (pageIndex === 0 && athleteOverride?.title?.trim()) {
      drawTopRectangle(page, ATHLETE_PAGE_1_TITLE_CLEAR_BOX)
      drawTextInBox(page, athleteOverride.title.trim(), ATHLETE_PAGE_1_TITLE_CLEAR_BOX, chinese, {
        size: 16,
        align: 'center',
        maxLines: 3,
        lineHeight: 18,
      })
    }

    const slots = pageIndex === 0 ? firstPageSlots : followPageSlots
    const pageCards = pageIndex === 0
      ? firstPageCards
      : overflowCards.slice((pageIndex - 1) * followPageSlots.length, pageIndex * followPageSlots.length)

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const person = pageCards[slotIndex]
      const slot = slots[slotIndex]

      drawTextInBox(
        page,
        person?.name || '',
        {
          left: slot.name.left + ATHLETE_NAME_VALUE_LEFT_INSET,
          top: slot.name.top,
          right: slot.name.right - 2,
          bottom: slot.name.bottom,
        },
        chinese,
        { size: 10.5, maxLines: 2 },
      )

      if (person) {
        if (slot.kind === 'player' && isPlayerRole(person.roleId, person.roleName)) {
          drawTextInBox(
            page,
            person.playerNumber || '',
            {
              left: slot.detail.left + ATHLETE_NUMBER_VALUE_LEFT_INSET,
              top: slot.detail.top,
              right: slot.detail.right - 2,
              bottom: slot.detail.bottom,
            },
            chinese,
            { size: 10.5, maxLines: 1 },
          )
        } else if (slot.kind === 'player' && !isPlayerRole(person.roleId, person.roleName)) {
          drawTopRectangle(page, slot.detail)
          drawTextInBox(page, person.roleLabel, slot.detail, chinese, {
            size: 10.5,
            align: 'center',
            maxLines: 1,
          })
        }
      }

      if (!person) continue

      const embeddedImage = await getCachedImage(person.photoUrl)
      if (embeddedImage?.image) {
        drawImageContain(page, embeddedImage.image, slot.photo)
      }
    }
  }

  return Buffer.from(await outputPdf.save())
}

function applyBorder(
  worksheet: ExcelJS.Worksheet,
  fromRow: number,
  toRow: number,
  fromColumn: number,
  toColumn: number,
): void {
  for (let row = fromRow; row <= toRow; row++) {
    for (let column = fromColumn; column <= toColumn; column++) {
      const cell = worksheet.getCell(row, column)
      const border: Partial<ExcelJS.Borders> = {}
      if (row === fromRow) border.top = { style: 'thin' }
      if (row === toRow) border.bottom = { style: 'thin' }
      if (column === fromColumn) border.left = { style: 'thin' }
      if (column === toColumn) border.right = { style: 'thin' }
      cell.border = border
    }
  }
}

function styleMergedCell(
  worksheet: ExcelJS.Worksheet,
  row: number,
  column: number,
  value: string,
  options?: {
    bold?: boolean
    fontSize?: number
    align?: ExcelJS.Alignment['horizontal']
    wrapText?: boolean
  },
): void {
  const cell = worksheet.getCell(row, column)
  cell.value = value
  cell.font = {
    name: 'Microsoft YaHei',
    bold: options?.bold,
    size: options?.fontSize ?? 10.5,
  }
  cell.alignment = {
    vertical: 'middle',
    horizontal: options?.align ?? 'left',
    wrapText: options?.wrapText ?? false,
  }
}

async function generateRegistrationFormExcel(prepared: PreparedTemplateExport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'OpenAI Codex'
  workbook.created = new Date()

  const playerPages = Math.max(1, Math.ceil(prepared.players.length / REGISTRATION_FORM_ROW_COUNT))

  for (let pageIndex = 0; pageIndex < playerPages; pageIndex++) {
    const worksheet = workbook.addWorksheet(
      playerPages === 1 ? '报名表' : `报名表-${pageIndex + 1}`,
      { views: [{ showGridLines: false }] },
    )
    worksheet.pageSetup = {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    }
    worksheet.columns = [
      { width: 9 },
      { width: 15 },
      { width: 9 },
      { width: 13 },
      { width: 28 },
    ]

    worksheet.mergeCells('A1:E1')
    styleMergedCell(worksheet, 1, 1, '附件3', { bold: true, fontSize: 11 })
    worksheet.mergeCells('A2:E3')
    styleMergedCell(worksheet, 2, 1, '', {
      bold: true,
      fontSize: 14,
      align: 'center',
      wrapText: true,
    })
    worksheet.getRow(2).height = 24
    worksheet.getRow(3).height = 24

    worksheet.mergeCells('A5:E5')
    styleMergedCell(worksheet, 5, 1, `参赛单位：${prepared.unitName}`, { wrapText: true })

    worksheet.mergeCells('A6:C6')
    worksheet.mergeCells('D6:E6')
    styleMergedCell(worksheet, 6, 1, `参赛队伍：${prepared.teamName}`, { wrapText: true })
    styleMergedCell(worksheet, 6, 4, `参赛组别：${prepared.groupName}`, { wrapText: true })

    worksheet.mergeCells('B7:C7')
    worksheet.mergeCells('D7:E7')
    styleMergedCell(worksheet, 7, 1, '领队', { align: 'center' })
    styleMergedCell(worksheet, 7, 2, aggregateNames(prepared.leaders), { wrapText: true })
    styleMergedCell(worksheet, 7, 4, `联系方式：${aggregateContacts(prepared.leaders)}`, { wrapText: true })

    worksheet.mergeCells('B8:C8')
    worksheet.mergeCells('D8:E8')
    styleMergedCell(worksheet, 8, 1, '教练', { align: 'center' })
    styleMergedCell(worksheet, 8, 2, aggregateNames(prepared.coaches), { wrapText: true })
    styleMergedCell(worksheet, 8, 4, `联系方式：${aggregateContacts(prepared.coaches)}`, { wrapText: true })

    ;['序号', '姓名', '性别', '证件类型', '身份证号码'].forEach((title, index) => {
      styleMergedCell(worksheet, 9, index + 1, title, { bold: true, align: 'center' })
    })

    const pagePlayers = prepared.players.slice(
      pageIndex * REGISTRATION_FORM_ROW_COUNT,
      (pageIndex + 1) * REGISTRATION_FORM_ROW_COUNT,
    )

    for (let rowIndex = 0; rowIndex < REGISTRATION_FORM_ROW_COUNT; rowIndex++) {
      const sheetRow = 10 + rowIndex
      const player = pagePlayers[rowIndex]
      const serialValue = String(pageIndex * REGISTRATION_FORM_ROW_COUNT + rowIndex + 1)
      const values = [
        serialValue,
        player?.name || '',
        player?.gender || '',
        player?.idType || '',
        player?.idNumber || '',
      ]

      values.forEach((value, columnIndex) => {
        styleMergedCell(worksheet, sheetRow, columnIndex + 1, value, {
          align: 'center',
          wrapText: columnIndex === 4,
        })
      })
    }

    for (let row = 5; row <= 24; row++) {
      worksheet.getRow(row).height = row <= 8 ? 22 : 21
      applyBorder(worksheet, row, row, 1, 5)
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

async function generateAthleteInfoExcel(prepared: PreparedTemplateExport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'OpenAI Codex'
  workbook.created = new Date()
  const cards = prepared.athleteCards
  const firstPageCapacity = 8
  const followCapacity = 12
  const extraCount = Math.max(0, cards.length - firstPageCapacity)
  const totalPages = Math.max(1, 1 + Math.ceil(extraCount / followCapacity))
  const imageCache = new Map<string, { bytes: Uint8Array; extension: 'png' | 'jpeg' } | null>()

  const getExcelImage = async (url: string) => {
    if (!url) return null
    if (imageCache.has(url)) return imageCache.get(url) || null
    try {
      const { bytes, contentType } = await fetchBinary(url)
      const extension = guessImageExtension(url, contentType)
      if (!extension) {
        imageCache.set(url, null)
        return null
      }
      const result = { bytes, extension }
      imageCache.set(url, result)
      return result
    } catch {
      imageCache.set(url, null)
      return null
    }
  }

  const createWorksheet = (name: string) => {
    const worksheet = workbook.addWorksheet(name, { views: [{ showGridLines: false }] })
    worksheet.pageSetup = {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    }
    worksheet.columns = [
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
    ]
    return worksheet
  }

  const renderAthleteSlot = async (
    worksheet: ExcelJS.Worksheet,
    person: ExportPerson | undefined,
    startRow: number,
    columnIndex: number,
    photoRows: number,
  ) => {
    const photoEndRow = startRow + photoRows - 1
    const nameRow = photoEndRow + 1
    const detailRow = photoEndRow + 2
    const columnLetter = String.fromCharCode(64 + columnIndex)

    worksheet.getRow(startRow).height = 18
    for (let row = startRow; row <= detailRow; row++) {
      worksheet.getRow(row).height = row <= photoEndRow ? 18 : 20
    }

    applyBorder(worksheet, startRow, detailRow, columnIndex, columnIndex)
    worksheet.mergeCells(`${columnLetter}${startRow}:${columnLetter}${photoEndRow}`)
    styleMergedCell(worksheet, nameRow, columnIndex, person?.name ? `姓名：${person.name}` : '姓名：', {
      wrapText: true,
      align: 'center',
    })
    styleMergedCell(
      worksheet,
      detailRow,
      columnIndex,
      person
        ? (isPlayerRole(person.roleId, person.roleName) ? `比赛服号码：${person.playerNumber || ''}` : person.roleLabel)
        : '',
      {
        wrapText: true,
        align: 'center',
      },
    )

    const photoCell = worksheet.getCell(startRow, columnIndex)
    photoCell.alignment = { vertical: 'middle', horizontal: 'center' }

    if (!person?.photoUrl) return

    const image = await getExcelImage(person.photoUrl)
    if (!image) return

    const imageId = workbook.addImage({
      base64: Buffer.from(image.bytes).toString('base64'),
      extension: image.extension,
    })

    worksheet.addImage(imageId, `${columnLetter}${startRow}:${columnLetter}${photoEndRow}`)
  }

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const worksheet = createWorksheet(totalPages === 1 ? '运动员信息表' : `运动员信息表-${pageIndex + 1}`)
    worksheet.mergeCells('A1:D1')
    styleMergedCell(worksheet, 1, 1, pageIndex === 0 ? '附件2' : '', { bold: true, fontSize: 11 })
    worksheet.mergeCells('A2:D3')
    styleMergedCell(worksheet, 2, 1, '', {
      bold: true,
      fontSize: 14,
      align: 'center',
      wrapText: true,
    })
    worksheet.getRow(2).height = 24
    worksheet.getRow(3).height = 24

    const isFirstPage = pageIndex === 0
    const startIndex = isFirstPage ? 0 : firstPageCapacity + (pageIndex - 1) * followCapacity
    const pageCards = cards.slice(
      startIndex,
      startIndex + (isFirstPage ? firstPageCapacity : followCapacity),
    )

    const sectionStarts = isFirstPage ? [6, 17] : [6, 17, 28]
    const photoRows = isFirstPage ? 9 : 8
    let cardPointer = 0

    for (const sectionStart of sectionStarts) {
      for (let columnIndex = 1; columnIndex <= 4; columnIndex++) {
        await renderAthleteSlot(worksheet, pageCards[cardPointer], sectionStart, columnIndex, photoRows)
        cardPointer += 1
      }
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export function previewTemplateDocumentExport(
  source: TemplateExportSource,
  documentType: TemplateDocumentType,
): {
  warnings: string[]
  blockingIssues: string[]
  templateName: string | null
} {
  const prepared = buildPreparedTemplateExport(source, {
    requiredDocumentTypes: [documentType],
  })
  return {
    warnings: prepared.warnings,
    blockingIssues: prepared.blockingIssues,
    templateName: prepared.templates[documentType]?.name || null,
  }
}

export async function generateTemplateDocumentExport(
  source: TemplateExportSource,
  documentType: TemplateDocumentType,
  format: TemplateExportFormat,
  options?: TemplateExportOptions,
): Promise<{
  buffer: Buffer
  contentType: string
  fileName: string
  warnings: string[]
}> {
  const prepared = buildPreparedTemplateExport(source, {
    requiredDocumentTypes: options?.requiredDocumentTypes || [documentType],
  })
  if (prepared.blockingIssues.length > 0) {
    throw new Error(prepared.blockingIssues.join('；'))
  }

  let buffer: Buffer
  let contentType: string
  let extension: string

  if (documentType === 'registration_form') {
    if (format === 'pdf') {
      buffer = await generateRegistrationFormPdf(prepared)
      contentType = 'application/pdf'
      extension = 'pdf'
    } else {
      buffer = await generateRegistrationFormExcel(prepared)
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      extension = 'xlsx'
    }
  } else {
    if (format === 'pdf') {
      buffer = await generateAthleteInfoPdf(prepared)
      contentType = 'application/pdf'
      extension = 'pdf'
    } else {
      buffer = await generateAthleteInfoExcel(prepared)
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      extension = 'xlsx'
    }
  }

  const documentLabel = getReferenceTemplateTypeLabel(normalizeReferenceTemplateType(documentType))
  const fileName = `${sanitizeFileNamePart(source.eventName || prepared.teamName, '报名资料')}_${documentLabel}.${extension}`

  return {
    buffer,
    contentType,
    fileName,
    warnings: prepared.warnings,
  }
}
