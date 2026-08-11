import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseProjectRef } from '@/lib/env'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const dynamic = 'force-dynamic'

const KEEPALIVE_TABLES = ['events', 'registration_settings', 'project_types'] as const

type CronAuthResult =
  | { ok: true }
  | { ok: false; response: NextResponse }

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  response.headers.set('Pragma', 'no-cache')
  return response
}

function getCronSecret() {
  const value = process.env.CRON_SECRET?.trim()
  return value || null
}

function authorizeCronRequest(request: NextRequest): CronAuthResult {
  const cronSecret = getCronSecret()

  if (!cronSecret) {
    return {
      ok: false,
      response: jsonNoStore(
        { success: false, error: 'CRON_SECRET is not configured' },
        { status: 500 },
      ),
    }
  }

  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return {
      ok: false,
      response: jsonNoStore(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      ),
    }
  }

  return { ok: true }
}

export async function GET(request: NextRequest) {
  const start = Date.now()
  const auth = authorizeCronRequest(request)

  if (!auth.ok) {
    return auth.response
  }

  try {
    const supabase = createServiceRoleClient()
    const checks = await Promise.all(
      KEEPALIVE_TABLES.map(async (table) => {
        const { data, error } = await supabase
          .from(table)
          .select('id')
          .limit(1)

        return {
          table,
          rowCount: data?.length ?? 0,
          error,
        }
      }),
    )
    const failedCheck = checks.find((check) => check.error)

    if (failedCheck?.error) {
      console.error('Supabase keepalive failed:', {
        table: failedCheck.table,
        error: failedCheck.error,
      })
      return jsonNoStore(
        {
          success: false,
          error: 'Supabase keepalive failed',
          table: failedCheck.table,
          message: failedCheck.error.message,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      )
    }

    const projectRef = getSupabaseProjectRef()
    const durationMs = Date.now() - start
    const successfulChecks = checks.map(({ table, rowCount }) => ({ table, rowCount }))

    console.info('Supabase keepalive succeeded:', {
      projectRef,
      queryCount: successfulChecks.length,
      durationMs,
    })

    return jsonNoStore({
      success: true,
      projectRef,
      queryCount: successfulChecks.length,
      checks: successfulChecks,
      schedule: request.headers.get('x-vercel-cron-schedule'),
      durationMs,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Supabase keepalive unexpected error:', error)
    return jsonNoStore(
      {
        success: false,
        error: 'Supabase keepalive failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
