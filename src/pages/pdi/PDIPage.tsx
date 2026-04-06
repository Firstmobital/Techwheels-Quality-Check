import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Play,
  RefreshCw,
  Wrench,
  XCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/components/ui/Toast'
import { faultSeverityLabel, fmtDate } from '@/lib/utils'
import type { FaultSeverity, PDIRecord, QCChecklistItem, YardSlot } from '@/types'

type PdiTab = 'pending' | 'passed' | 'failed'

interface FaultTicketRow {
  id: string
  chassis_no: string
  stage: 'pdi' | 'delivery_qc'
  raised_by: number | null
  assigned_to: number | null
  severity: FaultSeverity
  description: string
  status: 'open' | 'in_progress' | 'resolved' | 'verified'
  resolution_notes: string | null
  resolved_at: string | null
  created_at: string
}

const CHECKLIST_TEMPLATE: Array<{ key: string; label: string }> = [
  { key: 'engine', label: 'इंजन' },
  { key: 'transmission', label: 'गियरबॉक्स' },
  { key: 'brakes', label: 'ब्रेक' },
  { key: 'tyres', label: 'टायर' },
  { key: 'ac', label: 'AC' },
  { key: 'lights_front', label: 'आगे की लाइट' },
  { key: 'lights_rear', label: 'पीछे की लाइट' },
  { key: 'horn', label: 'हॉर्न' },
  { key: 'body', label: 'बॉडी / रंग' },
  { key: 'interior', label: 'अंदर की सीट' },
  { key: 'fuel', label: 'ईंधन स्तर' },
  { key: 'documents', label: 'कागज़ात' },
  { key: 'windshield', label: 'शीशा' },
  { key: 'electricals', label: 'बिजली का काम' },
]

function defaultChecklist(): QCChecklistItem[] {
  return CHECKLIST_TEMPLATE.map(item => ({
    key: item.key,
    label: item.label,
    passed: true,
    note: '',
  }))
}

function severityBadgeClass(severity: FaultSeverity): string {
  switch (severity) {
    case 'minor':
      return 'badge-blue'
    case 'major':
      return 'badge-amber'
    case 'critical':
      return 'badge-red'
  }
}

