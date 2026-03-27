'use client'

import { useAuth } from '@/lib/auth-context'
import Sidebar from '@/components/layout/Sidebar'
import { Loader2 } from 'lucide-react'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth()

  // Show a centered spinner while auth + employee data is loading.
  // This prevents a blank flash before the sidebar knows which role to show.
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

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      {/* Main content — md:ml-[220px] matches the fixed sidebar width on desktop */}
      <div className="flex flex-col flex-1 min-w-0 md:ml-[220px]">
        {/* Extra top padding on mobile so content clears the hamburger button */}
        <main className="flex-1 p-4 pt-16 md:p-6 md:pt-6">
          {children}
        </main>
      </div>
    </div>
  )
}
