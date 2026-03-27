import type { ReactNode } from 'react'
import { Bell, LogOut } from 'lucide-react'
import { useAuth } from '../../context/auth-context'

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export default function Header({ title, subtitle, actions }: HeaderProps) {
  const { signOut } = useAuth()

  return (
    <header className="sticky top-0 z-30 flex items-center gap-4 h-14
                       bg-white/90 backdrop-blur border-b border-slate-200 px-6">
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-bold text-slate-800 truncate">{title}</h1>
        {subtitle && (
          <p className="text-xs text-slate-400 truncate">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {actions}
        <button
          onClick={() => { void signOut() }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                     text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut size={13} />
          Logout
        </button>
        <button className="relative p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
          <Bell size={17} />
        </button>
      </div>
    </header>
  )
}
