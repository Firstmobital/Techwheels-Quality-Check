import { useEffect, useState } from 'react'
import { Settings, Plus, X, Loader2, Users, MapPin, Warehouse, RefreshCw } from 'lucide-react'
import { createClient } from '../../lib/supabase/client'
import { useAuth } from '../../context/auth-context'
import { useToast } from '../../components/ui/Toast'

interface EmployeeRow {
  id: number
  first_name: string
  last_name: string | null
  email: string
  mobile: string | null
  employee_code: string | null
  employee_status: string | null
  role: { name: string; code: string } | null
  location: { name: string } | null
}

export default function SettingsPage() {
  const { isSuperAdmin } = useAuth()
  const { success, error: toastError } = useToast()

  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [yards, setYards] = useState<string[]>([])
  const [newYard, setNewYard] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingYards, setSavingYards] = useState(false)
  const [activeTab, setActiveTab] = useState<'yards' | 'employees'>('yards')
  const [showAll, setShowAll] = useState(false)

  const supabase = createClient()

  async function load() {
    setLoading(true)

    const [{ data: emps }, { data: yardSetting }] = await Promise.all([
      supabase
        .from('employees')
        .select('id, first_name, last_name, email, mobile, employee_code, employee_status, role:roles(name,code), location:locations(name)')
        .order('first_name'),
      supabase.from('app_settings').select('value').eq('key', 'yards').single(),
    ])

    setEmployees((emps as unknown as EmployeeRow[]) ?? [])
    setYards(Array.isArray(yardSetting?.value) ? yardSetting.value : ['Yard 1', 'Yard 2', 'Yard 3'])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  function addYard() {
    const trimmed = newYard.trim()
    if (!trimmed || yards.includes(trimmed)) return
    setYards((y: string[]) => [...y, trimmed])
    setNewYard('')
  }

  function removeYard(yard: string) {
    setYards((y: string[]) => y.filter((v: string) => v !== yard))
  }

  async function saveYards() {
    setSavingYards(true)
    const { error } = await supabase.from('app_settings').upsert(
      { key: 'yards', value: yards, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
    setSavingYards(false)
    if (error) {
      toastError('Save nahi hua: ' + error.message)
      return
    }
    success('Yards save ho gaye!')
  }

  const displayedEmployees = employees.filter((e: EmployeeRow) =>
    showAll || !e.employee_status || e.employee_status === 'active' || e.employee_status === 'confirmed'
  )

  const tabs = [
    { id: 'yards' as const, label: 'Yard Numbers', icon: Warehouse },
    { id: 'employees' as const, label: 'Employees', icon: Users },
  ]

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Settings</h1>
          <p className="text-sm text-slate-500">Manage yards and team</p>
        </div>
        <button
          onClick={() => { void load() }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="card p-10 text-center">
          <Loader2 size={20} className="animate-spin text-slate-300 mx-auto" />
        </div>
      ) : activeTab === 'yards' ? (
        <div className="card p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800 mb-1">Yard Numbers</h2>
            <p className="text-xs text-slate-400">
              Ye yard numbers WhatsApp message mein aur delivery form mein dikhenge.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {yards.map((yard: string) => (
              <div key={yard} className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-3 py-1.5">
                <Warehouse size={13} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-700">{yard}</span>
                <button
                  onClick={() => removeYard(yard)}
                  className="text-slate-400 hover:text-red-500 transition-colors ml-1"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={newYard}
              onChange={(e) => setNewYard(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addYard()}
              placeholder="Naya yard name (e.g. Yard 4)"
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            <button
              onClick={addYard}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors"
            >
              <Plus size={14} />
              Add
            </button>
          </div>

          <button
            onClick={() => { void saveYards() }}
            disabled={savingYards}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingYards ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
            {savingYards ? 'Saving...' : 'Save Yards'}
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
            <Users size={15} className="text-slate-400" />
            <h2 className="text-sm font-bold text-slate-800">Team Members</h2>
            <span className="badge bg-slate-100 text-slate-600 ml-1">{displayedEmployees.length}</span>
            {isSuperAdmin && (
              <button
                onClick={() => setShowAll((v: boolean) => !v)}
                className="ml-auto text-xs text-brand-600 hover:underline font-medium"
              >
                {showAll ? 'Active only' : 'Show all'}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Email</th>
                  <th>Mobile</th>
                  <th>Role</th>
                  <th>Location</th>
                  {isSuperAdmin && <th>Status</th>}
                </tr>
              </thead>
              <tbody>
                {displayedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400 text-sm">
                      No employees found
                    </td>
                  </tr>
                ) : displayedEmployees.map((emp) => (
                  <tr key={emp.id}>
                    <td className="font-semibold text-slate-800">
                      {[emp.first_name, emp.last_name].filter(Boolean).join(' ')}
                    </td>
                    <td className="font-mono text-xs text-slate-500">{emp.employee_code ?? '—'}</td>
                    <td className="text-slate-500 text-xs">{emp.email}</td>
                    <td className="font-mono text-xs text-slate-500">{emp.mobile ?? '—'}</td>
                    <td>
                      {emp.role && (
                        <span className={`badge ${
                          emp.role.code === 'PDIQCMGR' ? 'bg-brand-100 text-brand-700' :
                          emp.role.code === 'TECHNICIAN' ? 'bg-emerald-100 text-emerald-700' :
                          emp.role.code === 'DRIVER' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {emp.role.name}
                        </span>
                      )}
                    </td>
                    <td>
                      {emp.location ? (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <MapPin size={11} />
                          {emp.location.name}
                        </span>
                      ) : '—'}
                    </td>
                    {isSuperAdmin && (
                      <td>
                        <span className={`badge ${
                          emp.employee_status === 'active' || emp.employee_status === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {emp.employee_status ?? 'unknown'}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