export default function PDIPage() {
  const supabase = createClient()
  const { authUser, isTechnician } = useAuth()
  const { success, error: toastError } = useToast()

  const techId = authUser?.employee?.id ?? null

  const [activeTab, setActiveTab] = useState<PdiTab>('pending')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [yardSlots, setYardSlots] = useState<YardSlot[]>([])
  const [pdiRecords, setPdiRecords] = useState<PDIRecord[]>([])
  const [faults, setFaults] = useState<FaultTicketRow[]>([])

  const [expandedChassis, setExpandedChassis] = useState<string | null>(null)
  const [checklistByChassis, setChecklistByChassis] = useState<Record<string, QCChecklistItem[]>>({})
  const [remarksByChassis, setRemarksByChassis] = useState<Record<string, string>>({})
  const [draftFaultByChassis, setDraftFaultByChassis] = useState<
    Record<string, { severity: FaultSeverity; description: string; yardName: string }>
  >({})
  const [resolutionByFault, setResolutionByFault] = useState<Record<string, string>>({})

  const [actioningId, setActioningId] = useState<string | null>(null)

  const loadData = useCallback(async (manual = false) => {
    if (!techId) {
      setLoading(false)
      return
    }

    if (manual) setRefreshing(true)
    else setLoading(true)

    try {
      const [yardRes, pdiRes, faultRes] = await Promise.all([
        supabase
          .from('yard_slots')
          .select('*')
          .eq('ready_for_pdi', true)
          .order('arrived_at', { ascending: false }),
        supabase
          .from('pdi_records')
          .select('*')
          .eq('technician_id', techId)
          .order('attempt_no', { ascending: false }),
        supabase
          .from('fault_tickets')
          .select('id, chassis_no, stage, raised_by, assigned_to, severity, description, status, resolution_notes, resolved_at, created_at')
          .eq('stage', 'pdi')
          .eq('assigned_to', techId)
          .in('status', ['open', 'in_progress'])
          .order('created_at', { ascending: false }),
      ])

      if (yardRes.error) throw yardRes.error
      if (pdiRes.error) throw pdiRes.error
      if (faultRes.error) throw faultRes.error

      setYardSlots((yardRes.data ?? []) as YardSlot[])
      setPdiRecords((pdiRes.data ?? []) as PDIRecord[])
      setFaults((faultRes.data ?? []) as FaultTicketRow[])
    } catch (err) {
      console.error('[PDIPage] loadData failed:', err)
      toastError('PDI डेटा लोड नहीं हुआ')
    } finally {
      if (manual) setRefreshing(false)
      else setLoading(false)
    }
  }, [supabase, techId, toastError])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const latestRecordByChassis = useMemo(() => {
    const map = new Map<string, PDIRecord>()
    for (const rec of pdiRecords) {
      if (!map.has(rec.chassis_no)) map.set(rec.chassis_no, rec)
    }
    return map
  }, [pdiRecords])

  const pendingSlots = useMemo(
    () => yardSlots.filter(slot => {
      const rec = latestRecordByChassis.get(slot.chassis_no)
      return !rec || rec.status === 'pending'
    }),
    [yardSlots, latestRecordByChassis],
  )

  const passedRecords = useMemo(
    () => pdiRecords.filter(r => r.status === 'passed'),
    [pdiRecords],
  )

  const failedRecords = useMemo(
    () => pdiRecords.filter(r => r.status === 'failed'),
    [pdiRecords],
  )

  const getAttemptNo = (chassisNo: string): number => {
    const count = pdiRecords.filter(r => r.chassis_no === chassisNo).length
    return count + 1
  }

  const takeAssignment = async (slot: YardSlot) => {
    if (!techId) return
    setActioningId(slot.id)
    try {
      const { error } = await supabase.from('pdi_records').insert({
        chassis_no: slot.chassis_no,
        technician_id: techId,
        checklist: [],
        photo_urls: [],
        remarks: null,
        status: 'pending',
        attempt_no: getAttemptNo(slot.chassis_no),
        checked_at: null,
      })
      if (error) throw error
      success('असाइनमेंट मिल गया')
      void loadData(true)
    } catch (err: unknown) {
      toastError('असाइन नहीं हुआ: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setActioningId(null)
    }
  }

  const startPdi = (slot: YardSlot) => {
    if (!checklistByChassis[slot.chassis_no]) {
      setChecklistByChassis(prev => ({
        ...prev,
        [slot.chassis_no]: defaultChecklist(),
      }))
    }
    setExpandedChassis(slot.chassis_no)
  }

  const setChecklistItem = (
    chassisNo: string,
    key: string,
    patch: Partial<QCChecklistItem>,
  ) => {
    setChecklistByChassis(prev => {
      const current = prev[chassisNo] ?? defaultChecklist()
      return {
        ...prev,
        [chassisNo]: current.map(item => (item.key === key ? { ...item, ...patch } : item)),
      }
    })
  }

  const submitPdi = async (slot: YardSlot, status: 'passed' | 'failed') => {
    if (!techId) return
    const checklist = checklistByChassis[slot.chassis_no] ?? defaultChecklist()
    const remarks = remarksByChassis[slot.chassis_no]?.trim() || null

    setActioningId(slot.id)
    try {
      const now = new Date().toISOString()
      const { error } = await supabase.from('pdi_records').insert({
        chassis_no: slot.chassis_no,
        technician_id: techId,
        checklist,
        photo_urls: [],
        remarks,
        status,
        attempt_no: getAttemptNo(slot.chassis_no),
        checked_at: now,
      })
      if (error) throw error

      if (status === 'passed') {
        const { error: yardUpdateError } = await supabase
          .from('yard_slots')
          .update({ ready_for_pdi: true })
          .eq('id', slot.id)
        if (yardUpdateError) throw yardUpdateError

        const { error: moveErr } = await supabase.from('chassis_movements').insert({
          chassis_no: slot.chassis_no,
          event_type: 'pdi_passed',
          from_location: slot.yard_name,
          to_location: null,
          performed_by: techId,
          notes: remarks,
          event_at: now,
        })
        if (moveErr) throw moveErr
        success('PDI पास हो गई!')
        setExpandedChassis(null)
      } else {
        setDraftFaultByChassis(prev => ({
          ...prev,
          [slot.chassis_no]: {
            severity: 'minor',
            description: '',
            yardName: slot.yard_name,
          },
        }))
      }

      void loadData(true)
    } catch (err: unknown) {
      toastError('PDI सेव नहीं हुई: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setActioningId(null)
    }
  }

  const submitFault = async (chassisNo: string) => {
    if (!techId) return
    const draft = draftFaultByChassis[chassisNo]
    if (!draft) return

    const description = draft.description.trim()
    if (!description) {
      toastError('क्या खराबी है? लिखना जरूरी है')
      return
    }

    setActioningId(chassisNo)
    try {
      const now = new Date().toISOString()

      const { error: faultError } = await supabase.from('fault_tickets').insert({
        chassis_no: chassisNo,
        stage: 'pdi',
        raised_by: techId,
        assigned_to: techId,
        severity: draft.severity,
        description,
        photo_urls: [],
        status: 'open',
      })
      if (faultError) throw faultError

      const { error: moveFaultRaisedError } = await supabase.from('chassis_movements').insert({
        chassis_no: chassisNo,
        event_type: 'fault_raised',
        from_location: draft.yardName,
        to_location: null,
        performed_by: techId,
        notes: description,
        event_at: now,
      })
      if (moveFaultRaisedError) throw moveFaultRaisedError

      const { error: movePdiFailedError } = await supabase.from('chassis_movements').insert({
        chassis_no: chassisNo,
        event_type: 'pdi_failed',
        from_location: draft.yardName,
        to_location: null,
        performed_by: techId,
        notes: description,
        event_at: now,
      })
      if (movePdiFailedError) throw movePdiFailedError

      setDraftFaultByChassis(prev => {
        const next = { ...prev }
        delete next[chassisNo]
        return next
      })
      setExpandedChassis(null)
      success('Fault दर्ज हो गई')
      void loadData(true)
      setActiveTab('failed')
    } catch (err: unknown) {
      toastError('Fault सेव नहीं हुई: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setActioningId(null)
    }
  }

  const startFaultWork = async (fault: FaultTicketRow) => {
    setActioningId(fault.id)
    try {
      const { error } = await supabase
        .from('fault_tickets')
        .update({ status: 'in_progress' })
        .eq('id', fault.id)
      if (error) throw error
      success('काम शुरू हुआ')
      void loadData(true)
    } catch (err: unknown) {
      toastError('स्टेटस अपडेट नहीं हुआ: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setActioningId(null)
    }
  }

  const resolveFault = async (fault: FaultTicketRow) => {
    if (!techId) return
    const notes = (resolutionByFault[fault.id] ?? '').trim()
    if (!notes) {
      toastError('रिजॉल्यूशन नोट्स लिखें')
      return
    }

    setActioningId(fault.id)
    try {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('fault_tickets')
        .update({
          status: 'resolved',
          resolution_notes: notes,
          resolved_at: now,
        })
        .eq('id', fault.id)
      if (error) throw error

      const { error: moveError } = await supabase.from('chassis_movements').insert({
        chassis_no: fault.chassis_no,
        event_type: 'fault_resolved',
        from_location: null,
        to_location: null,
        performed_by: techId,
        notes,
        event_at: now,
      })
      if (moveError) throw moveError

      success('Fault ठीक हो गई')
      void loadData(true)
    } catch (err: unknown) {
      toastError('Fault अपडेट नहीं हुई: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setActioningId(null)
    }
  }

  if (!isTechnician) {
    return (
      <div className="fade-in">
        <div className="page-header">
          <div>
            <h1>PDI</h1>
            <p className="subtitle">एक्सेस सीमित है</p>
          </div>
        </div>
        <div className="alert-strip" style={{ marginTop: 12 }}>
          <AlertCircle size={16} />
          <span>यह पेज केवल टेक्नीशियन के लिए है।</span>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>PDI जांच</h1>
          <p className="subtitle">यार्ड से आई गाड़ियों की तकनीकी जांच</p>
        </div>
        <button
          className="nav-btn"
          style={{ minWidth: 36, minHeight: 36 }}
          onClick={() => { void loadData(true) }}
          disabled={loading || refreshing}
        >
          <RefreshCw size={18} className={loading || refreshing ? 'spin' : ''} />
        </button>
      </div>

      <div className="filter-row" style={{ paddingTop: 10 }}>
        <button
          className={`filter-pill ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          बाकी ({pendingSlots.length})
        </button>
        <button
          className={`filter-pill ${activeTab === 'passed' ? 'active' : ''}`}
          onClick={() => setActiveTab('passed')}
        >
          पास ({passedRecords.length})
        </button>
        <button
          className={`filter-pill ${activeTab === 'failed' ? 'active' : ''}`}
          onClick={() => setActiveTab('failed')}
        >
          फेल ({failedRecords.length})
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)' }}>
          <RefreshCw size={18} className="spin" />
        </div>
      ) : activeTab === 'pending' ? (
        <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pendingSlots.length === 0 && (
            <div className="task-card" style={{ padding: 16, color: 'var(--muted)' }}>
              कोई पेंडिंग गाड़ी नहीं है।
            </div>
          )}

          {pendingSlots.map(slot => {
            const record = latestRecordByChassis.get(slot.chassis_no)
            const isAssigned = Boolean(record)
            const checklist = checklistByChassis[slot.chassis_no] ?? defaultChecklist()
            const faultDraft = draftFaultByChassis[slot.chassis_no]

            return (
              <div key={slot.id} className="task-card">
                <div className="card-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ color: 'var(--accent)', marginBottom: 4 }}>{slot.chassis_no}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span className={`badge ${slot.intake_type === 'trolley' ? 'badge-purple' : 'badge-blue'}`}>
                        {slot.intake_type === 'trolley' ? 'ट्रॉली से' : 'डीलर ट्रांसफर'}
                      </span>
                      <span className="badge badge-gray">{slot.yard_name}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      आया: {fmtDate(slot.arrived_at)}
                    </div>
                  </div>
                </div>

                <div className="card-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {!isAssigned ? (
                    <button
                      className="filter-pill"
                      disabled={actioningId === slot.id}
                      onClick={() => { void takeAssignment(slot) }}
                    >
                      लो असाइनमेंट
                    </button>
                  ) : (
                    <span className="badge badge-green">असाइन्ड</span>
                  )}

                  {isAssigned && (
                    <button
                      className="filter-pill"
                      onClick={() => startPdi(slot)}
                    >
                      PDI शुरू करें
                    </button>
                  )}
                </div>

                {expandedChassis === slot.chassis_no && isAssigned && (
                  <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
                    {checklist.map(item => (
                      <div key={item.key} className="check-item">
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{item.label}</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              className={`filter-pill ${item.passed ? 'active' : ''}`}
                              onClick={() => setChecklistItem(slot.chassis_no, item.key, { passed: true, note: '' })}
                              type="button"
                            >
                              ✓ पास
                            </button>
                            <button
                              className={`filter-pill ${!item.passed ? 'active' : ''}`}
                              onClick={() => setChecklistItem(slot.chassis_no, item.key, { passed: false })}
                              type="button"
                            >
                              ✗ फेल
                            </button>
                          </div>

                          {!item.passed && (
                            <textarea
                              className="form-input"
                              rows={2}
                              style={{ marginTop: 8 }}
                              placeholder="समस्या लिखें"
                              value={item.note}
                              onChange={e => setChecklistItem(slot.chassis_no, item.key, { note: e.target.value })}
                            />
                          )}
                        </div>
                      </div>
                    ))}

                    <div style={{ marginTop: 10 }}>
                      <label className="section-label" style={{ padding: 0, marginBottom: 4 }}>कोई अन्य टिप्पणी</label>
                      <textarea
                        className="form-input"
                        rows={3}
                        value={remarksByChassis[slot.chassis_no] ?? ''}
                        onChange={e => setRemarksByChassis(prev => ({ ...prev, [slot.chassis_no]: e.target.value }))}
                      />
                    </div>

                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <button
                        className="big-btn big-btn-green"
                        style={{ minHeight: 42 }}
                        onClick={() => { void submitPdi(slot, 'passed') }}
                        disabled={actioningId === slot.id}
                      >
                        <CheckCircle2 size={16} />
                        PDI पास करें
                      </button>
                      <button
                        className="big-btn big-btn-red"
                        style={{ minHeight: 42 }}
                        onClick={() => { void submitPdi(slot, 'failed') }}
                        disabled={actioningId === slot.id}
                      >
                        <XCircle size={16} />
                        PDI फेल - Fault दर्ज करें
                      </button>
                    </div>

                    {faultDraft && (
                      <div className="task-card" style={{ margin: '10px 0 0', borderColor: '#FECACA' }}>
                        <div style={{ padding: 12 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--red)' }}>
                            Fault दर्ज करें
                          </div>

                          <label className="section-label" style={{ padding: 0, marginBottom: 4 }}>Severity</label>
                          <select
                            className="form-input"
                            value={faultDraft.severity}
                            onChange={e =>
                              setDraftFaultByChassis(prev => ({
                                ...prev,
                                [slot.chassis_no]: {
                                  ...faultDraft,
                                  severity: e.target.value as FaultSeverity,
                                },
                              }))
                            }
                          >
                            <option value="minor">{faultSeverityLabel('minor')}</option>
                            <option value="major">{faultSeverityLabel('major')}</option>
                            <option value="critical">{faultSeverityLabel('critical')}</option>
                          </select>

                          <label className="section-label" style={{ padding: 0, marginTop: 10, marginBottom: 4 }}>क्या खराबी है?</label>
                          <textarea
                            className="form-input"
                            rows={3}
                            value={faultDraft.description}
                            onChange={e =>
                              setDraftFaultByChassis(prev => ({
                                ...prev,
                                [slot.chassis_no]: {
                                  ...faultDraft,
                                  description: e.target.value,
                                },
                              }))
                            }
                          />

                          <button
                            className="big-btn big-btn-red"
                            style={{ marginTop: 10, minHeight: 42 }}
                            onClick={() => { void submitFault(slot.chassis_no) }}
                            disabled={actioningId === slot.chassis_no}
                          >
                            <Wrench size={16} />
                            Fault सबमिट करें
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : activeTab === 'passed' ? (
        <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {passedRecords.length === 0 ? (
            <div className="task-card" style={{ padding: 16, color: 'var(--muted)' }}>
              अभी कोई पास रिकॉर्ड नहीं है।
            </div>
          ) : (
            passedRecords.map(rec => (
              <div key={rec.id} className="task-card">
                <div className="card-row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div className="mono" style={{ color: 'var(--accent)' }}>{rec.chassis_no}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      चेक किया: {rec.checked_at ? fmtDate(rec.checked_at) : '—'}
                    </div>
                  </div>
                  <span className="badge badge-green">पास</span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {faults.length === 0 ? (
            <div className="task-card" style={{ padding: 16, color: 'var(--muted)' }}>
              कोई ओपन Fault नहीं है।
            </div>
          ) : (
            faults.map(fault => (
              <div key={fault.id} className="task-card">
                <div className="card-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div className="mono" style={{ color: 'var(--accent)' }}>{fault.chassis_no}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      <span className={`badge ${severityBadgeClass(fault.severity)}`}>
                        {faultSeverityLabel(fault.severity)}
                      </span>
                      <span className={`badge ${fault.status === 'open' ? 'badge-amber' : 'badge-blue'}`}>
                        {fault.status === 'open' ? 'खुली' : 'काम जारी'}
                      </span>
                    </div>
                    <p style={{ marginTop: 8, fontSize: 13 }}>{fault.description}</p>
                  </div>
                </div>

                <div style={{ padding: '0 12px 12px' }}>
                  {fault.status === 'open' && (
                    <button
                      className="filter-pill"
                      onClick={() => { void startFaultWork(fault) }}
                      disabled={actioningId === fault.id}
                      type="button"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}
                    >
                      <Play size={14} />
                      काम शुरू हुआ
                    </button>
                  )}

                  <label className="section-label" style={{ padding: 0, marginBottom: 4 }}>रिजॉल्यूशन नोट्स</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={resolutionByFault[fault.id] ?? ''}
                    onChange={e => setResolutionByFault(prev => ({ ...prev, [fault.id]: e.target.value }))}
                    placeholder="क्या ठीक किया गया?"
                  />

                  <button
                    className="big-btn big-btn-green"
                    style={{ marginTop: 10, minHeight: 42 }}
                    onClick={() => { void resolveFault(fault) }}
                    disabled={actioningId === fault.id}
                  >
                    <CheckCircle2 size={16} />
                    ठीक हो गई - Submit करें
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
