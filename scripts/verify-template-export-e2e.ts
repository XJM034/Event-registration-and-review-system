import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { loadEnvConfig } from '@next/env'

type PublishedTemplateInfo = {
  name: string
  url: string
}

type EventContext = {
  eventId: string
  eventName: string
  registrationId: string
  registrationTemplate: PublishedTemplateInfo
  athleteTemplate: PublishedTemplateInfo
  updatedAt: string
}

const ROOT = process.cwd()
const ARTIFACT_DIR = path.join(ROOT, '.context', 'template-e2e')
loadEnvConfig(ROOT)
const BASE_URL = process.env.TEMPLATE_E2E_BASE_URL || 'http://localhost:3000'
const EVENT_NAME = process.env.TEMPLATE_E2E_EVENT_NAME || '模板测试'
const ADMIN_PHONE = process.env.TEMPLATE_E2E_ADMIN_PHONE || '18140044662'
const ADMIN_PASSWORD = process.env.TEMPLATE_E2E_ADMIN_PASSWORD || '000000'
const COACH_PHONE = process.env.TEMPLATE_E2E_COACH_PHONE || '13800000001'
const COACH_PASSWORD = process.env.TEMPLATE_E2E_COACH_PASSWORD || '000000'
const HEADED = process.env.TEMPLATE_E2E_HEADED !== 'false'

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }
  return value
}

function runCommand(command: string, args: string[], description: string): string {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  })

  if (result.status !== 0) {
    throw new Error([
      `${description}失败`,
      `命令: ${command} ${args.join(' ')}`,
      result.stdout?.trim(),
      result.stderr?.trim(),
    ].filter(Boolean).join('\n'))
  }

  return result.stdout.trim()
}

function agent(session: string, args: string[], description: string): string {
  const sessionArgs = ['--session', session]
  if (HEADED) {
    sessionArgs.push('--headed')
  }
  return runCommand('agent-browser', [...sessionArgs, ...args], description)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, '')
}

function toLocalTemplateFileName(value: string): string {
  return value.replace(/\//g, '／')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractRefs(snapshot: string, role: 'button' | 'tab' | 'link', label: string): string[] {
  const pattern = new RegExp(`${role} "${escapeRegExp(label)}" \\[ref=(e\\d+)\\]`, 'g')
  return Array.from(snapshot.matchAll(pattern), (match) => match[1])
}

function extractRef(snapshot: string, role: 'button' | 'tab' | 'link', label: string, index = 0): string {
  const refs = extractRefs(snapshot, role, label)
  const ref = refs[index]
  if (!ref) {
    throw new Error(`未能在快照中找到 ${role} "${label}" 的第 ${index + 1} 个 ref`)
  }
  return ref
}

function extractTitleMarkers(text: string, kind: 'registration' | 'athlete') {
  const normalized = normalizeText(text)
  const attachment = normalized.match(/附件\d+/)?.[0] || null
  const year = normalized.match(/20\d{2}年/)?.[0] || null
  const keyword = kind === 'registration'
    ? (normalized.includes('报名表') ? '报名表' : null)
    : (normalized.includes('运动员信息表') ? '运动员信息表' : null)

  return { attachment, year, keyword, normalized }
}

async function ensureAppReachable() {
  const response = await fetch(`${BASE_URL}/auth/login`)
  if (!response.ok) {
    throw new Error(`无法访问 ${BASE_URL}/auth/login，状态码 ${response.status}`)
  }
}

async function loadEventContext(): Promise<EventContext> {
  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  )

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name')
    .eq('name', EVENT_NAME)
    .single()

  if (eventError || !event) {
    throw eventError || new Error(`赛事 ${EVENT_NAME} 不存在`)
  }

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', event.id)
    .limit(1)
    .single()

  if (registrationError || !registration) {
    throw registrationError || new Error(`赛事 ${EVENT_NAME} 没有可用报名记录`)
  }

  const { data: settings, error: settingsError } = await supabase
    .from('registration_settings')
    .select('updated_at, team_requirements')
    .eq('event_id', event.id)
    .limit(1)
    .single()

  if (settingsError || !settings) {
    throw settingsError || new Error(`赛事 ${EVENT_NAME} 没有报名设置`)
  }

  const team = (settings.team_requirements || {}) as {
    registrationFormTemplate?: { name?: string; url?: string } | null
    athleteInfoTemplate?: { name?: string; url?: string } | null
    registrationFormTemplateState?: {
      published?: { template?: { name?: string; url?: string } | null } | null
    } | null
    athleteInfoTemplateState?: {
      published?: { template?: { name?: string; url?: string } | null } | null
    } | null
  }

  const registrationTemplate = team.registrationFormTemplateState?.published?.template || team.registrationFormTemplate
  const athleteTemplate = team.athleteInfoTemplateState?.published?.template || team.athleteInfoTemplate

  if (!registrationTemplate?.name || !registrationTemplate.url) {
    throw new Error('当前赛事未配置已发布的报名表模板')
  }
  if (!athleteTemplate?.name || !athleteTemplate.url) {
    throw new Error('当前赛事未配置已发布的运动员信息表模板')
  }

  return {
    eventId: event.id,
    eventName: event.name,
    registrationId: registration.id,
    registrationTemplate: { name: registrationTemplate.name, url: registrationTemplate.url },
    athleteTemplate: { name: athleteTemplate.name, url: athleteTemplate.url },
    updatedAt: settings.updated_at,
  }
}

