import { describe, expect, it } from 'vitest'

import {
  AUDIT_ACTION_OPTIONS,
  buildSecurityAuditLogViewerSearchParams,
  getAuditActionLabel,
  getAuditActorLabel,
  getAuditObjectLabel,
  getAuditSummary,
  parseSecurityAuditLogViewerSearchParams,
  type SecurityAuditLogRecord,
} from '@/lib/security-audit-log-view'

function createLog(overrides: Partial<SecurityAuditLogRecord>): SecurityAuditLogRecord {
  return {
    id: 'log-1',
    created_at: '2026-03-13T10:00:00.000Z',
    actor_type: 'admin',
    actor_id: 'admin-1',
    actor_role: 'super_admin',
    action: 'login',
    resource_type: 'auth_session',
    resource_id: null,
    event_id: null,
    registration_id: null,
    target_user_id: null,
    result: 'success',
    reason: null,
    metadata: null,
    ip_address: '127.0.0.1',
    user_agent: 'test',
    request_id: 'req-1',
    ...overrides,
  }
}

describe('security audit log view helpers', () => {
  it('formats known action labels into Chinese', () => {
    expect(AUDIT_ACTION_OPTIONS.some((option) => option.value === 'account_login')).toBe(true)
    expect(getAuditActionLabel('account_login')).toBe('账号登录')
    expect(getAuditActionLabel('create_coach_account')).toBe('创建教练账号')
    expect(getAuditActionLabel('create_admin_session')).toBe('账号登录')
  })

  it('parses and rebuilds audit-log viewer filters from URL params', () => {
    const state = parseSecurityAuditLogViewerSearchParams(new URLSearchParams([
      ['page', '2'],
      ['pageSize', '50'],
      ['action', 'account_login'],
      ['actorType', 'admin'],
      ['result', 'success'],
      ['from', '2026-03-01'],
      ['to', '2026-03-31'],
    ]))

    expect(state).toEqual({
      filters: {
        scope: 'critical',
        action: 'account_login',
        actorType: 'admin',
        result: 'success',
        from: '2026-03-01',
        to: '2026-03-31',
      },
      page: 2,
      pageSize: 50,
    })

    expect(buildSecurityAuditLogViewerSearchParams(state).toString()).toBe(
      'page=2&pageSize=50&action=account_login&actorType=admin&result=success&from=2026-03-01&to=2026-03-31',
    )
  })

  it('prefers friendly actor labels over raw ids', () => {
    expect(getAuditActorLabel(createLog({
      actor_name: '张三',
      actor_phone: '13800000001',
    }))).toBe('张三（138****0001）')
    expect(getAuditActorLabel(createLog({ actor_role: 'super_admin' }))).toBe('超级管理员')
    expect(getAuditActorLabel(createLog({ actor_role: null, actor_type: 'system' }))).toBe('系统')
  })

  it('masks phone numbers when building object labels', () => {
    const log = createLog({
      action: 'create_coach_account',
      resource_type: 'coach',
      metadata: {
        phone: '13800000001',
      },
    })

    expect(getAuditObjectLabel(log)).toBe('手机号 138****0001')
  })

  it('builds readable summaries for imports and account operations', () => {
    const importLog = createLog({
      action: 'import_coach_accounts',
      result: 'success',
      metadata: {
        created_count: 3,
        failed_count: 1,
        skipped_count: 2,
      },
    })
    const createCoachLog = createLog({
      action: 'create_coach_account',
      target_user_name: '李教练',
      target_user_phone: '13900000002',
    })

    expect(getAuditSummary(importLog)).toBe('批量导入教练账号，新增 3 条，失败 1 条，跳过 2 条')
    expect(getAuditSummary(createCoachLog)).toBe('新增了 李教练（139****0002）')
  })

  it('builds readable summaries for review records', () => {
    const reviewLog = createLog({
      action: 'review_registration',
      actor_name: '审核管理员',
      actor_phone: '13900000001',
      result: 'success',
      registration_name: '晨星队',
      event_name: '春季联赛',
      metadata: {
        review_status: 'approved',
      },
    })

    expect(getAuditObjectLabel(reviewLog)).toBe('晨星队 · 春季联赛')
    expect(getAuditSummary(reviewLog)).toBe('将 晨星队 · 春季联赛 审核为通过')
  })
})
