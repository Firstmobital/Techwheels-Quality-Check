import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ArrowLeftRight,
  ClipboardCheck,
  ClipboardList,
  Settings,
  ChevronDown,
  type LucideProps,
} from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { useBranch } from '@/context/branch-context'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildSalesTeamMap } from '@/lib/utils'
import type { ForwardRefExoticComponent, RefAttributes } from 'react'

type LucideIcon = ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
>

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export default function AppShell() {
  const { isManager, isDriver, isTechnician, isSuperAdmin } = useAuth()
  const { selectedBranch, setSelectedBranch } = useBranch()
  const location = useLocation()
  const [branches, setBranches] = useState<string[]>([])

  // Load distinct delivery branches from sales team map
  useEffect(() => {
    async function loadBranches() {
      try {
        const map = await buildSalesTeamMap()
        const distinct = Array.from(new Set(map.values())).sort()
        setBranches(distinct)
      } catch {
        // silently fail
      }
    }
    void loadBranches()
  }, [])

  const managerTabs: NavItem[] = [
    { to: '/home',      label: 'Dashboard', icon: LayoutDashboard },
    { to: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
    { to: '/qc',        label: 'QC',        icon: ClipboardCheck },
    { to: '/settings',  label: 'Settings',  icon: Settings },
  ]

  const technicianTabs: NavItem[] = [
    { to: '/qc',       label: 'QC',       icon: ClipboardCheck },
    { to: '/settings', label: 'Settings', icon: Settings },
  ]

  const driverTabs: NavItem[] = [
    { to: '/tasks',    label: 'My Tasks', icon: ClipboardList },
    { to: '/settings', label: 'Settings', icon: Settings },
  ]

  let tabs: NavItem[]
  if (isDriver) {
    tabs = driverTabs
  } else if (isTechnician) {
    tabs = technicianTabs
  } else {
    tabs = managerTabs
  }

  return (
    <div className="app-shell">
      {/* Global sticky branch filter header */}
      <div className="branch-header">
        <span className="branch-label">Branch</span>
        <div className="branch-select-wrap">
          <select
            className="branch-select"
            value={selectedBranch ?? ''}
            onChange={e => setSelectedBranch(e.target.value || null)}
          >
            <option value="">All branches</option>
            {branches.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <ChevronDown size={12} className="branch-chevron" />
        </div>
      </div>

      <div className="screen">
        <Outlet />
      </div>

      <nav className="bottom-nav">
        {tabs.map(({ to, label, icon: Icon }) => {
          const isActive =
            location.pathname === to ||
            location.pathname.startsWith(to + '/')
          return (
            <NavLink
              key={to}
              to={to}
              className={`nav-btn${isActive ? ' active' : ''}`}
            >
              <Icon size={22} />
              <span>{label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}