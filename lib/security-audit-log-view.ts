export type SecurityAuditLogRecord = {
  id: string
  created_at: string
  actor_type: string | null
  actor_id: string | null
  actor_role: string | null
  action: string | null
  resource_type: string | null
  resource_id: string | null
  event_id: string | null
  registration_id: string | null
  target_user_id: string | null
  result: string | null
  reason: string | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  request_id: string | null
  actor_name?: string | null
  actor_phone?: string | null
  target_user_name?: string | null
  target_user_phone?: string | null
  event_name?: string | null
  registration_name?: string | null
}

type Option = {
  value: string
  label: string
}

export type SecurityAuditLogQueryFilters = {
  scope: string
  action: string
  actorType: string
  result: string
  from: string
  to: string
}

export type SecurityAuditLogViewerQueryState = {
  filters: SecurityAuditLogQueryFilters
  page: number
  pageSize: number
}

export const DEFAULT_SECURITY_AUDIT_LOG_FILTERS: SecurityAuditLogQueryFilters = {
  scope: 'critical',
  action: 'all',
  actorType: 'all',
  result: 'all',
  from: '',
  to: '',
}

export const DEFAULT_SECURITY_AUDIT_LOG_PAGE = 1
export const DEFAULT_SECURITY_AUDIT_LOG_PAGE_SIZE = 20
export const SECURITY_AUDIT_LOG_PAGE_SIZE_OPTIONS = [20, 50, 100] as const

const ACTION_LABELS: Record<string, string> = {
  account_login: '账号登录',
  login: '账号登录',
  create_admin_session: '账号登录',
  create_admin_account: '创建管理员账号',
  update_admin_account: '修改管理员账号',
  delete_admin_account: '删除管理员账号',
  reset_admin_password: '重置管理员密码',
  change_own_admin_password: '修改自己的管理员密码',
  create_coach_account: '创建教练账号',
  update_coach_account: '修改教练账号',
  delete_coach_account: '删除教练账号',
  reset_coach_password: '重置教练密码',
  change_own_coach_password: '修改自己的教练密码',
  set_coach_active_status: '调整教练账号状态',
  batch_set_coach_active_status: '批量调整教练账号状态',
  import_coach_accounts: '批量导入教练账号',
  export_registrations: '导出报名数据',
  review_registration: '提交审核结果',
  view_registration_detail: '查看报名详情',
  view_public_share: '查看队员补充资料页',
  submit_public_share: '提交队员补充资料',
  upload_public_share_file: '上传队员补充资料附件',
  download_private_file: '下载私有附件',
}

const ACTOR_TYPE_LABELS: Record<string, string> = {
  admin: '管理员',
  coach: '教练',
  public_share: '公开填写用户',
  system: '系统',
}

const ACTOR_ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  coach: '教练',
}

const RESULT_LABELS: Record<string, string> = {
  success: '成功',
  failed: '失败',
  denied: '已拦截',
}

const REASON_LABELS: Record<string, string> = {
  invalid_credentials: '账号或密码错误',
  rate_limited: '系统限流拦截',
  forbidden: '没有权限执行',
  unauthorized: '未登录或会话失效',
  password_policy_violation: '密码不符合规则',
  phone_already_exists: '手机号已存在',
  missing_required_fields: '缺少必填信息',
  invalid_phone_format: '手机号格式错误',
  server_error: '服务器处理失败',
}

const CRITICAL_AUDIT_ACTIONS = [
  'review_registration',
  'view_registration_detail',
  'create_admin_account',
  'update_admin_account',
  'delete_admin_account',
  'reset_admin_password',
  'change_own_admin_password',
  'create_coach_account',
  'update_coach_account',
  'delete_coach_account',
  'reset_coach_password',
  'change_own_coach_password',
  'set_coach_active_status',
  'batch_set_coach_active_status',
  'import_coach_accounts',
  'export_registrations',
  'download_private_file',
  'view_public_share',
  'submit_public_share',
  'upload_public_share_file',
] as const

const AUDIT_SCOPE_ACTIONS = {
  critical: [...CRITICAL_AUDIT_ACTIONS],
  review_flow: [
    'review_registration',
    'view_registration_detail',
    'view_public_share',
    'submit_public_share',
    'upload_public_share_file',
  ],
  account_changes: [
    'create_admin_account',
    'update_admin_account',
    'delete_admin_account',
    'reset_admin_password',
    'change_own_admin_password',
    'create_coach_account',
    'update_coach_account',
    'delete_coach_account',
    'reset_coach_password',
    'change_own_coach_password',
    'set_coach_active_status',
    'batch_set_coach_active_status',
    'import_coach_accounts',
  ],
  export_and_files: [
    'export_registrations',
    'download_private_file',
  ],
} as const

