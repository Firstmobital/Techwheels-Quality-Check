import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Home, ClipboardList, CheckSquare, Car, Settings, type LucideProps } from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import type { ForwardRefExoticComponent, RefAttributes } from 'react'

type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export default function AppShell() {
  const { isManager, isDriver, isTechnician, isSuperAdmin } = useAuth()
  const location = useLocation()

  const allTabs: NavItem[] = [
    { to: '/home',     label: 'Home',     icon: Home },
    { to: '/tasks',    label: 'My Tasks', icon: ClipboardList },
    { to: '/qc',       label: 'QC',       icon: CheckSquare },
    { to: '/stock',    label: 'Stock',    icon: Car },
    { to: '/settings', label: 'Settings', icon: Settings },
  ]

  // Role-based tab visibility
  let tabs: NavItem[]
  if (isDriver) {
    // Drivers see only My Tasks
    tabs = allTabs.filter(t => t.to === '/tasks')
  } else if (isTechnician) {
    // Technicians see QC, Stock, My Tasks
    tabs = allTabs.filter(t => ['/tasks', '/qc', '/stock'].includes(t.to))
  } else if (isManager || isSuperAdmin) {
    // Managers don't see My Tasks
    tabs = allTabs.filter(t => t.to !== '/tasks')
  } else {
    tabs = allTabs.filter(t => t.to !== '/tasks')
  }

  return (
    <div className="app-shell">
      <div className="screen">
        <Outlet />
      </div>

      {tabs.length > 1 && (
        <nav className="bottom-nav">
          {tabs.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to || location.pathname.startsWith(to + '/')
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
      )}
    </div>
  )
}
