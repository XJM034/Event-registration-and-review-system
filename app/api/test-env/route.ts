import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY,
    hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasJwtSecret: !!process.env.JWT_SECRET,
  })
}
