'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ClipboardList, CalendarCheck,
  CheckSquare, Settings, LogOut, MapPin, ShieldCheck, Menu, X
} from 'lucide-react'

interface NavItem { href: string; label: string; icon: React.ElementType }

const ALL_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/stock',     label: 'Match Stock',       icon: ClipboardList   },
  { href: '/delivery',  label: 'Delivery Schedule', icon: CalendarCheck   },
  { href: '/qc',        label: 'QC Checklist',      icon: CheckSquare     },
  { href: '/settings',  label: 'Settings',          icon: Settings        },
]

const MANAGER_ONLY = new Set(['/dashboard', '/settings'])

function NavContent({ onNav }: { onNav?: () => void }) {
  const pathname = usePathname()
  const { authUser, signOut, isManager, isTechnician, isDriver, isSuperAdmin, locationName } = useAuth()

  const visibleNav = ALL_NAV.filter(item => {
    if (isSuperAdmin || isManager) return true
    if (isTechnician) return !MANAGER_ONLY.has(item.href)
    if (isDriver)     return item.href === '/delivery'
    return false
  })

  const empName = authUser
    ? [authUser.employee.first_name, authUser.employee.last_name].filter(Boolean).join(' ')
    : '...'

  const roleLabel =
    isSuperAdmin ? 'Super Admin' :
    isManager    ? 'QC Manager'  :
    isTechnician ? 'Technician'  :
    isDriver     ? 'Driver'      : 'Staff'

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-slate-100 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
          <span className="text-sm">🚗</span>
        </div>
        <span className="font-bold text-slate-800 text-base tracking-tight">GaadiCheck</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map(item => {
          const active = pathname.startsWith(item.href)
          const Icon   = item.icon
          return (
            <Link key={item.href} href={item.href} onClick={onNav}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Icon size={17} className={active ? 'text-brand-600' : 'text-slate-400'} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-slate-100 shrink-0">
        {isSuperAdmin && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 mb-2 rounded-lg bg-amber-50 border border-amber-100">
            <ShieldCheck size={12} className="text-amber-500 shrink-0" />
            <span className="text-xs text-amber-700 font-semibold">Super Admin</span>
          </div>
        )}
        {!isSuperAdmin && locationName && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 mb-2 rounded-lg bg-slate-50">
            <MapPin size={12} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 truncate">{locationName}</span>
          </div>
        )}
        <div className="flex items-center gap-2.5 px-1 mb-1">
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
            {authUser?.employee.photo_url
              ? <img src={authUser.employee.photo_url} alt={empName} className="w-8 h-8 rounded-full object-cover" />
              : <span className="text-brand-700 text-xs font-bold">{authUser?.employee.first_name?.[0] ?? '?'}</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{empName}</p>
            <p className="text-xs text-slate-400">{roleLabel}</p>
          </div>
        </div>
        <button onClick={signOut}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs
                     text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors mt-1">
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on route change
  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 flex-col w-[220px] bg-white border-r border-slate-200">
        <NavContent />
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="md:hidden fixed top-3.5 left-4 z-50 p-2 rounded-lg bg-white border border-slate-200
                   text-slate-600 hover:text-slate-900 shadow-sm"
      >
        <Menu size={18} />
      </button>

      {/* Mobile drawer */}
      {open && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-[260px] bg-white border-r border-slate-200 shadow-2xl">
            {/* Close button inside drawer */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3.5 right-3.5 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X size={16} />
            </button>
            <NavContent onNav={() => setOpen(false)} />
          </aside>
        </>
      )}
    </>
  )
}