export const AUDIT_ACTION_OPTIONS: Option[] = [
  { value: 'all', label: '全部关键动作' },
  { value: 'account_login', label: '账号登录' },
  { value: 'review_registration', label: '提交审核结果' },
  { value: 'view_registration_detail', label: '查看报名详情' },
  { value: 'export_registrations', label: '导出报名数据' },
  { value: 'create_admin_account', label: '创建管理员账号' },
  { value: 'update_admin_account', label: '修改管理员账号' },
  { value: 'delete_admin_account', label: '删除管理员账号' },
  { value: 'reset_admin_password', label: '重置管理员密码' },
  { value: 'change_own_admin_password', label: '修改自己的管理员密码' },
  { value: 'create_coach_account', label: '创建教练账号' },
  { value: 'update_coach_account', label: '修改教练账号' },
  { value: 'delete_coach_account', label: '删除教练账号' },
  { value: 'reset_coach_password', label: '重置教练密码' },
  { value: 'change_own_coach_password', label: '修改自己的教练密码' },
  { value: 'set_coach_active_status', label: '调整教练账号状态' },
  { value: 'batch_set_coach_active_status', label: '批量调整教练账号状态' },
  { value: 'import_coach_accounts', label: '批量导入教练账号' },
  { value: 'view_public_share', label: '查看队员补充资料页' },
  { value: 'submit_public_share', label: '提交队员补充资料' },
  { value: 'upload_public_share_file', label: '上传队员补充资料附件' },
  { value: 'download_private_file', label: '下载私有附件' },
]

export const AUDIT_SCOPE_OPTIONS: Option[] = [
  { value: 'critical', label: '全部关键操作' },
  { value: 'review_flow', label: '审批与报名' },
  { value: 'account_changes', label: '账号与权限' },
  { value: 'export_and_files', label: '导出与资料' },
]

export const AUDIT_ACTOR_TYPE_OPTIONS: Option[] = [
  { value: 'all', label: '全部人员' },
  { value: 'admin', label: '管理员' },
  { value: 'coach', label: '教练' },
  { value: 'public_share', label: '公开填写用户' },
  { value: 'system', label: '系统' },
]

export const AUDIT_RESULT_OPTIONS: Option[] = [
  { value: 'all', label: '全部结果' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'denied', label: '已拦截' },
]

type SearchParamReader = Pick<URLSearchParams, 'get'>

function normalizeSelectValue(value: string | null | undefined, options: Option[], fallback: string) {
  if (!value) {
    return fallback
  }

  return options.some((option) => option.value === value) ? value : fallback
}

function normalizeDateValue(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return ''
  }

  return value
}

