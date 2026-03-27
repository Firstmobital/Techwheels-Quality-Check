import Sidebar from '@/components/layout/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0" style={{ marginLeft: 'var(--sidebar-width, 220px)' }}>
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
