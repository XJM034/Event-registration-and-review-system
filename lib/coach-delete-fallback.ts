import { createServiceRoleClient } from '@/lib/supabase/service-role'

type CoachDeleteClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { id: string } | null
          error: { message?: string } | null
        }>
      }
    }
    delete: () => {
      eq: (column: string, value: string) => Promise<{
        error: { message?: string } | null
      }>
    }
  }
}

export async function ensureCoachRowDeleted(
  coachId: string,
  options?: {
    client?: CoachDeleteClient
    maxAttempts?: number
    retryDelayMs?: number
  }
): Promise<boolean> {
  const client = options?.client ?? createServiceRoleClient()
  const maxAttempts = options?.maxAttempts ?? 4
  const retryDelayMs = options?.retryDelayMs ?? 120

  // 删除 auth.users 后，coaches 级联删除可能存在短暂延迟；这里主动兜底清理并确认已删除。
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: coachRow, error: fetchError } = await client
      .from('coaches')
      .select('id')
      .eq('id', coachId)
      .maybeSingle()

    if (fetchError) {
      console.error('检查教练记录是否已删除失败:', fetchError)
      break
    }

    if (!coachRow) {
      return true
    }

    const { error: deleteError } = await client
      .from('coaches')
      .delete()
      .eq('id', coachId)

    if (deleteError) {
      console.error('兜底删除教练记录失败:', deleteError)
      break
    }

    if (retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }

  const { data: remainingRow, error: verifyError } = await client
    .from('coaches')
    .select('id')
    .eq('id', coachId)
    .maybeSingle()

  if (verifyError) {
    console.error('最终校验教练记录是否删除失败:', verifyError)
    return false
  }

  return !remainingRow
}
