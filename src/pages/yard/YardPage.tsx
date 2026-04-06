import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  CarFront,
  Check,
  CheckCircle2,
  PlugZap,
  RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/components/ui/Toast'
import type { YardSlot } from '@/types'

type TabKey = 'yard' | 'entry'
type IntakeType = 'trolley' | 'stock_transfer'
type EvChargingStatus = 'na' | 'pending' | 'charging' | 'complete'

const YARD_OPTIONS = ['अजमेर रोड', 'जगतपुरा', 'हवा सड़क']

function intakeTypeLabel(type: IntakeType): string {
  return type === 'trolley' ? 'ट्रॉली से' : 'डीलर से ट्रांसफर'
}

function evLabel(status: EvChargingStatus): string {
  switch (status) {
    case 'na':
      return 'लागू नहीं'
    case 'pending':
      return 'बाकी'
    case 'charging':
      return 'चार्ज हो रही है'
    case 'complete':
      return 'पूरी'
  }
}

function evBadgeClass(status: EvChargingStatus): string {
  switch (status) {
    case 'na':
      return 'badge-gray'
    case 'pending':
      return 'badge-amber'
    case 'charging':
      return 'badge-blue'
    case 'complete':
      return 'badge-green'
  }
}

function intakeBadgeClass(type: IntakeType): string {
  return type === 'trolley' ? 'badge-purple' : 'badge-blue'
}

interface YardSummary {
  total: number
  ready: number
  evNa: number
  evPending: number
  evCharging: number
  evComplete: number
}

