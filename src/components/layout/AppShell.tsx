import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ArrowLeftRight,
  ClipboardCheck,
  ClipboardList,
  Settings,
  Warehouse,
  AlertCircle,
  History,
  Wrench,
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
  const {
    isManager,
    isDriver,
    isTechnician,
    isSuperAdmin,
    isYardManager,
    isSales,
  } = useAuth()
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
    { to: '/home',      label: 'होम',      icon: LayoutDashboard },
    { to: '/transfers', label: 'ट्रांसफर', icon: ArrowLeftRight },
    { to: '/qc',        label: 'QC जांच',   icon: ClipboardCheck },
    { to: '/concerns',  label: 'चिंता',     icon: AlertCircle },
    { to: '/settings',  label: 'सेटिंग',    icon: Settings },
  ]

  const technicianTabs: NavItem[] = [
    { to: '/pdi',      label: 'PDI',      icon: Wrench },
    { to: '/qc',       label: 'QC जांच', icon: ClipboardCheck },
    { to: '/settings', label: 'सेटिंग',  icon: Settings },
  ]

  const driverTabs: NavItem[] = [
    { to: '/tasks',    label: 'मेरे काम', icon: ClipboardList },
    { to: '/settings', label: 'सेटिंग',   icon: Settings },
  ]

  const yardManagerTabs: NavItem[] = [
    { to: '/yard',     label: 'यार्ड',   icon: Warehouse },
    { to: '/concerns', label: 'चिंता',   icon: AlertCircle },
    { to: '/settings', label: 'सेटिंग',  icon: Settings },
  ]

  const salesTabs: NavItem[] = [
    { to: '/stock',    label: 'गाड़ियाँ', icon: LayoutDashboard },
    { to: '/concerns', label: 'चिंता',    icon: AlertCircle },
    { to: '/settings', label: 'सेटिंग',   icon: Settings },
  ]

  let tabs: NavItem[]
  if (isDriver) {
    tabs = driverTabs
  } else if (isTechnician) {
    tabs = technicianTabs
  } else if (isYardManager) {
    tabs = yardManagerTabs
  } else if (isSales) {
    tabs = salesTabs
  } else {
    tabs = managerTabs
  }

  return (
    <div className="app-shell">
      {/* Global sticky branch filter header */}
      {(isManager || isSuperAdmin || isTechnician) && (
        <div className="branch-header">
          <span className="branch-label">ब्रांच</span>
          <div className="branch-select-wrap">
            <select
              className="branch-select"
              value={selectedBranch ?? ''}
              onChange={e => setSelectedBranch(e.target.value || null)}
            >
              <option value="">सभी ब्रांच</option>
              {branches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <ChevronDown size={12} className="branch-chevron" />
          </div>
        </div>
      )}

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