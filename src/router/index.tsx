import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'
import { ProtectedRoute } from './ProtectedRoute'
import LoginPage from '@/pages/login/LoginPage'
import AppShell from '@/components/layout/AppShell'
import HomePage from '@/pages/home/HomePage'
import TasksPage from '@/pages/tasks/TasksPage'
import QCPage from '@/pages/qc/QCPage'
import StockPage from '@/pages/stock/StockPage'
import SettingsPage from '@/pages/settings/SettingsPage'

function PublicOnlyRoute() {
  const { authUser, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Loading...</p>
      </div>
    )
  }

  if (authUser) return <Navigate to="/" replace />
  return <LoginPage />
}

function RootRedirect() {
  const { authUser, loading, isManager, isSuperAdmin, isDriver } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Loading...</p>
      </div>
    )
  }

  if (!authUser) return <Navigate to="/login" replace />
  if (isDriver) return <Navigate to="/tasks" replace />
  if (isSuperAdmin || isManager) return <Navigate to="/home" replace />
  // Technician
  return <Navigate to="/qc" replace />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<RootRedirect />} />

        <Route element={<AppShell />}>
          <Route path="/home"     element={<HomePage />} />
          <Route path="/tasks"    element={<TasksPage />} />
          <Route path="/qc"       element={<QCPage />} />
          <Route path="/stock"    element={<StockPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
