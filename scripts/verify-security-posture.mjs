import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return

  const content = readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    if (!key || process.env[key] !== undefined) continue

    let value = trimmed.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value.replace(/\\n/g, '\n')
  }
}

function loadLocalEnv(root) {
  const env = process.env.NODE_ENV || 'development'
  const files = [
    `.env.${env}.local`,
    env === 'test' ? null : '.env.local',
    `.env.${env}`,
    '.env',
  ].filter(Boolean)

  files.forEach((file) => {
    loadEnvFile(path.join(root, file))
  })
}

loadLocalEnv(ROOT)

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

function report(level, label, detail) {
  const prefix = level.padEnd(5, ' ')
  console.log(`${prefix} ${label}: ${detail}`)
}

async function checkAuthSettings(url, anonKey) {
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`/auth/v1/settings returned ${response.status}`)
  }

  const settings = await response.json()
  const failures = []
  const warnings = []

  if (settings?.external?.email === true) {
    report('PASS', 'email_auth', 'email provider is enabled')
  } else {
    failures.push('email provider is disabled')
    report('FAIL', 'email_auth', 'email provider is disabled')
  }

  if (settings?.disable_signup === true) {
    report('PASS', 'disable_signup', 'public self-signup is disabled')
  } else {
    failures.push('public self-signup is still enabled')
    report('FAIL', 'disable_signup', 'public self-signup is still enabled')
  }

  if (settings?.mfa_enabled === true) {
    report('PASS', 'mfa_enabled', 'auth settings report MFA enabled')
  } else {
    warnings.push('auth settings report mfa_enabled=false; current release does not roll out MFA, confirm this remains an accepted risk')
    report('WARN', 'mfa_enabled', 'auth settings report mfa_enabled=false; current release keeps MFA out of scope')
  }

  return { failures, warnings }
}

async function checkAuditTable(url, serviceRoleKey) {
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { error } = await supabase
    .from('security_audit_logs')
    .select('id')
    .limit(1)

  if (error) {
    report('FAIL', 'security_audit_logs', error.message)
    return { failures: ['security_audit_logs table is unavailable'], warnings: [] }
  }

  report('PASS', 'security_audit_logs', 'table is readable with service role')
  return { failures: [], warnings: [] }
}

async function checkAnonymousTableIsolation(url, anonKey, serviceRoleKey) {
  const anonClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  const serviceClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const targets = [
    'admin_users',
    'registrations',
    'registration_settings',
    'player_share_tokens',
  ]

  const failures = []
  const warnings = []

  for (const table of targets) {
    const { data: sampleRows, error: sampleError } = await serviceClient
      .from(table)
      .select('id')
      .limit(1)

    if (sampleError) {
      failures.push(`service role failed to read sample id from ${table}`)
      report('FAIL', `${table}_sample`, sampleError.message)
      continue
    }

    const sampleId = sampleRows?.[0]?.id
    if (!sampleId) {
      warnings.push(`no sample row available for ${table}`)
      report('WARN', `${table}_sample`, 'no sample row available, skipped anonymous verification')
      continue
    }

    const { data, error } = await anonClient
      .from(table)
      .select('id')
      .eq('id', sampleId)
      .maybeSingle()

    if (error) {
      report('PASS', `${table}_anon_read`, 'anonymous read is rejected')
      continue
    }

    if (data?.id) {
      failures.push(`anonymous client can still read ${table}`)
      report('FAIL', `${table}_anon_read`, 'anonymous client can read a sampled sensitive row')
      continue
    }

    report('PASS', `${table}_anon_read`, 'sampled row is not visible to anonymous client')
  }

  return { failures, warnings }
}

async function main() {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  report('INFO', 'project', url)
  report('WARN', 'password_policy', 'minimum length / complexity still require manual control-panel verification')

  const authSettings = await checkAuthSettings(url, anonKey)
  const auditTable = await checkAuditTable(url, serviceRoleKey)
  const anonymousIsolation = await checkAnonymousTableIsolation(url, anonKey, serviceRoleKey)

  const failures = [
    ...authSettings.failures,
    ...auditTable.failures,
    ...anonymousIsolation.failures,
  ]
  const warnings = [
    ...authSettings.warnings,
    ...auditTable.warnings,
    ...anonymousIsolation.warnings,
  ]

  console.log('')
  report('INFO', 'summary', `${failures.length} failure(s), ${warnings.length} warning(s)`)

  if (failures.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
