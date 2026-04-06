import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'
import { ProtectedRoute } from './ProtectedRoute'
import LoginPage from '@/pages/login/LoginPage'
import AppShell from '@/components/layout/AppShell'
import HomePage from '@/pages/home/HomePage'
import TasksPage from '@/pages/tasks/TasksPage'
import QCPage from '@/pages/qc/QCPage'
import TransfersPage from '@/pages/transfers/TransfersPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import YardPage from '@/pages/yard/YardPage'
import PDIPage from '@/pages/pdi/PDIPage'
import ConcernsPage from '@/pages/concerns/ConcernsPage'
import ChassisHistoryPage from '@/pages/history/ChassisHistoryPage'
import SalesStockPage from '@/pages/stock/SalesStockPage'

function PublicOnlyRoute() {
  const { authUser, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Loading...</p>
      </div>
    )
  }

  if (authUser) return <Navigate to="/" replace />
  return <LoginPage />
}

function RootRedirect() {
  const {
    authUser,
    loading,
    isDriver,
    isSuperAdmin,
    isManager,
    isYardManager,
    isSales,
  } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Loading...</p>
      </div>
    )
  }

  if (!authUser) return <Navigate to="/login" replace />
  if (isYardManager) return <Navigate to="/yard" replace />
  if (isSales) return <Navigate to="/stock" replace />
  if (isDriver) return <Navigate to="/tasks" replace />
  if (isSuperAdmin || isManager) return <Navigate to="/home" replace />
  // technician
  return <Navigate to="/pdi" replace />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<RootRedirect />} />

        <Route element={<AppShell />}>
          <Route path="/home"      element={<HomePage />} />
          <Route path="/transfers" element={<TransfersPage />} />
          <Route path="/qc"        element={<QCPage />} />
          <Route path="/tasks"     element={<TasksPage />} />
          <Route path="/stock"     element={<SalesStockPage />} />
          <Route path="/settings"  element={<SettingsPage />} />
          <Route path="/yard"     element={<YardPage />} />
          <Route path="/pdi"      element={<PDIPage />} />
          <Route path="/concerns" element={<ConcernsPage />} />
          <Route path="/history/:chassisNo" element={<ChassisHistoryPage />} />
          <Route path="/history"  element={<ChassisHistoryPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}