function parsePositiveInt(value: string | null | undefined, fallback: number) {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function normalizePageSize(value: string | null | undefined) {
  const parsed = parsePositiveInt(value, DEFAULT_SECURITY_AUDIT_LOG_PAGE_SIZE)
  return SECURITY_AUDIT_LOG_PAGE_SIZE_OPTIONS.includes(
    parsed as (typeof SECURITY_AUDIT_LOG_PAGE_SIZE_OPTIONS)[number],
  )
    ? parsed
    : DEFAULT_SECURITY_AUDIT_LOG_PAGE_SIZE
}

export function areSecurityAuditLogFiltersEqual(
  left: SecurityAuditLogQueryFilters,
  right: SecurityAuditLogQueryFilters,
) {
  return (
    left.scope === right.scope
    && left.action === right.action
    && left.actorType === right.actorType
    && left.result === right.result
    && left.from === right.from
    && left.to === right.to
  )
}

export function parseSecurityAuditLogViewerSearchParams(
  searchParams: SearchParamReader,
): SecurityAuditLogViewerQueryState {
  return {
    filters: {
      scope: normalizeSelectValue(
        searchParams.get('scope'),
        AUDIT_SCOPE_OPTIONS,
        DEFAULT_SECURITY_AUDIT_LOG_FILTERS.scope,
      ),
      action: normalizeSelectValue(
        searchParams.get('action'),
        AUDIT_ACTION_OPTIONS,
        DEFAULT_SECURITY_AUDIT_LOG_FILTERS.action,
      ),
      actorType: normalizeSelectValue(
        searchParams.get('actorType'),
        AUDIT_ACTOR_TYPE_OPTIONS,
        DEFAULT_SECURITY_AUDIT_LOG_FILTERS.actorType,
      ),
      result: normalizeSelectValue(
        searchParams.get('result'),
        AUDIT_RESULT_OPTIONS,
        DEFAULT_SECURITY_AUDIT_LOG_FILTERS.result,
      ),
      from: normalizeDateValue(searchParams.get('from')),
      to: normalizeDateValue(searchParams.get('to')),
    },
    page: parsePositiveInt(searchParams.get('page'), DEFAULT_SECURITY_AUDIT_LOG_PAGE),
    pageSize: normalizePageSize(searchParams.get('pageSize')),
  }
}

export function buildSecurityAuditLogViewerSearchParams(
  state: SecurityAuditLogViewerQueryState,
) {
  const searchParams = new URLSearchParams()

  if (state.page !== DEFAULT_SECURITY_AUDIT_LOG_PAGE) {
    searchParams.set('page', String(state.page))
  }
  if (state.pageSize !== DEFAULT_SECURITY_AUDIT_LOG_PAGE_SIZE) {
    searchParams.set('pageSize', String(state.pageSize))
  }
  if (state.filters.scope !== DEFAULT_SECURITY_AUDIT_LOG_FILTERS.scope) {
    searchParams.set('scope', state.filters.scope)
  }
  if (state.filters.action !== DEFAULT_SECURITY_AUDIT_LOG_FILTERS.action) {
    searchParams.set('action', state.filters.action)
  }
  if (state.filters.actorType !== DEFAULT_SECURITY_AUDIT_LOG_FILTERS.actorType) {
    searchParams.set('actorType', state.filters.actorType)
  }
  if (state.filters.result !== DEFAULT_SECURITY_AUDIT_LOG_FILTERS.result) {
    searchParams.set('result', state.filters.result)
  }
  if (state.filters.from) {
    searchParams.set('from', state.filters.from)
  }
  if (state.filters.to) {
    searchParams.set('to', state.filters.to)
  }

  return searchParams
}

export function getAuditScopeActions(scope: string | null | undefined) {
  if (!scope || scope === 'all') {
    return null
  }

  return AUDIT_SCOPE_ACTIONS[scope as keyof typeof AUDIT_SCOPE_ACTIONS] || null
}

function readMetadataValue(
  metadata: SecurityAuditLogRecord['metadata'],
  key: string,
) {
  const value = metadata?.[key]
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : null
}

function getBooleanMetadataValue(
  metadata: SecurityAuditLogRecord['metadata'],
  key: string,
) {
  const value = metadata?.[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return null
}

function maskPhoneLike(value: string | null) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return value
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`
}

function getPhoneReference(log: SecurityAuditLogRecord) {
  return (
    maskPhoneLike(log.actor_phone || null)
    || maskPhoneLike(log.target_user_phone || null)
    || readMetadataValue(log.metadata, 'phone_masked')
    || maskPhoneLike(readMetadataValue(log.metadata, 'phone'))
    || null
  )
}

function getResourceLabel(log: SecurityAuditLogRecord) {
  switch (log.resource_type) {
    case 'admin_user':
      return '管理员账号'
    case 'admin_session':
      return '管理员会话'
    case 'auth_session':
      return '登录会话'
    case 'coach':
    case 'coach_account':
      return '教练账号'
    case 'coach_import':
      return '教练导入文件'
    case 'registration':
      return '报名记录'
    case 'event':
      return '赛事'
    case 'share_token':
      return '队员补充资料链接'
    case 'storage_object':
      return '私有附件'
    default:
      return log.resource_type || '系统对象'
  }
}

function getReasonLabel(reason: string | null) {
  if (!reason) return null
  return REASON_LABELS[reason] || reason
}

export function getAuditActionLabel(action: string | null) {
  if (!action) return '未命名操作'
  return ACTION_LABELS[action] || action
}

export function getAuditActorLabel(log: SecurityAuditLogRecord) {
  const actorName = typeof log.actor_name === 'string' && log.actor_name.trim()
    ? log.actor_name.trim()
    : null
  const actorPhone = maskPhoneLike(log.actor_phone || null)

  if (actorName && actorPhone) {
    return `${actorName}（${actorPhone}）`
  }

  if (actorName) {
    return actorName
  }

  if (actorPhone) {
    return actorPhone
  }

  if (log.actor_role && ACTOR_ROLE_LABELS[log.actor_role]) {
    return ACTOR_ROLE_LABELS[log.actor_role]
  }
  if (log.actor_type && ACTOR_TYPE_LABELS[log.actor_type]) {
    return ACTOR_TYPE_LABELS[log.actor_type]
  }
  return '未知来源'
}

export function getAuditResultLabel(result: string | null) {
  if (!result) return '未知'
  return RESULT_LABELS[result] || result
}

export function getAuditObjectLabel(log: SecurityAuditLogRecord) {
  if (log.registration_name && log.event_name) {
    return `${log.registration_name} · ${log.event_name}`
  }

  if (log.registration_name) {
    return log.registration_name
  }

  if (log.target_user_name && log.target_user_phone) {
    return `${log.target_user_name}（${maskPhoneLike(log.target_user_phone)}）`
  }

  if (log.target_user_name) {
    return log.target_user_name
  }

  const phone = getPhoneReference(log)
  if (phone) {
    return `手机号 ${phone}`
  }

  const school = readMetadataValue(log.metadata, 'school')
  if (school) {
    return `${getResourceLabel(log)} · ${school}`
  }

  return getResourceLabel(log)
}

export function getAuditSummary(log: SecurityAuditLogRecord) {
  const reasonLabel = getReasonLabel(log.reason)
  const objectLabel = getAuditObjectLabel(log)

  switch (log.action) {
    case 'login':
    case 'create_admin_session':
      return reasonLabel ? `尝试登录，结果：${reasonLabel}` : '账号登录'
    case 'create_admin_account':
      return `新增了 ${objectLabel}`
    case 'update_admin_account':
      return `修改了 ${objectLabel} 的账号资料`
    case 'delete_admin_account':
      return `删除了 ${objectLabel}`
    case 'reset_admin_password':
      return `重置了 ${objectLabel} 的登录密码`
    case 'change_own_admin_password':
      return '修改了自己的管理员密码'
    case 'create_coach_account':
      return `新增了 ${objectLabel}`
    case 'update_coach_account':
      return `修改了 ${objectLabel} 的账号资料`
    case 'delete_coach_account':
      return `删除了 ${objectLabel}`
    case 'reset_coach_password':
      return `重置了 ${objectLabel} 的登录密码`
    case 'change_own_coach_password':
      return '修改了自己的教练密码'
    case 'set_coach_active_status': {
      const nextActive = getBooleanMetadataValue(log.metadata, 'is_active')
      if (nextActive === true) {
        return `将 ${objectLabel} 设为启用`
      }
      if (nextActive === false) {
        return `将 ${objectLabel} 设为停用`
      }
      return `调整了 ${objectLabel} 的账号状态`
    }
    case 'batch_set_coach_active_status': {
      const nextActive = getBooleanMetadataValue(log.metadata, 'is_active')
      const updatedCount = readMetadataValue(log.metadata, 'updated_count') || '0'
      const statusLabel = nextActive === true ? '启用' : nextActive === false ? '停用' : '调整状态'
      return `批量将 ${updatedCount} 个教练账号设为${statusLabel}`
    }
    case 'export_registrations':
      return log.event_name ? `导出了 ${log.event_name} 的报名数据` : '导出了报名数据'
    case 'import_coach_accounts': {
      const createdCount = readMetadataValue(log.metadata, 'created_count') || '0'
      const failedCount = readMetadataValue(log.metadata, 'failed_count') || '0'
      const skippedCount = readMetadataValue(log.metadata, 'skipped_count') || '0'
      return `批量导入教练账号，新增 ${createdCount} 条，失败 ${failedCount} 条，跳过 ${skippedCount} 条`
    }
    case 'review_registration': {
      const reviewStatus = readMetadataValue(log.metadata, 'review_status')
      const reviewLabel = reviewStatus === 'approved'
        ? '通过'
        : reviewStatus === 'rejected'
          ? '驳回'
          : null
      return reviewLabel
        ? `将 ${objectLabel} 审核为${reviewLabel}`
        : `提交了 ${objectLabel} 的审核结果`
    }
    case 'view_registration_detail':
      return `查看了 ${objectLabel} 的报名详情`
    case 'view_public_share':
      return '打开了队员补充资料页'
    case 'submit_public_share':
      return '提交了队员补充资料'
    case 'upload_public_share_file':
      return '上传了队员补充资料附件'
    case 'download_private_file':
      return `下载了 ${objectLabel}`
    default:
      return `${getAuditActionLabel(log.action)}${reasonLabel ? `（${reasonLabel}）` : ''}`
  }
}

export function formatAuditTechnicalMetadata(log: SecurityAuditLogRecord) {
  return JSON.stringify(
    {
      action: log.action,
      reason: log.reason,
      actor_id: log.actor_id,
      resource_id: log.resource_id,
      event_id: log.event_id,
      registration_id: log.registration_id,
      target_user_id: log.target_user_id,
      request_id: log.request_id,
      ip_address: log.ip_address,
      metadata: log.metadata || {},
    },
    null,
    2,
  )
}
