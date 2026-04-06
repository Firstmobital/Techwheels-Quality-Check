import { useCallback, useEffect, useMemo, useState } from 'react'
import { History, MapPin, RefreshCw, Search } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { createClient } from '@/lib/supabase/client'
import { fmtDate } from '@/lib/utils'

type MovementEventType =
  | 'intake_trolley'
  | 'intake_stock_transfer'
  | 'pdi_passed'
  | 'pdi_failed'
  | 'transfer_assigned'
  | 'transfer_picked_up'
  | 'transfer_arrived'
  | 'qc_approved'
  | 'qc_rejected'
  | 'fault_raised'
  | 'fault_resolved'
  | 'delivery_ready'

interface ChassisMovementRow {
  id: string
  chassis_no: string
  event_type: MovementEventType
  from_location: string | null
  to_location: string | null
  notes: string | null
  event_at: string
}

interface YardSlotRow {
  id: string
  yard_name: string
  chassis_no: string
}

interface PdiRecordRow {
  id: string
  chassis_no: string
  attempt_no: number
}

interface FaultTicketRow {
  id: string
  chassis_no: string
}

interface QcRecordRow {
  id: string
  chassis_no: string
}

function eventTypeLabel(eventType: MovementEventType): string {
  switch (eventType) {
    case 'intake_trolley':
      return 'ट्रॉली से यार्ड में आई'
    case 'intake_stock_transfer':
      return 'डीलर से ट्रांसफर'
    case 'pdi_passed':
      return 'PDI पास'
    case 'pdi_failed':
      return 'PDI फेल'
    case 'transfer_assigned':
      return 'ट्रांसफर असाइन'
    case 'transfer_picked_up':
      return 'ड्राइवर ने ली'
    case 'transfer_arrived':
      return 'पहुँची'
    case 'qc_approved':
      return 'QC पास'
    case 'qc_rejected':
      return 'QC फेल'
    case 'fault_raised':
      return 'Fault दर्ज'
    case 'fault_resolved':
      return 'Fault ठीक'
    case 'delivery_ready':
      return 'डिलीवरी तैयार'
  }
}

function dotColor(eventType: MovementEventType): string {
  if (eventType === 'intake_trolley' || eventType === 'intake_stock_transfer') return '#1D4ED8'
  if (eventType === 'pdi_passed' || eventType === 'pdi_failed') return '#5B21B6'
  if (eventType === 'transfer_assigned' || eventType === 'transfer_picked_up' || eventType === 'transfer_arrived') return '#92400E'
  if (eventType === 'qc_approved' || eventType === 'qc_rejected' || eventType === 'delivery_ready') return '#166534'
  return '#991B1B'
}