async function downloadFile(url: string, outputPath: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`下载文件失败：${url} -> ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(outputPath, buffer)
}

async function renderPdfToPng(pdfPath: string): Promise<string> {
  const outputDir = path.join(ARTIFACT_DIR, 'preview')
  await mkdir(outputDir, { recursive: true })

  const pngPath = path.join(outputDir, `${path.basename(pdfPath)}.png`)
  await rm(pngPath, { force: true })

  runCommand(
    'qlmanage',
    ['-t', '-s', '1400', '-o', outputDir, pdfPath],
    `渲染 PDF 预览 ${path.basename(pdfPath)}`,
  )

  return pngPath
}

function runTesseract(imagePath: string): string {
  return runCommand(
    'tesseract',
    [imagePath, 'stdout', '-l', 'chi_sim+eng'],
    `OCR ${path.basename(imagePath)}`,
  )
}

async function prepareArtifacts() {
  await mkdir(ARTIFACT_DIR, { recursive: true })
  await mkdir(path.join(ARTIFACT_DIR, 'preview'), { recursive: true })
}

async function adminPublishFlow(context: EventContext, registrationFixture: string, athleteFixture: string) {
  const session = `template-admin-${Date.now()}`

  agent(session, ['open', `${BASE_URL}/auth/login`], '打开管理员登录页')
  agent(session, ['fill', 'input[placeholder="请输入手机号"]', ADMIN_PHONE], '填写管理员手机号')
  agent(session, ['fill', 'input[placeholder="请输入密码"]', ADMIN_PASSWORD], '填写管理员密码')
  agent(session, ['click', 'button[type="submit"]'], '提交管理员登录')
  await sleep(2000)

  // 先进入赛事列表，等登录态稳定后再进入报名设置页，避免登录跳转和手动 open 冲突。
  agent(session, ['open', `${BASE_URL}/events`], '打开赛事列表页')
  await sleep(1500)
  agent(session, ['snapshot', '-c', '-d', '6'], '确认管理员已进入赛事列表')

  agent(
    session,
    ['open', `${BASE_URL}/events/${context.eventId}?tab=registration-settings`],
    '打开赛事报名设置页',
  )
  await sleep(1500)

  agent(session, ['eval', '() => { window.alert = () => {}; window.confirm = () => true; }'], '屏蔽管理员页面弹窗')

  const beforeSnapshot = agent(session, ['snapshot', '-c', '-d', '6'], '抓取管理员模板页快照')
  await writeFile(path.join(ARTIFACT_DIR, 'admin-before.txt'), beforeSnapshot, 'utf8')

  agent(session, ['upload', '#document-template-registrationFormTemplate', registrationFixture], '上传报名表模板草稿')
  agent(session, ['upload', '#document-template-athleteInfoTemplate', athleteFixture], '上传运动员信息表模板草稿')
  await sleep(1000)

  const draftSnapshot = agent(session, ['snapshot', '-c', '-d', '6'], '抓取模板上传后快照')
  const publishRegistrationRef = extractRef(draftSnapshot, 'button', '发布草稿', 0)
  const publishAthleteRef = extractRef(draftSnapshot, 'button', '发布草稿', 1)
  agent(session, ['click', publishRegistrationRef], '发布报名表模板草稿')
  agent(session, ['click', publishAthleteRef], '发布运动员信息表模板草稿')
  await sleep(800)

  const publishedSnapshot = agent(session, ['snapshot', '-c', '-d', '6'], '抓取模板发布后快照')
  const saveButtonRef = extractRef(publishedSnapshot, 'button', '保存设置')
  agent(session, ['click', saveButtonRef], '保存报名设置')
  await sleep(2500)

  const afterSnapshot = agent(session, ['snapshot', '-c', '-d', '6'], '抓取管理员模板页快照')
  await writeFile(path.join(ARTIFACT_DIR, 'admin-after.txt'), afterSnapshot, 'utf8')

  agent(session, ['close'], '关闭管理员浏览器会话')
}

async function waitForUpdatedAt(context: EventContext): Promise<string> {
  const deadline = Date.now() + 20_000

  while (Date.now() < deadline) {
    const latest = await loadEventContext()
    if (latest.updatedAt !== context.updatedAt) {
      return latest.updatedAt
    }
    await sleep(1000)
  }

  throw new Error(`20 秒内未观察到报名设置 updated_at 从 ${context.updatedAt} 发生变化`)
}

async function coachExportFlow(context: EventContext) {
  const session = `template-coach-${Date.now()}`

  agent(session, ['open', `${BASE_URL}/auth/login`], '打开教练登录页')
  agent(session, ['fill', 'input[placeholder="请输入手机号"]', COACH_PHONE], '填写教练手机号')
  agent(session, ['fill', 'input[placeholder="请输入密码"]', COACH_PASSWORD], '填写教练密码')
  agent(session, ['click', 'button[type="submit"]'], '提交教练登录')
  await sleep(1500)

  // 先进入 portal 首页，等登录态稳定后再走赛事详情 -> 继续编辑，保持和真实用户一致。
  agent(session, ['open', `${BASE_URL}/portal`], '打开教练工作台')
  await sleep(1500)
  agent(session, ['snapshot', '-c', '-d', '6'], '确认教练已进入工作台')

  agent(
    session,
    ['open', `${BASE_URL}/portal/events/${context.eventId}?scrollTo=my-registration`],
    '打开赛事详情页',
  )
  await sleep(1500)

  agent(session, ['eval', '() => { window.alert = () => {}; window.confirm = () => true; }'], '屏蔽教练页面弹窗')

  const eventSnapshot = agent(session, ['snapshot', '-c', '-d', '6'], '抓取赛事详情快照')
  const editButtonRef = extractRef(eventSnapshot, 'button', '继续编辑')
  agent(session, ['click', editButtonRef], '进入报名编辑页')
  await sleep(1500)

  const coachSnapshot = agent(session, ['snapshot', '-c', '-d', '6'], '抓取教练报名页快照')
  await writeFile(path.join(ARTIFACT_DIR, 'coach-page.txt'), coachSnapshot, 'utf8')

  const cookie = agent(session, ['cookies', 'get', '--url', BASE_URL], '读取教练会话 Cookie').replace(/\n/g, '')

  const downloads = [
    {
      documentType: 'registration_form',
      outputPdf: path.join(ARTIFACT_DIR, 'registration-export.pdf'),
    },
    {
      documentType: 'athlete_info_form',
      outputPdf: path.join(ARTIFACT_DIR, 'athlete-export.pdf'),
    },
  ] as const

  for (const item of downloads) {
    const response = await fetch(
      `${BASE_URL}/api/portal/registrations/${context.registrationId}/template-export?documentType=${item.documentType}&format=pdf`,
      {
        headers: { cookie },
      },
    )

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`导出 ${item.documentType} 失败：${response.status}\n${body}`)
    }

    await writeFile(item.outputPdf, Buffer.from(await response.arrayBuffer()))
  }

  agent(session, ['close'], '关闭教练浏览器会话')
}

async function assertExportMatchesTemplate(
  sourcePdf: string,
  exportPdf: string,
  kind: 'registration' | 'athlete',
) {
  const sourcePng = await renderPdfToPng(sourcePdf)
  const exportPng = await renderPdfToPng(exportPdf)

  const sourceText = runTesseract(sourcePng)
  const exportText = runTesseract(exportPng)

  await writeFile(`${sourcePng}.txt`, sourceText, 'utf8')
  await writeFile(`${exportPng}.txt`, exportText, 'utf8')

  const sourceMarkers = extractTitleMarkers(sourceText, kind)
  const exportMarkers = extractTitleMarkers(exportText, kind)

  if (!sourceMarkers.attachment || !sourceMarkers.year || !sourceMarkers.keyword) {
    throw new Error(`无法从源模板 OCR 中提取关键标题信息：${path.basename(sourcePdf)}`)
  }

  if (exportMarkers.attachment !== sourceMarkers.attachment) {
    throw new Error(`导出文件附件编号不匹配：期望 ${sourceMarkers.attachment}，实际 ${exportMarkers.attachment || '空'}`)
  }

  if (exportMarkers.year !== sourceMarkers.year) {
    throw new Error(`导出文件年份不匹配：期望 ${sourceMarkers.year}，实际 ${exportMarkers.year || '空'}`)
  }

  if (exportMarkers.keyword !== sourceMarkers.keyword) {
    throw new Error(`导出文件类型标题不匹配：期望 ${sourceMarkers.keyword}，实际 ${exportMarkers.keyword || '空'}`)
  }
}

async function main() {
  await prepareArtifacts()
  await ensureAppReachable()

  const context = await loadEventContext()
  const fixtureRegistrationPdf = path.join(
    ARTIFACT_DIR,
    toLocalTemplateFileName(context.registrationTemplate.name),
  )
  const fixtureAthletePdf = path.join(
    ARTIFACT_DIR,
    toLocalTemplateFileName(context.athleteTemplate.name),
  )

  await downloadFile(context.registrationTemplate.url, fixtureRegistrationPdf)
  await downloadFile(context.athleteTemplate.url, fixtureAthletePdf)

  await adminPublishFlow(context, fixtureRegistrationPdf, fixtureAthletePdf)
  const updatedAt = await waitForUpdatedAt(context)
  const refreshedContext = await loadEventContext()

  await coachExportFlow(refreshedContext)

  await assertExportMatchesTemplate(
    fixtureRegistrationPdf,
    path.join(ARTIFACT_DIR, 'registration-export.pdf'),
    'registration',
  )
  await assertExportMatchesTemplate(
    fixtureAthletePdf,
    path.join(ARTIFACT_DIR, 'athlete-export.pdf'),
    'athlete',
  )

  const summary = {
    eventId: refreshedContext.eventId,
    eventName: refreshedContext.eventName,
    registrationId: refreshedContext.registrationId,
    publishedRegistrationTemplate: refreshedContext.registrationTemplate.name,
    publishedAthleteTemplate: refreshedContext.athleteTemplate.name,
    previousUpdatedAt: context.updatedAt,
    currentUpdatedAt: updatedAt,
    artifacts: {
      registrationPdf: path.join(ARTIFACT_DIR, 'registration-export.pdf'),
      athletePdf: path.join(ARTIFACT_DIR, 'athlete-export.pdf'),
      adminBefore: path.join(ARTIFACT_DIR, 'admin-before.txt'),
      adminAfter: path.join(ARTIFACT_DIR, 'admin-after.txt'),
      coachPage: path.join(ARTIFACT_DIR, 'coach-page.txt'),
    },
  }

  await writeFile(
    path.join(ARTIFACT_DIR, 'result.json'),
    JSON.stringify(summary, null, 2),
    'utf8',
  )

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
