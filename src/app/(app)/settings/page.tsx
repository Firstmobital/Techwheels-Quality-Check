'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Header from '@/components/layout/Header'
import { Settings, Plus, X, Loader2, Users, MapPin, Warehouse } from 'lucide-react'

interface Employee {
  id: number
  first_name: string
  last_name: string | null
  email: string
  mobile: string | null
  employee_code: string | null
  role: { name: string; code: string } | null
  location: { name: string } | null
}

export default function SettingsPage() {
  const [employees, setEmployees]   = useState<Employee[]>([])
  const [yards, setYards]           = useState<string[]>([])
  const [newYard, setNewYard]       = useState('')
  const [loading, setLoading]       = useState(true)
  const [savingYards, setSavingYards] = useState(false)
  const [activeTab, setActiveTab]   = useState<'yards' | 'employees'>('yards')
  const supabase = createClient()

  async function load() {
    setLoading(true)

    const [{ data: emps }, { data: yardSetting }] = await Promise.all([
      supabase
        .from('employees')
        .select('id, first_name, last_name, email, mobile, employee_code, role:roles(name,code), location:locations(name)')
        .order('first_name'),
      supabase.from('app_settings').select('value').eq('key', 'yards').single(),
    ])

    setEmployees((emps as Employee[]) ?? [])
    setYards(Array.isArray(yardSetting?.value) ? yardSetting.value : ['Yard 1', 'Yard 2', 'Yard 3'])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function addYard() {
    const trimmed = newYard.trim()
    if (!trimmed || yards.includes(trimmed)) return
    setYards(y => [...y, trimmed])
    setNewYard('')
  }

  function removeYard(yard: string) {
    setYards(y => y.filter(v => v !== yard))
  }

  async function saveYards() {
    setSavingYards(true)
    await supabase.from('app_settings').upsert(
      { key: 'yards', value: yards, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
    setSavingYards(false)
    alert('Yards save ho gaye!')
  }

  const tabs = [
    { id: 'yards' as const,     label: 'Yard Numbers', icon: Warehouse },
    { id: 'employees' as const, label: 'Employees',    icon: Users },
  ]

  return (
    <>
      <Header title="Settings" subtitle="Manage yards and team" />

      <div className="max-w-3xl space-y-4">

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-slate-200">
          {tabs.map(t => {
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
          <div className="card p-10 text-center text-slate-400 text-sm animate-pulse">Loading...</div>
        ) : activeTab === 'yards' ? (
          /* ── YARDS ── */
          <div className="card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800 mb-1">Yard Numbers</h2>
              <p className="text-xs text-slate-400">
                Ye yard numbers WhatsApp message mein aur delivery form mein use honge.
              </p>
            </div>

            {/* Yard list */}
            <div className="flex flex-wrap gap-2">
              {yards.map(yard => (
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

            {/* Add yard */}
            <div className="flex gap-2">
              <input
                value={newYard}
                onChange={e => setNewYard(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addYard()}
                placeholder="Naya yard name (e.g. Yard 4)"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              <button
                onClick={addYard}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold
                           bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors"
              >
                <Plus size={14} />
                Add
              </button>
            </div>

            <button
              onClick={saveYards}
              disabled={savingYards}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold
                         bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingYards ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
              {savingYards ? 'Saving...' : 'Save Yards'}
            </button>
          </div>
        ) : (
          /* ── EMPLOYEES ── */
          <div className="card overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
              <Users size={15} className="text-slate-400" />
              <h2 className="text-sm font-bold text-slate-800">Team Members</h2>
              <span className="badge bg-slate-100 text-slate-600 ml-auto">{employees.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Employee Code</th>
                    <th>Email</th>
                    <th>Mobile</th>
                    <th>Role</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
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
                            emp.role.code === 'PDIQCMGR'   ? 'bg-brand-100 text-brand-700' :
                            emp.role.code === 'TECHNICIAN' ? 'bg-emerald-100 text-emerald-700' :
                            emp.role.code === 'DRIVER'     ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {emp.role.name}
                          </span>
                        )}
                      </td>
                      <td>
                        {emp.location && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <MapPin size={11} />
                            {emp.location.name}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