function daysBetween(firstEventAt: string | null): number {
  if (!firstEventAt) return 0
  const first = new Date(firstEventAt)
  const now = new Date()
  const diff = now.getTime() - first.getTime()
  if (Number.isNaN(diff) || diff < 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export default function ChassisHistoryPage() {
  const supabase = createClient()
  const params = useParams<{ chassisNo?: string }>()
  const queryChassis = new URLSearchParams(window.location.search).get('chassis')
  const initialChassis = (params.chassisNo || queryChassis || '').trim().toUpperCase()

  const [searchInput, setSearchInput] = useState(initialChassis)
  const [activeChassis, setActiveChassis] = useState(initialChassis)
  const [loading, setLoading] = useState(Boolean(initialChassis))
  const [refreshing, setRefreshing] = useState(false)

  const [movements, setMovements] = useState<ChassisMovementRow[]>([])
  const [yardSlot, setYardSlot] = useState<YardSlotRow | null>(null)
  const [pdiRecords, setPdiRecords] = useState<PdiRecordRow[]>([])
  const [faultTickets, setFaultTickets] = useState<FaultTicketRow[]>([])
  const [qcRecord, setQcRecord] = useState<QcRecordRow | null>(null)

  const loadChassisData = useCallback(async (chassisNo: string, manual = false) => {
    const normalized = chassisNo.trim().toUpperCase()
    if (!normalized) return

    if (manual) setRefreshing(true)
    else setLoading(true)

    try {
      const [movementRes, yardRes, pdiRes, faultRes, qcRes] = await Promise.all([
        supabase
          .from('chassis_movements')
          .select('id, chassis_no, event_type, from_location, to_location, notes, event_at')
          .eq('chassis_no', normalized)
          .order('event_at', { ascending: true }),
        supabase
          .from('yard_slots')
          .select('id, yard_name, chassis_no')
          .eq('chassis_no', normalized)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('pdi_records')
          .select('id, chassis_no, attempt_no')
          .eq('chassis_no', normalized)
          .order('attempt_no', { ascending: true }),
        supabase
          .from('fault_tickets')
          .select('id, chassis_no')
          .eq('chassis_no', normalized),
        supabase
          .from('car_qc_records')
          .select('id, chassis_no')
          .eq('chassis_no', normalized)
          .limit(1)
          .maybeSingle(),
      ])

      if (movementRes.error) throw movementRes.error
      if (yardRes.error) throw yardRes.error
      if (pdiRes.error) throw pdiRes.error
      if (faultRes.error) throw faultRes.error
      if (qcRes.error) throw qcRes.error

      setMovements((movementRes.data ?? []) as ChassisMovementRow[])
      setYardSlot((yardRes.data ?? null) as YardSlotRow | null)
      setPdiRecords((pdiRes.data ?? []) as PdiRecordRow[])
      setFaultTickets((faultRes.data ?? []) as FaultTicketRow[])
      setQcRecord((qcRes.data ?? null) as QcRecordRow | null)
    } catch (err) {
      console.error('[ChassisHistoryPage] load failed:', err)
      setMovements([])
      setYardSlot(null)
      setPdiRecords([])
      setFaultTickets([])
      setQcRecord(null)
    } finally {
      if (manual) setRefreshing(false)
      else setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    if (!activeChassis) return
    void loadChassisData(activeChassis)
  }, [activeChassis, loadChassisData])

  const summary = useMemo(() => {
    const distinctLocations = new Set(
      movements
        .map(m => m.to_location)
        .filter((x): x is string => Boolean(x)),
    )
    const firstEvent = movements[0]?.event_at ?? null
    const lastEvent = movements[movements.length - 1]
    return {
      totalLocations: distinctLocations.size,
      totalMovements: movements.length,
      totalDays: daysBetween(firstEvent),
      currentStatus: lastEvent?.to_location ?? 'अज्ञात',
    }
  }, [movements])

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>चेसिस हिस्ट्री</h1>
          <p className="subtitle">मूवमेंट टाइमलाइन और वर्तमान स्थिति</p>
        </div>
        {activeChassis && (
          <button
            className="nav-btn"
            style={{ minWidth: 36, minHeight: 36 }}
            onClick={() => { void loadChassisData(activeChassis, true) }}
            disabled={loading || refreshing}
          >
            <RefreshCw size={18} className={loading || refreshing ? 'spin' : ''} />
          </button>
        )}
      </div>

      {!activeChassis && (
        <div style={{ padding: '14px 16px 8px' }}>
          <label className="section-label" style={{ padding: 0, marginBottom: 6 }}>
            Chassis नंबर खोजें
          </label>
          <div className="search-bar">
            <Search size={16} style={{ color: 'var(--muted)' }} />
            <input
              value={searchInput}
              placeholder="जैसे: RJ14AB1234"
              onChange={e => setSearchInput(e.target.value.toUpperCase())}
            />
            <button
              className="filter-pill"
              onClick={() => setActiveChassis(searchInput.trim().toUpperCase())}
            >
              खोजें
            </button>
          </div>
        </div>
      )}

      {activeChassis && (
        <>
          <div style={{ padding: '10px 16px 0' }}>
            <div className="task-card" style={{ margin: 0 }}>
              <div className="card-row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="mono" style={{ color: 'var(--accent)' }}>{activeChassis}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    यार्ड: {yardSlot?.yard_name ?? '—'} | PDI रिकॉर्ड: {pdiRecords.length} | Fault: {faultTickets.length} | QC: {qcRecord ? 1 : 0}
                  </div>
                </div>
                <History size={18} color="var(--muted)" />
              </div>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">कुल लोकेशन</div>
              <div className="stat-value">{summary.totalLocations}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">कुल movements</div>
              <div className="stat-value">{summary.totalMovements}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">कुल दिन</div>
              <div className="stat-value">{summary.totalDays}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">वर्तमान स्थिति</div>
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{summary.currentStatus}</div>
            </div>
          </div>

          <div style={{ padding: '0 16px 8px' }}>
            <div className="section-label" style={{ padding: '2px 0 8px' }}>टाइमलाइन</div>

            {loading ? (
              <div className="task-card" style={{ margin: 0, padding: 16, textAlign: 'center', color: 'var(--muted)' }}>
                <RefreshCw size={18} className="spin" />
              </div>
            ) : movements.length === 0 ? (
              <div className="task-card" style={{ margin: 0, padding: 16, color: 'var(--muted)' }}>
                इस चेसिस का कोई मूवमेंट रिकॉर्ड नहीं मिला।
              </div>
            ) : (
              <div className="task-card" style={{ margin: 0, padding: 12 }}>
                {movements.map((event, index) => {
                  const isLast = index === movements.length - 1
                  const color = dotColor(event.event_type)
                  return (
                    <div
                      key={event.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '20px 1fr',
                        gap: 10,
                        position: 'relative',
                        paddingBottom: isLast ? 0 : 14,
                      }}
                    >
                      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                        {!isLast && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 10,
                              bottom: -14,
                              width: 2,
                              background: 'var(--border)',
                            }}
                          />
                        )}
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: color,
                            marginTop: 4,
                            zIndex: 1,
                          }}
                        />
                      </div>

                      <div style={{ paddingBottom: isLast ? 0 : 2 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{eventTypeLabel(event.event_type)}</div>

                        {event.from_location && event.to_location && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, color: 'var(--muted)' }}>
                            <MapPin size={13} />
                            <span style={{ fontSize: 12 }}>{event.from_location} {'->'} {event.to_location}</span>
                          </div>
                        )}

                        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
                          {fmtDate(event.event_at)}
                        </div>

                        {event.notes && (
                          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text)' }}>{event.notes}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ padding: '0 16px 16px' }}>
            <button
              className="big-btn"
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
              onClick={() => window.history.back()}
            >
              वापस जाएं
            </button>
          </div>
        </>
      )}
    </div>
  )
}
