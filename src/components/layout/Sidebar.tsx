'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ClipboardList, CalendarCheck,
  CheckSquare, Settings, LogOut, MapPin
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles: ('PDIQCMGR' | 'TECHNICIAN' | 'DRIVER')[]
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard',         icon: LayoutDashboard, roles: ['PDIQCMGR'] },
  { href: '/stock',     label: 'Match Stock',        icon: ClipboardList,   roles: ['PDIQCMGR', 'TECHNICIAN'] },
  { href: '/delivery',  label: 'Delivery Schedule',  icon: CalendarCheck,   roles: ['PDIQCMGR', 'DRIVER', 'TECHNICIAN'] },
  { href: '/qc',        label: 'QC Checklist',       icon: CheckSquare,     roles: ['PDIQCMGR', 'TECHNICIAN'] },
  { href: '/settings',  label: 'Settings',           icon: Settings,        roles: ['PDIQCMGR'] },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { authUser, signOut, isManager, isTechnician, isDriver, locationName } = useAuth()

  const roleCode = authUser?.role?.code as 'PDIQCMGR' | 'TECHNICIAN' | 'DRIVER' | undefined
  const visibleNav = roleCode ? NAV.filter(n => n.roles.includes(roleCode)) : []

  const empName = authUser
    ? [authUser.employee.first_name, authUser.employee.last_name].filter(Boolean).join(' ')
    : '...'

  const roleLabel =
    isManager    ? 'QC Manager' :
    isTechnician ? 'Technician' :
    isDriver     ? 'Driver'     : 'Staff'

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex flex-col w-[220px]
                      bg-white border-r border-slate-200">

      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-slate-100">
        <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
          <span className="text-sm">🚗</span>
        </div>
        <span className="font-bold text-slate-800 text-base tracking-tight">GaadiCheck</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map(item => {
          const active = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Icon size={17} className={active ? 'text-brand-600' : 'text-slate-400'} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-slate-100">
        {/* Location badge */}
        {locationName && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 mb-2 rounded-lg bg-slate-50">
            <MapPin size={12} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 truncate">{locationName}</span>
          </div>
        )}

        {/* Employee info */}
        <div className="flex items-center gap-2.5 px-1 mb-1">
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
            {authUser?.employee.photo_url ? (
              <img
                src={authUser.employee.photo_url}
                alt={empName}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <span className="text-brand-700 text-xs font-bold">
                {authUser?.employee.first_name?.[0] ?? '?'}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{empName}</p>
            <p className="text-xs text-slate-400">{roleLabel}</p>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={signOut}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs
                     text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors mt-1"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
