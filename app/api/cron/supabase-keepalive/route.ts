import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const dynamic = 'force-dynamic'

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
    const { data, error } = await supabase
      .from('events')
      .select('id')
      .limit(1)

    if (error) {
      console.error('Supabase keepalive failed:', error)
      return jsonNoStore(
        {
          success: false,
          error: 'Supabase keepalive failed',
          message: error.message,
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      )
    }

    return jsonNoStore({
      success: true,
      checked: 'events',
      rowCount: data?.length ?? 0,
      schedule: request.headers.get('x-vercel-cron-schedule'),
      durationMs: Date.now() - start,
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
