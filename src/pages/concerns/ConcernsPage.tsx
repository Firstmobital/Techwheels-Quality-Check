import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle, XCircle, Plus, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { hi } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { concernCategoryLabel, concernStatusLabel } from '@/lib/utils'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/components/ui/Toast'
import type { Concern, ConcernCategory, ConcernRoleType } from '@/types'

type UserTab = 'open_seen' | 'resolved' | 'rejected'
type ManagerFilter = 'all' | 'sales' | 'yard_manager' | 'open' | 'resolved'

interface ConcernRow extends Concern {
  raiser?: { first_name: string; last_name: string | null }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'open':
      return 'badge-red'
    case 'seen':
      return 'badge-amber'
    case 'resolved':
      return 'badge-green'
    case 'rejected':
      return 'badge-gray'
    default:
      return 'badge-gray'
  }
}

export default function ConcernsPage() {
  const supabase = createClient()
  const {
    authUser,
    isSales,
    isYardManager,
    isManager,
    isSuperAdmin,
  } = useAuth()
  const { success, error: toastError } = useToast()

  const employeeId = authUser?.employee?.id ?? null
  const canRaise = isSales || isYardManager
  const isManagementView = isManager || isSuperAdmin

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [items, setItems] = useState<ConcernRow[]>([])

  const [showForm, setShowForm] = useState(false)
  const [chassisNo, setChassisNo] = useState('')
  const [category, setCategory] = useState<ConcernCategory>('other')
  const [description, setDescription] = useState('')
  const [savingForm, setSavingForm] = useState(false)

  const [userTab, setUserTab] = useState<UserTab>('open_seen')
  const [managerFilter, setManagerFilter] = useState<ManagerFilter>('all')
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [managerComments, setManagerComments] = useState<Record<string, string>>({})

  const roleType: ConcernRoleType = isSales ? 'sales' : 'yard_manager'

  const categoryOptions = useMemo<ConcernCategory[]>(() => {
    if (isSales) {
      return ['delivery_delay', 'vehicle_condition', 'documentation', 'other']
    }
    return ['yard_capacity', 'ev_charging', 'vehicle_missing', 'safety', 'other']
  }, [isSales])

  const load = useCallback(async (manual = false) => {
    if (!employeeId) {
      setLoading(false)
      return
    }

    if (manual) setRefreshing(true)
    else setLoading(true)

    try {
      let query = supabase
        .from('concerns')
        .select('*, raiser:employees!concerns_raised_by_fkey(first_name, last_name)')
        .order('created_at', { ascending: false })

      if (!isManagementView) {
        query = query.eq('raised_by', employeeId)
      }

      const { data, error } = await query
      if (error) throw error

      setItems((data ?? []) as ConcernRow[])
    } catch (err: unknown) {
      toastError('डेटा लोड नहीं हुआ')
      console.error('[ConcernsPage] load failed:', err)
    } finally {
      if (manual) setRefreshing(false)
      else setLoading(false)
    }
  }, [employeeId, isManagementView, supabase, toastError])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!canRaise) return
    setCategory(categoryOptions[0] ?? 'other')
  }, [canRaise, categoryOptions])

  const visibleItems = useMemo(() => {
    if (isManagementView) {
      return items.filter(item => {
        if (managerFilter === 'all') return true
        if (managerFilter === 'sales') return item.role_type === 'sales'
        if (managerFilter === 'yard_manager') return item.role_type === 'yard_manager'
        if (managerFilter === 'open') return item.status === 'open' || item.status === 'seen'
        if (managerFilter === 'resolved') return item.status === 'resolved'
        return true
      })
    }

    return items.filter(item => {
      if (userTab === 'open_seen') return item.status === 'open' || item.status === 'seen'
      if (userTab === 'resolved') return item.status === 'resolved'
      return item.status === 'rejected'
    })
  }, [isManagementView, items, managerFilter, userTab])

  const submitConcern = async () => {
    if (!employeeId) return
    if (!description.trim()) {
      toastError('चिंता का विवरण लिखें')
      return
    }

    setSavingForm(true)
    try {
      const { error } = await supabase.from('concerns').insert({
        raised_by: employeeId,
        role_type: roleType,
        chassis_no: chassisNo.trim() || null,
        category,
        description: description.trim(),
        status: 'open',
      })
      if (error) throw error

      setDescription('')
      setChassisNo('')
      setCategory(categoryOptions[0] ?? 'other')
      setShowForm(false)
      success('आपकी चिंता दर्ज हो गई')
      void load(true)
    } catch (err: unknown) {
      toastError('चिंता दर्ज नहीं हुई: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSavingForm(false)
    }
  }

  const updateConcernStatus = async (
    concernId: string,
    nextStatus: 'seen' | 'resolved' | 'rejected',
    managerComment?: string | null,
  ) => {
    if (!employeeId) return

    setActioningId(concernId)
    try {
      const payload: Record<string, unknown> = { status: nextStatus }

      if (nextStatus === 'resolved') {
        payload.manager_comment = managerComment ?? null
        payload.resolved_by = employeeId
        payload.resolved_at = new Date().toISOString()
      }

      if (nextStatus === 'rejected') {
        payload.resolved_by = employeeId
        payload.resolved_at = new Date().toISOString()
      }

      const { error } = await supabase.from('concerns').update(payload).eq('id', concernId)
      if (error) throw error

      success(
        nextStatus === 'seen'
          ? 'चिंता देखी गई'
          : nextStatus === 'resolved'
          ? 'चिंता हल हुई'
          : 'चिंता खारिज हुई',
      )
      void load(true)
    } catch (err: unknown) {
      toastError('अपडेट नहीं हुआ: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setActioningId(null)
    }
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>चिंताएं</h1>
          {!loading && <p className="subtitle">{visibleItems.length} रिकॉर्ड</p>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {canRaise && (
            <button
              className="filter-pill"
              onClick={() => setShowForm(v => !v)}
              disabled={savingForm}
              type="button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} />
              + नई चिंता दर्ज करें
            </button>
          )}

          <button
            className="nav-btn"
            style={{ minWidth: 36, minHeight: 36 }}
            onClick={() => { void load(true) }}
            disabled={loading || refreshing}
          >
            <RefreshCw size={18} className={loading || refreshing ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {canRaise && showForm && (
        <div style={{ padding: '12px 16px 4px' }}>
          <div className="task-card" style={{ margin: 0 }}>
            <div style={{ padding: 12 }}>
              <label className="section-label" style={{ padding: 0, marginBottom: 4 }}>
                गाड़ी का नंबर (अगर हो)
              </label>
              <input
                className="form-input"
                value={chassisNo}
                onChange={e => setChassisNo(e.target.value.toUpperCase())}
                placeholder="जैसे: RJ14AB1234"
              />

              <label className="section-label" style={{ padding: 0, marginTop: 10, marginBottom: 4 }}>
                श्रेणी
              </label>
              <select
                className="form-input"
                value={category}
                onChange={e => setCategory(e.target.value as ConcernCategory)}
              >
                {categoryOptions.map(c => (
                  <option key={c} value={c}>{concernCategoryLabel(c)}</option>
                ))}
              </select>

              <label className="section-label" style={{ padding: 0, marginTop: 10, marginBottom: 4 }}>
                चिंता का विवरण लिखें
              </label>
              <textarea
                className="form-input"
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="विस्तार से लिखें"
              />

              <button
                className="big-btn big-btn-primary"
                style={{ marginTop: 10, minHeight: 42 }}
                onClick={() => { void submitConcern() }}
                disabled={savingForm}
                type="button"
              >
                {savingForm ? <RefreshCw size={15} className="spin" /> : <AlertCircle size={15} />}
                चिंता दर्ज करें
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="filter-row" style={{ paddingTop: 10 }}>
        {isManagementView ? (
          <>
            {([
              { key: 'all', label: 'सब' },
              { key: 'sales', label: 'सेल्स की' },
              { key: 'yard_manager', label: 'यार्ड की' },
              { key: 'open', label: 'खुली' },
              { key: 'resolved', label: 'हल हुई' },
            ] as Array<{ key: ManagerFilter; label: string }>).map(pill => (
              <button
                key={pill.key}
                className={`filter-pill ${managerFilter === pill.key ? 'active' : ''}`}
                onClick={() => setManagerFilter(pill.key)}
              >
                {pill.label}
              </button>
            ))}
          </>
        ) : (
          <>
            {([
              { key: 'open_seen', label: 'खुली' },
              { key: 'resolved', label: 'हल हुई' },
              { key: 'rejected', label: 'खारिज' },
            ] as Array<{ key: UserTab; label: string }>).map(tab => (
              <button
                key={tab.key}
                className={`filter-pill ${userTab === tab.key ? 'active' : ''}`}
                onClick={() => setUserTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--muted)' }}>लोड हो रहा है...</div>
      ) : visibleItems.length === 0 ? (
        <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--muted)' }}>कोई चिंता नहीं मिली</div>
      ) : (
        <div style={{ padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleItems.map(item => {
            const isOpenOrSeen = item.status === 'open' || item.status === 'seen'
            const comment = managerComments[item.id] ?? ''
            const raiserName = item.raiser
              ? [item.raiser.first_name, item.raiser.last_name].filter(Boolean).join(' ')
              : '—'

            return (
              <div key={item.id} className="task-card" style={{ margin: 0 }}>
                <div className="card-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span className="badge badge-blue">{concernCategoryLabel(item.category)}</span>
                      <span className={`badge ${statusBadgeClass(item.status)}`}>{concernStatusLabel(item.status)}</span>
                    </div>

                    {item.chassis_no && (
                      <div className="mono" style={{ color: 'var(--accent)', marginBottom: 6 }}>
                        {item.chassis_no}
                      </div>
                    )}

                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{item.description}</div>

                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: hi })}
                    </div>

                    {isManagementView && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                        दर्ज करने वाला: {raiserName}
                      </div>
                    )}

                    {!isManagementView && item.status === 'resolved' && item.manager_comment && (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                        मैनेजर टिप्पणी: {item.manager_comment}
                      </div>
                    )}
                  </div>
                </div>

                {isManagementView && isOpenOrSeen && (
                  <div style={{ padding: '0 12px 12px' }}>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="मैनेजर टिप्पणी लिखें"
                      value={comment}
                      onChange={e => setManagerComments(prev => ({ ...prev, [item.id]: e.target.value }))}
                    />

                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      {item.status === 'open' && (
                        <button
                          className="filter-pill"
                          type="button"
                          disabled={actioningId === item.id}
                          onClick={() => { void updateConcernStatus(item.id, 'seen') }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <AlertCircle size={14} />
                          देखी ✓
                        </button>
                      )}

                      <button
                        className="filter-pill"
                        type="button"
                        disabled={actioningId === item.id || !comment.trim()}
                        onClick={() => { void updateConcernStatus(item.id, 'resolved', comment.trim()) }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <CheckCircle size={14} />
                        हल करें
                      </button>

                      <button
                        className="filter-pill"
                        type="button"
                        disabled={actioningId === item.id}
                        onClick={() => { void updateConcernStatus(item.id, 'rejected') }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <XCircle size={14} />
                        खारिज करें
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
