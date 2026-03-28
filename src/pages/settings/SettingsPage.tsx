import { useEffect, useState, useCallback } from 'react'
import { Plus, X, RefreshCw, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/components/ui/Toast'
import { initials } from '@/lib/utils'

type SettingsTab = 'yards' | 'team'

interface EmployeeRow {
  id: number
  first_name: string
  last_name: string | null
  email: string
  mobile: string | null
  employee_status: string | null
  role: { name: string; code: string } | null
  location: { name: string } | null
}

function roleBadgeClass(code: string): string {
  if (code === 'PDIQCMGR') return 'badge-blue'
  if (code === 'TECHNICIAN') return 'badge-green'
  if (code === 'DRIVER') return 'badge-amber'
  return 'badge-gray'
}

function roleShortName(code: string): string {
  if (code === 'PDIQCMGR') return 'Manager'
  if (code === 'TECHNICIAN') return 'Tech'
  if (code === 'DRIVER') return 'Driver'
  return code
}

export default function SettingsPage() {
  const { authUser, isSuperAdmin, signOut } = useAuth()
  const { success, error: toastError } = useToast()
  const supabase = createClient()

  const [tab, setTab] = useState<SettingsTab>('yards')
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [yards, setYards] = useState<string[]>([])
  const [newYard, setNewYard] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingYards, setSavingYards] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: emps }, { data: yardSetting }] = await Promise.all([
      supabase
        .from('employees')
        .select('id, first_name, last_name, email, mobile, employee_status, role:roles(name,code), location:locations(name)')
        .order('first_name'),
      supabase.from('app_settings').select('value').eq('key', 'yards').single(),
    ])
    setEmployees((emps as unknown as EmployeeRow[]) ?? [])
    setYards(Array.isArray(yardSetting?.value) ? yardSetting.value : ['Yard 1', 'Yard 2', 'Yard 3'])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function addYard() {
    const t = newYard.trim()
    if (!t || yards.includes(t)) return
    setYards(prev => [...prev, t])
    setNewYard('')
  }

  function removeYard(yard: string) {
    setYards(prev => prev.filter(v => v !== yard))
  }

  async function saveYards() {
    setSavingYards(true)
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'yards', value: yards, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setSavingYards(false)
    if (error) { toastError('Save failed: ' + error.message); return }
    success('Yards saved!')
  }

  async function handleSignOut() {
    setSigningOut(true)
    try { await signOut() } catch { setSigningOut(false) }
  }

  const emp = authUser?.employee
  const role = authUser?.role

  const activeEmployees = employees.filter(e =>
    !e.employee_status || e.employee_status === 'active' || e.employee_status === 'confirmed'
  )

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header">
        <h1>Settings</h1>
        <button
          onClick={() => { void load() }}
          className="nav-btn"
          style={{ minWidth: 36, minHeight: 36 }}
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
        </button>
      </div>

      <div style={{ padding: '16px' }}>
        {/* Profile card */}
        {emp && (
          <div className="card" style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0,
            }}>
              {initials(emp.first_name, emp.last_name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                {[emp.first_name, emp.last_name].filter(Boolean).join(' ')}
              </div>
              {role && (
                <span className={`badge ${roleBadgeClass(role.code)}`} style={{ marginTop: 4 }}>
                  {roleShortName(role.code)}
                </span>
              )}
              {authUser?.location && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{authUser.location.name}</div>
              )}
            </div>
            {isSuperAdmin && (
              <span className="badge badge-purple">Super Admin</span>
            )}
          </div>
        )}

        {/* Tab pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([['yards', 'Yard Locations'], ['team', 'Team Members']] as [SettingsTab, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`filter-pill${tab === key ? ' active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading...</div>
        ) : tab === 'yards' ? (
          /* Yards tab */
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {yards.map(yard => (
                <div
                  key={yard}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '6px 10px',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{yard}</span>
                  <button
                    onClick={() => removeYard(yard)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, display: 'flex' }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                className="form-input"
                value={newYard}
                onChange={e => setNewYard(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addYard()}
                placeholder="New yard name (e.g. Yard 4)"
                style={{ flex: 1 }}
              />
              <button
                onClick={addYard}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0 16px', borderRadius: 10, background: 'var(--text)',
                  color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, flexShrink: 0,
                }}
              >
                <Plus size={14} />
                Add
              </button>
            </div>

            <button
              className="big-btn big-btn-primary"
              onClick={() => { void saveYards() }}
              disabled={savingYards}
            >
              {savingYards ? <RefreshCw size={15} className="spin" /> : null}
              {savingYards ? 'Saving...' : 'Save Yards'}
            </button>
          </div>
        ) : (
          /* Team tab */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeEmployees.map(e => (
              <div key={e.id} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: e.role?.code === 'DRIVER' ? '#FEF3C7' : e.role?.code === 'TECHNICIAN' ? '#DCFCE7' : '#DBEAFE',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 13, flexShrink: 0,
                  color: e.role?.code === 'DRIVER' ? '#92400E' : e.role?.code === 'TECHNICIAN' ? '#166534' : '#1D4ED8',
                }}>
                  {initials(e.first_name, e.last_name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                    {[e.first_name, e.last_name].filter(Boolean).join(' ')}
                  </div>
                  {e.location && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{e.location.name}</div>
                  )}
                </div>
                {e.role && (
                  <span className={`badge ${roleBadgeClass(e.role.code)}`}>
                    {roleShortName(e.role.code)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Sign out */}
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => { void handleSignOut() }}
            disabled={signingOut}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '13px', borderRadius: 12, border: '1.5px solid var(--border)',
              background: 'none', color: 'var(--red)', fontWeight: 600, fontSize: 15, cursor: 'pointer',
            }}
          >
            {signingOut ? <RefreshCw size={16} className="spin" /> : <LogOut size={16} />}
            Sign Out
          </button>
        </div>

        <div style={{ height: 16 }} />
      </div>
    </div>
  )
}
