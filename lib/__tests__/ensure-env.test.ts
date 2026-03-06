import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = path.resolve(__dirname, '../../scripts/ensure-env.mjs')

const requiredEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project-ref.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  JWT_SECRET: 'jwt-secret-value',
}

const tempDirs: string[] = []

function createTempWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-env-workspace-'))
  const homeDir = path.join(workspace, 'home')
  fs.mkdirSync(homeDir, { recursive: true })
  tempDirs.push(workspace)
  return { workspace, homeDir }
}

function runEnsureEnv(args: string[], cwd: string, homeDir: string, env: Record<string, string>) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    env: {
      ...process.env,
      ...env,
      HOME: homeDir,
    },
    encoding: 'utf8',
  })
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('scripts/ensure-env.mjs', () => {
  it('accepts runtime env vars when env files are absent', () => {
    const { workspace, homeDir } = createTempWorkspace()

    const result = runEnsureEnv([], workspace, homeDir, requiredEnv)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Using runtime environment variables from process.env')
    expect(fs.existsSync(path.join(workspace, '.env.local'))).toBe(false)
    expect(
      fs.existsSync(path.join(homeDir, '.config', 'event-registration-and-review-system', 'las-vegas.env')),
    ).toBe(false)
  })

  it('writes local and machine env files from runtime vars in sync mode', () => {
    const { workspace, homeDir } = createTempWorkspace()

    const result = runEnsureEnv(['--sync'], workspace, homeDir, requiredEnv)

    expect(result.status).toBe(0)

    const localEnvPath = path.join(workspace, '.env.local')
    const machineEnvPath = path.join(
      homeDir,
      '.config',
      'event-registration-and-review-system',
      'las-vegas.env',
    )

    expect(fs.readFileSync(localEnvPath, 'utf8')).toContain('NEXT_PUBLIC_SUPABASE_URL=https://project-ref.supabase.co')
    expect(fs.readFileSync(localEnvPath, 'utf8')).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=anon-key')
    expect(fs.readFileSync(machineEnvPath, 'utf8')).toContain('SUPABASE_SERVICE_ROLE_KEY=service-role-key')
    expect(fs.readFileSync(machineEnvPath, 'utf8')).toContain('JWT_SECRET=jwt-secret-value')
  })
})
