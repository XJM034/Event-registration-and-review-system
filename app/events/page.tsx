'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function EventsPage() {
  const router = useRouter()

  useEffect(() => {
    // 重定向到主页（管理端的赛事列表页面）
    router.replace('/')
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-500">正在跳转...</div>
    </div>
  )
}