export default function YardPage() {
  const navigate = useNavigate()
  const supabase = createClient()
  const { authUser, isYardManager, loading: authLoading } = useAuth()
  const { success, error: toastError } = useToast()

  const [activeTab, setActiveTab] = useState<TabKey>('yard')
  const [slots, setSlots] = useState<YardSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)

  const [chassisNo, setChassisNo] = useState('')
  const [intakeType, setIntakeType] = useState<IntakeType>('trolley')
  const [fromDealer, setFromDealer] = useState('')
  const [yardName, setYardName] = useState(YARD_OPTIONS[0])
  const [slotNo, setSlotNo] = useState('')
  const [isEv, setIsEv] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingEntry, setSavingEntry] = useState(false)

  const fetchSlots = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const { data, error } = await supabase
        .from('yard_slots')
        .select('*')
        .order('arrived_at', { ascending: false })

      if (error) throw error
      setSlots((data ?? []) as YardSlot[])
    } catch (err: unknown) {
      toastError('यार्ड डेटा लोड नहीं हुआ')
      console.error('[YardPage] fetchSlots failed:', err)
    } finally {
      if (isManualRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }, [supabase, toastError])

  useEffect(() => {
    void fetchSlots()
  }, [fetchSlots])

  const grouped = useMemo(() => {
    const map = new Map<string, YardSlot[]>()
    for (const slot of slots) {
      const key = slot.yard_name || 'अन्य'
      const current = map.get(key) ?? []
      current.push(slot)
      map.set(key, current)
    }
    return Array.from(map.entries())
  }, [slots])

  const totals = useMemo(() => {
    const summary: YardSummary = {
      total: slots.length,
      ready: 0,
      evNa: 0,
      evPending: 0,
      evCharging: 0,
      evComplete: 0,
    }

    for (const slot of slots) {
      if (slot.ready_for_pdi) summary.ready += 1
      if (slot.ev_charging_status === 'na') summary.evNa += 1
      if (slot.ev_charging_status === 'pending') summary.evPending += 1
      if (slot.ev_charging_status === 'charging') summary.evCharging += 1
      if (slot.ev_charging_status === 'complete') summary.evComplete += 1
    }

    return summary
  }, [slots])

  const patchSlot = useCallback(async (id: string, patch: Partial<YardSlot>) => {
    setWorkingId(id)
    try {
      const { error } = await supabase
        .from('yard_slots')
        .update(patch)
        .eq('id', id)

      if (error) throw error

      setSlots(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)))
    } catch (err: unknown) {
      toastError('अपडेट सेव नहीं हुआ')
      console.error('[YardPage] patchSlot failed:', err)
    } finally {
      setWorkingId(null)
    }
  }, [supabase, toastError])

  const toggleReady = useCallback(async (slot: YardSlot) => {
    await patchSlot(slot.id, { ready_for_pdi: !slot.ready_for_pdi })
  }, [patchSlot])

  const unblock = useCallback(async (slot: YardSlot) => {
    await patchSlot(slot.id, { is_blocked: false })
  }, [patchSlot])

  const updateEvStatus = useCallback(async (slot: YardSlot, status: EvChargingStatus) => {
    await patchSlot(slot.id, { ev_charging_status: status })
  }, [patchSlot])

  const resetForm = () => {
    setChassisNo('')
    setIntakeType('trolley')
    setFromDealer('')
    setYardName(YARD_OPTIONS[0])
    setSlotNo('')
    setIsEv(false)
    setIsBlocked(false)
    setNotes('')
  }

  const submitNewEntry = async () => {
    const cleanedChassis = chassisNo.trim().toUpperCase()
    const cleanedDealer = fromDealer.trim()

    if (!cleanedChassis) {
      toastError('चेसिस नंबर जरूरी है')
      return
    }

    if (intakeType === 'stock_transfer' && !cleanedDealer) {
      toastError('डीलर का नाम / पता भरें')
      return
    }

    if (!authUser?.employee?.id) {
      toastError('यूजर जानकारी नहीं मिली')
      return
    }

    const arrivedAt = new Date().toISOString()
    const evStatus: EvChargingStatus = isEv ? 'pending' : 'na'

    setSavingEntry(true)
    try {
      const { error: slotError } = await supabase.from('yard_slots').insert({
        yard_name: yardName,
        chassis_no: cleanedChassis,
        slot_no: slotNo.trim() || null,
        intake_type: intakeType,
        from_dealer: intakeType === 'stock_transfer' ? cleanedDealer : null,
        ev_charging_status: evStatus,
        is_blocked: isBlocked,
        ready_for_pdi: false,
        arrived_at: arrivedAt,
        notes: notes.trim() || null,
        created_by: authUser.employee.id,
      })
      if (slotError) throw slotError

      const movementEventType =
        intakeType === 'trolley' ? 'intake_trolley' : 'intake_stock_transfer'

      const { error: movementError } = await supabase
        .from('chassis_movements')
        .insert({
          chassis_no: cleanedChassis,
          event_type: movementEventType,
          from_location: intakeType === 'stock_transfer' ? cleanedDealer : null,
          to_location: yardName,
          performed_by: authUser.employee.id,
          notes: notes.trim() || null,
          metadata: {
            intake_type: intakeType,
            slot_no: slotNo.trim() || null,
            is_ev: isEv,
            is_blocked: isBlocked,
          },
          event_at: arrivedAt,
        })
      if (movementError) throw movementError

      success('गाड़ी यार्ड में दर्ज हो गई')
      resetForm()
      setActiveTab('yard')
      void fetchSlots(true)
    } catch (err: unknown) {
      toastError('सेव नहीं हुआ: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSavingEntry(false)
    }
  }

  if (authLoading) {
    return (
      <div className="fade-in" style={{ padding: 16 }}>
        <div className="page-header">
          <div>
            <h1>यार्ड</h1>
            <p className="subtitle">लोड हो रहा है...</p>
          </div>
        </div>
        <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
          <RefreshCw size={18} className="spin" />
        </div>
      </div>
    )
  }

  if (!isYardManager) {
    return (
      <div className="fade-in">
        <div className="page-header">
          <div>
            <h1>यार्ड</h1>
            <p className="subtitle">एक्सेस सीमित है</p>
          </div>
        </div>
        <div className="alert-strip" style={{ marginTop: 14 }}>
          <AlertCircle size={16} />
          <span>यह पेज केवल यार्ड मैनेजर के लिए है।</span>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>यार्ड मैनेजर</h1>
          <p className="subtitle">यार्ड स्थिति और नई एंट्री</p>
        </div>
        <button
          className="filter-pill"
          onClick={() => { void fetchSlots(true) }}
          disabled={refreshing || loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          रिफ्रेश
        </button>
      </div>

      <div className="filter-row" style={{ paddingTop: 10 }}>
        <button
          className={`filter-pill ${activeTab === 'yard' ? 'active' : ''}`}
          onClick={() => setActiveTab('yard')}
        >
          यार्ड
        </button>
        <button
          className={`filter-pill ${activeTab === 'entry' ? 'active' : ''}`}
          onClick={() => setActiveTab('entry')}
        >
          एंट्री करें
        </button>
      </div>

      {activeTab === 'yard' ? (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">कुल गाड़ियां</div>
              <div className="stat-value">{totals.total}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">PDI तैयार</div>
              <div className="stat-value">{totals.ready}</div>
            </div>
          </div>

          <div className="task-card" style={{ marginTop: 2 }}>
            <div className="card-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8 }}>
              <span className="badge badge-gray">EV लागू नहीं: {totals.evNa}</span>
              <span className="badge badge-amber">EV बाकी: {totals.evPending}</span>
              <span className="badge badge-blue">चार्जिंग: {totals.evCharging}</span>
              <span className="badge badge-green">पूरी: {totals.evComplete}</span>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 20, display: 'flex', justifyContent: 'center', color: 'var(--muted)' }}>
              <RefreshCw size={18} className="spin" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="section-label" style={{ paddingTop: 20 }}>कोई गाड़ी नहीं मिली</div>
          ) : (
            grouped.map(([yard, list]) => {
              const yardReady = list.filter(x => x.ready_for_pdi).length
              const evPending = list.filter(x => x.ev_charging_status === 'pending').length
              const evCharging = list.filter(x => x.ev_charging_status === 'charging').length
              const evComplete = list.filter(x => x.ev_charging_status === 'complete').length

              return (
                <div key={yard}>
                  <div className="section-label" style={{ paddingTop: 16 }}>
                    {yard}
                  </div>
                  <div className="task-card" style={{ marginBottom: 8 }}>
                    <div className="card-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8 }}>
                      <span className="badge badge-gray">कुल: {list.length}</span>
                      <span className="badge badge-green">PDI तैयार: {yardReady}</span>
                      <span className="badge badge-amber">EV बाकी: {evPending}</span>
                      <span className="badge badge-blue">चार्जिंग: {evCharging}</span>
                      <span className="badge badge-green">EV पूरी: {evComplete}</span>
                    </div>
                  </div>

                  {list.map(slot => (
                    <div key={slot.id} className="task-card">
                      <div className="card-row" style={{ alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            className="mono"
                            style={{ color: 'var(--accent)', marginBottom: 6, cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => navigate(`/history?chassis=${encodeURIComponent(slot.chassis_no)}`)}
                          >
                            {slot.chassis_no}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            <span className={`badge ${intakeBadgeClass(slot.intake_type)}`}>
                              {intakeTypeLabel(slot.intake_type)}
                            </span>
                            <span className={`badge ${evBadgeClass(slot.ev_charging_status)}`}>
                              {evLabel(slot.ev_charging_status)}
                            </span>
                            {slot.is_blocked && <span className="badge badge-red">ब्लॉक</span>}
                            <span className={`badge ${slot.ready_for_pdi ? 'badge-green' : 'badge-amber'}`}>
                              {slot.ready_for_pdi ? 'PDI तैयार' : 'PDI बाकी'}
                            </span>
                            {slot.slot_no && <span className="badge badge-gray">स्लॉट: {slot.slot_no}</span>}
                          </div>
                          {slot.notes && (
                            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>{slot.notes}</p>
                          )}
                        </div>
                      </div>

                      <div
                        className="card-row"
                        style={{
                          justifyContent: 'space-between',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}
                      >
                        <button
                          className="filter-pill"
                          disabled={workingId === slot.id}
                          onClick={() => { void toggleReady(slot) }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <CheckCircle2 size={14} />
                          PDI के लिए तैयार
                        </button>

                        {slot.is_blocked && (
                          <button
                            className="filter-pill"
                            disabled={workingId === slot.id}
                            onClick={() => { void unblock(slot) }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <Check size={14} />
                            अनब्लॉक करें
                          </button>
                        )}

                        {slot.ev_charging_status !== 'na' && (
                          <div style={{ minWidth: 160, marginLeft: 'auto' }}>
                            <select
                              className="form-input"
                              value={slot.ev_charging_status}
                              disabled={workingId === slot.id}
                              onChange={e => {
                                void updateEvStatus(
                                  slot,
                                  e.target.value as EvChargingStatus,
                                )
                              }}
                            >
                              <option value="pending">बाकी</option>
                              <option value="charging">चार्ज हो रही है</option>
                              <option value="complete">पूरी</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </>
      ) : (
        <div style={{ padding: '12px 16px 16px' }}>
          <div className="task-card" style={{ margin: 0, overflow: 'visible' }}>
            <div style={{ padding: 14 }}>
              <label className="section-label" style={{ padding: 0, marginBottom: 6 }}>चेसिस नंबर</label>
              <input
                className="form-input"
                placeholder="जैसे: MA1ABCD123"
                value={chassisNo}
                onChange={e => setChassisNo(e.target.value)}
              />

              <label className="section-label" style={{ padding: 0, marginTop: 14, marginBottom: 6 }}>इंटेक टाइप</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={`filter-pill ${intakeType === 'trolley' ? 'active' : ''}`}
                  onClick={() => setIntakeType('trolley')}
                  type="button"
                >
                  ट्रॉली से
                </button>
                <button
                  className={`filter-pill ${intakeType === 'stock_transfer' ? 'active' : ''}`}
                  onClick={() => setIntakeType('stock_transfer')}
                  type="button"
                >
                  डीलर से ट्रांसफर
                </button>
              </div>

              {intakeType === 'stock_transfer' && (
                <>
                  <label className="section-label" style={{ padding: 0, marginTop: 14, marginBottom: 6 }}>डीलर का नाम / पता</label>
                  <input
                    className="form-input"
                    placeholder="डीलर जानकारी लिखें"
                    value={fromDealer}
                    onChange={e => setFromDealer(e.target.value)}
                  />
                </>
              )}

              <label className="section-label" style={{ padding: 0, marginTop: 14, marginBottom: 6 }}>यार्ड नाम</label>
              <select
                className="form-input"
                value={yardName}
                onChange={e => setYardName(e.target.value)}
              >
                {YARD_OPTIONS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <label className="section-label" style={{ padding: 0, marginTop: 14, marginBottom: 6 }}>स्लॉट नंबर (वैकल्पिक)</label>
              <input
                className="form-input"
                placeholder="जैसे: A-12"
                value={slotNo}
                onChange={e => setSlotNo(e.target.value)}
              />

              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PlugZap size={16} color="var(--muted)" />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>क्या EV है?</span>
                </div>
                <button
                  type="button"
                  className={`filter-pill ${isEv ? 'active' : ''}`}
                  onClick={() => setIsEv(v => !v)}
                >
                  {isEv ? 'हां' : 'नहीं'}
                </button>
              </div>

              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CarFront size={16} color="var(--muted)" />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>क्या ब्लॉक है?</span>
                </div>
                <button
                  type="button"
                  className={`filter-pill ${isBlocked ? 'active' : ''}`}
                  onClick={() => setIsBlocked(v => !v)}
                >
                  {isBlocked ? 'हां' : 'नहीं'}
                </button>
              </div>

              <label className="section-label" style={{ padding: 0, marginTop: 14, marginBottom: 6 }}>नोट्स (वैकल्पिक)</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="अतिरिक्त जानकारी"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />

              <button
                className="big-btn big-btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => { void submitNewEntry() }}
                disabled={savingEntry}
              >
                {savingEntry ? <RefreshCw size={16} className="spin" /> : <CheckCircle2 size={16} />}
                {savingEntry ? 'सेव हो रहा है...' : 'यार्ड में दर्ज करें'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
