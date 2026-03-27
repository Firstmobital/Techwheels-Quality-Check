import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { ProtectedRoute } from './ProtectedRoute'
import LoginPage from '../pages/login/LoginPage'
import AppLayout from '../components/layout/AppLayout'
import DashboardPage from '../pages/dashboard/DashboardPage'
import StockPage from '../pages/stock/StockPage'

function PublicOnlyRoute() {
  const { authUser, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    )
  }

  if (authUser) return <Navigate to="/" replace />
  return <LoginPage />
}

function RootRedirect() {
  const { authUser, loading, isManager, isTechnician, isDriver, isSuperAdmin } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    )
  }

  if (!authUser) return <Navigate to="/login" replace />
  if (isSuperAdmin || isManager) return <Navigate to="/dashboard" replace />
  if (isTechnician) return <Navigate to="/stock" replace />
  if (isDriver) return <Navigate to="/delivery" replace />
  return <Navigate to="/dashboard" replace />
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-6">
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Page scaffold ready. Business UI will be migrated in next phase.</p>
      </div>
    </div>
  )
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<RootRedirect />} />

        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/stock/:chassis" element={<PlaceholderPage title="Stock Detail" />} />
          <Route path="/delivery" element={<PlaceholderPage title="Delivery Schedule" />} />
          <Route path="/qc" element={<PlaceholderPage title="QC Checklist" />} />
          <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
