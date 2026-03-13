import { ThemeSwitcher } from '@/components/theme-switcher'
import { cn } from '@/lib/utils'

type AuthPageShellProps = {
  children: React.ReactNode
  contentClassName?: string
}

export default function AuthPageShell({
  children,
  contentClassName,
}: AuthPageShellProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-100 px-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <div className="absolute right-4 top-4">
        <ThemeSwitcher />
      </div>

      <div className={cn('w-full max-w-sm', contentClassName)}>
        {children}
      </div>
    </div>
  )
}
