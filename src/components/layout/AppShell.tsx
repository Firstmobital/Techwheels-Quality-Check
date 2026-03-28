import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ArrowLeftRight,
  ClipboardCheck,
  ClipboardList,
  Settings,
  type LucideProps,
} from 'lucide-react'
import { useAuth } from '@/context/auth-context'
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
  const location = useLocation()

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
    // manager + super admin
    tabs = managerTabs
  }

  return (
    <div className="app-shell">
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