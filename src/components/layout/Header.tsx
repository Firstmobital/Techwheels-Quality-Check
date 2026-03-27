'use client'

import { useAuth } from '@/lib/auth-context'
import { Bell } from 'lucide-react'

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export default function Header({ title, subtitle, actions }: HeaderProps) {
  const { authUser } = useAuth()

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
        <button className="relative p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
          <Bell size={17} />
        </button>
      </div>
    </header>
  )
}
