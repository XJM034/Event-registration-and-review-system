#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const localEnvPath = path.join(repoRoot, '.env.local')
const machineEnvPath = process.env.LAS_VEGAS_ENV_FILE
  || path.join(os.homedir(), '.config', 'event-registration-and-review-system', 'las-vegas.env')

const requiredKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
]

const preferredKeyOrder = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'NEXT_PUBLIC_API_URL',
]

const syncOnly = process.argv.includes('--sync')

const runtimeEnvKeys = [
  ...new Set([
    ...requiredKeys,
    ...preferredKeyOrder,
    'ADMIN_SESSION_SECRET',
  ]),
]

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const env = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = rawLine.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const key = rawLine.slice(0, separatorIndex).trim()
    const value = rawLine.slice(separatorIndex + 1).trim()
    if (key) {
      env[key] = value
    }
  }

  return env
}

function normalizeEnv(input) {
  const env = { ...input }

  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  }

  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY) {
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY
  }

  return env
}

function readRuntimeEnv() {
  const env = {}

  for (const key of runtimeEnvKeys) {
    const value = process.env[key]
    if (typeof value === 'string') {
      env[key] = value
    }
  }

  return normalizeEnv(env)
}

function isPlaceholderValue(key, value) {
  if (typeof value !== 'string') {
    return true
  }

  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return true
  }

  if (/^(your_|change_me|todo|replace_me|example_)/i.test(normalizedValue)) {
    return true
  }

  if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
    return /your-project-id|example\.com/i.test(normalizedValue)
  }

  return false
}

function getMissingKeys(env) {
  const normalizedEnv = normalizeEnv(env)
  return requiredKeys.filter((key) => isPlaceholderValue(key, normalizedEnv[key]))
}

function serializeEnv(env) {
  const normalizedEnv = normalizeEnv(env)
  const extraKeys = Object.keys(normalizedEnv)
    .filter((key) => !preferredKeyOrder.includes(key))
    .sort()
  const orderedKeys = [...preferredKeyOrder, ...extraKeys]

  const lines = ['# Managed by scripts/ensure-env.mjs']

  for (const key of orderedKeys) {
    const value = normalizedEnv[key]
    if (typeof value === 'string' && value.trim()) {
      lines.push(`${key}=${value}`)
    }
  }

  return `${lines.join('\n')}\n`
}

function writeEnvFile(filePath, env) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, serializeEnv(env), 'utf8')
}

function readNormalizedEnv(filePath) {
  return normalizeEnv(parseEnvFile(filePath))
}

function isSameEnv(left, right) {
  return serializeEnv(left) === serializeEnv(right)
}

function exitWithInstructions() {
  console.error('[env] Missing required environment variables.')
  console.error(`[env] Expected required keys in process.env, ${localEnvPath}, or machine profile at ${machineEnvPath}.`)
  console.error('[env] Required keys: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY), SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET.')
  console.error('[env] After fixing .env.local once, run `pnpm env:sync` to make future clones auto-recover on this machine.')
  process.exit(1)
}

const localEnv = readNormalizedEnv(localEnvPath)
const machineEnv = readNormalizedEnv(machineEnvPath)
const runtimeEnv = readRuntimeEnv()
const localMissingKeys = getMissingKeys(localEnv)
const machineMissingKeys = getMissingKeys(machineEnv)
const runtimeMissingKeys = getMissingKeys(runtimeEnv)

if (syncOnly) {
  let syncSourceEnv = null
  let syncSourceLabel = ''

  if (localMissingKeys.length === 0) {
    syncSourceEnv = localEnv
    syncSourceLabel = localEnvPath
  } else if (runtimeMissingKeys.length === 0) {
    syncSourceEnv = runtimeEnv
    syncSourceLabel = 'process.env'
  }

  if (!syncSourceEnv) {
    exitWithInstructions()
  }

  if (!isSameEnv(localEnv, syncSourceEnv)) {
    writeEnvFile(localEnvPath, syncSourceEnv)
    console.log(`[env] Updated local env from ${syncSourceLabel}`)
  }

  if (!isSameEnv(machineEnv, syncSourceEnv)) {
    writeEnvFile(machineEnvPath, syncSourceEnv)
    console.log(`[env] Synced machine env profile: ${machineEnvPath}`)
  } else {
    console.log('[env] Machine env profile is already up to date.')
  }

  process.exit(0)
}

let sourceEnv = null
let sourceLabel = ''

if (machineMissingKeys.length === 0) {
  sourceEnv = machineEnv
  sourceLabel = machineEnvPath
} else if (localMissingKeys.length === 0) {
  sourceEnv = localEnv
  sourceLabel = localEnvPath
} else if (runtimeMissingKeys.length === 0) {
  console.log('[env] Using runtime environment variables from process.env')
  process.exit(0)
} else {
  exitWithInstructions()
}

if (localMissingKeys.length > 0 || !isSameEnv(localEnv, sourceEnv)) {
  writeEnvFile(localEnvPath, sourceEnv)
  console.log(`[env] Updated local env from ${sourceLabel}`)
}

if (!isSameEnv(machineEnv, sourceEnv)) {
  writeEnvFile(machineEnvPath, sourceEnv)
  console.log(`[env] Synced machine env profile: ${machineEnvPath}`)
}
