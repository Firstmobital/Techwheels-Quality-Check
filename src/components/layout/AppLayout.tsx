import { Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../context/auth-context'
import Sidebar from './Sidebar'
import Header from './Header'

function getHeaderMeta(pathname: string) {
  if (pathname === '/dashboard') return { title: 'Dashboard', subtitle: 'Overview' }
  if (pathname === '/stock') return { title: 'Match Stock', subtitle: 'Stock list' }
  if (pathname.startsWith('/stock/')) return { title: 'Stock Detail', subtitle: 'Vehicle details' }
  if (pathname === '/delivery') return { title: 'Delivery Schedule', subtitle: 'Planned deliveries' }
  if (pathname === '/qc') return { title: 'QC Checklist', subtitle: 'Quality checks' }
  if (pathname === '/settings') return { title: 'Settings', subtitle: 'Configuration' }
  return { title: 'GaadiCheck', subtitle: undefined }
}

export default function AppLayout() {
  const { loading } = useAuth()
  const { pathname } = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center mb-1">
            <span className="text-xl">🚗</span>
          </div>
          <Loader2 size={20} className="animate-spin text-brand-500" />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    )
  }

  const header = getHeaderMeta(pathname)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 md:ml-[220px]">
        <Header title={header.title} subtitle={header.subtitle} />
        <main className="flex-1 p-4 pt-16 md:p-6 md:pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
