'use client'

import { ThemeProvider } from 'next-themes'
import { usePathname } from 'next/navigation'

type AppThemeProviderProps = {
  children: React.ReactNode
}

function getThemeStorageKey(pathname: string) {
  if (pathname.startsWith('/portal')) {
    return 'theme-portal'
  }

  if (pathname.startsWith('/events') || pathname.startsWith('/admin')) {
    return 'theme-admin'
  }

  return 'theme'
}

export default function AppThemeProvider({ children }: AppThemeProviderProps) {
  const pathname = usePathname()
  const storageKey = getThemeStorageKey(pathname)

  return (
    <ThemeProvider
      key={storageKey}
      storageKey={storageKey}
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  )
}
