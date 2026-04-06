import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { useBranch } from '@/context/branch-context'
import {
  buildSalesTeamMap,
  deriveCarStatus,
  carStatusLabel,
  carStatusBadgeClass,
  customerName,
  fmtDate,
  getDeliveryStatus,
  getSalesTeamLocation,
} from '@/lib/utils'
import type {
  MatchedStock,
  QCRecord,
  TransferTask,
  StockWithMeta,
  BookingRow,
} from '@/types'

// ── In-city detection ─────────────────────────────────────────────────────────
const JAIPUR_LOCATIONS = new Set(['Jagatpura', 'Ajmer Road', 'Hawa Sadak'])

function isInCity(from: string, to: string): boolean {
  return JAIPUR_LOCATIONS.has(from) && JAIPUR_LOCATIONS.has(to)
}

// ── Date range helpers ────────────────────────────────────────────────────────
type DateRange = 'today' | 'week' | 'month' | 'custom'

function getDateBounds(range: DateRange, customFrom: string, customTo: string): { from: Date; to: Date } {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  if (range === 'today') {
    return { from: startOfDay, to: endOfDay }
  }
  if (range === 'week') {
    const day = now.getDay()
    const monday = new Date(startOfDay)
    monday.setDate(startOfDay.getDate() - ((day + 6) % 7))
    return { from: monday, to: endOfDay }
  }
  if (range === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: first, to: endOfDay }
  }
  // custom
  const from = customFrom ? new Date(customFrom) : startOfDay
  const to   = customTo   ? new Date(new Date(customTo).setHours(23, 59, 59, 999)) : endOfDay
  return { from, to }
}

// ── Driver report types ───────────────────────────────────────────────────────
interface DriverStat {
  id: number
  name: string
  total: number
  completed: number
  inCity: number
  outCity: number
}

// ── Data loader ───────────────────────────────────────────────────────────────
async function loadAllStock(
  isManager: boolean,
  isSuperAdmin: boolean,
  locationName: string,
  selectedBranch: string | null,
): Promise<StockWithMeta[]> {
  const supabase = createClient()

  const [
    salesTeamMap,
    { data: stockData },
    { data: bookingData },
    { data: qcData },
    { data: transferData },
  ] = await Promise.all([
    buildSalesTeamMap(),
    supabase.from('matched_stock_customers').select('*'),
    supabase
      .from('booking')
      .select('id, crm_opty_id, delivery_date, delivery_time, qc_check_status'),
    supabase.from('car_qc_records').select('*'),
    supabase.from('transfer_tasks').select('*'),
  ])

  const bookingMap = new Map<string, BookingRow>()
  for (const b of (bookingData ?? []) as BookingRow[]) {
    if (b.crm_opty_id) bookingMap.set(b.crm_opty_id, b)
  }

  const qcMap = new Map<string, QCRecord>()
  for (const q of (qcData ?? []) as QCRecord[]) {
    qcMap.set(q.chassis_no, q)
  }

  const transferMap = new Map<string, TransferTask>()
  for (const t of (transferData ?? []) as TransferTask[]) {
    transferMap.set(t.chassis_no, t)
  }

  let stock = (stockData ?? []) as MatchedStock[]
  stock = stock.filter(
    s => `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim().length > 0,
  )

  if (!isManager && !isSuperAdmin && locationName) {
    stock = stock.filter(s => s.current_location === locationName)
  }

  return stock.map(s => {
    const booking = s.opportunity_name ? bookingMap.get(s.opportunity_name) : null
    const qcRecord = qcMap.get(s.chassis_no) ?? null
    const transfer = transferMap.get(s.chassis_no) ?? null
    const deliveryBranch = getSalesTeamLocation(salesTeamMap, s.sales_team)
    const deliveryDate = booking?.delivery_date ?? null
    const deliveryTime = booking?.delivery_time ?? null
    const qcStatus = qcRecord?.final_status ?? booking?.qc_check_status ?? null

    return {
      ...s,
      booking_uuid: booking?.id ?? null,
      booking_id: s.opportunity_name ?? null,
      delivery_date: deliveryDate,
      delivery_time: deliveryTime,
      delivery_status: getDeliveryStatus(deliveryDate),
      qc_status: qcStatus,
      qc_record: qcRecord,
      transfer,
      car_status: deriveCarStatus(
        s.current_location,
        deliveryBranch,
        transfer,
        qcStatus,
        deliveryDate,
      ),
      delivery_branch: deliveryBranch,
    } satisfies StockWithMeta
  }).filter(s => !selectedBranch || s.delivery_branch === selectedBranch)
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate()
  const { authUser, isManager, isSuperAdmin } = useAuth()
  const { selectedBranch } = useBranch()
  const [items, setItems] = useState<StockWithMeta[]>([])
  const [loading, setLoading] = useState(true)

  // Driver report state
  const [driverStats, setDriverStats] = useState<DriverStat[]>([])
  const [driverLoading, setDriverLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  const locationName = authUser?.location?.name ?? ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await loadAllStock(isManager, isSuperAdmin, locationName, selectedBranch)
      data.sort((a, b) => {
        if (!a.delivery_date && !b.delivery_date) return 0
        if (!a.delivery_date) return 1
        if (!b.delivery_date) return -1
        return a.delivery_date.localeCompare(b.delivery_date)
      })
      setItems(data)
    } finally {
      setLoading(false)
    }
  }, [isManager, isSuperAdmin, locationName, selectedBranch])

  const loadDriverStats = useCallback(async () => {
    setDriverLoading(true)
    try {
      const supabase = createClient()
      const { from, to } = getDateBounds(dateRange, customFrom, customTo)

      const [{ data: tasks }, { data: employees }] = await Promise.all([
        supabase
          .from('transfer_tasks')
          .select('*')
          .gte('assigned_at', from.toISOString())
          .lte('assigned_at', to.toISOString()),
        supabase
          .from('employees')
          .select('id, first_name, last_name, role:roles!inner(code)')
          .eq('roles.code', 'DRIVER'),
      ])

      const taskList = (tasks ?? []) as TransferTask[]
      const empList = (employees ?? []) as Array<{
        id: number
        first_name: string
        last_name: string | null
        role: Array<{ code: string }>
      }>

      // group tasks by driver
      const statsMap = new Map<number, DriverStat>()

      for (const emp of empList) {
        statsMap.set(emp.id, {
          id: emp.id,
          name: [emp.first_name, emp.last_name].filter(Boolean).join(' '),
          total: 0,
          completed: 0,
          inCity: 0,
          outCity: 0,
        })
      }

      for (const task of taskList) {
        if (!task.driver_id) continue
        if (!statsMap.has(task.driver_id)) continue

        const stat = statsMap.get(task.driver_id)!
        stat.total++

        if (task.status === 'arrived') stat.completed++

        if (isInCity(task.from_location, task.to_location)) {
          stat.inCity++
        } else {
          stat.outCity++
        }
      }

      // only show drivers who have at least 1 task in range
      const result = Array.from(statsMap.values())
        .filter(s => s.total > 0)
        .sort((a, b) => b.total - a.total)

      setDriverStats(result)
    } finally {
      setDriverLoading(false)
    }
  }, [dateRange, customFrom, customTo])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadDriverStats() }, [loadDriverStats])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const total         = items.length
  const transferCount = items.filter(i =>
    ['transfer_needed', 'transfer_assigned', 'in_transit'].includes(i.car_status),
  ).length
  const qcPending  = items.filter(i => i.car_status === 'qc_pending').length
  const qcApproved = items.filter(i => i.car_status === 'qc_approved' || i.car_status === 'ready').length
  const rejected   = items.filter(i => i.car_status === 'qc_rejected').length

  const rejectedItems = items.filter(i => i.car_status === 'qc_rejected')

  function handleRangeClick(r: DateRange) {
    if (r === 'custom') {
      setShowCustom(true)
      setDateRange('custom')
    } else {
      setShowCustom(false)
      setDateRange(r)
    }
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>होम डैशबोर्ड</h1>
          {authUser?.location?.name && (
            <p className="subtitle">{authUser.location.name}</p>
          )}
        </div>
        <button
          className="nav-btn"
          title="रिफ्रेश"
          style={{ minWidth: 36, minHeight: 36 }}
          onClick={() => { void load(); void loadDriverStats() }}
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {/* Rejection alert */}
      {rejected > 0 && (
        <div className="alert-strip">
          <AlertTriangle size={15} />
          <span>
            {rejected} गाड़ी{rejected > 1 ? 'यां' : ''} QC फेल हुई — दोबारा जांच जरूरी
          </span>
        </div>
      )}

      {/* Row 1: Total Cars + Transfer Pending */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">कुल गाड़ियां</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>
            {loading ? '—' : total}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">ट्रांसफर बाकी</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>
            {loading ? '—' : transferCount}
          </div>
        </div>
      </div>

      {/* Row 2: QC Pending + QC Approved + QC Rejected */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '0 16px 4px' }}>
        <div className="stat-card" style={{ padding: '12px 10px' }}>
          <div className="stat-label" style={{ fontSize: 10 }}>QC बाकी</div>
          <div className="stat-value" style={{ color: 'var(--purple)', fontSize: 22 }}>
            {loading ? '—' : qcPending}
          </div>
        </div>
        <div className="stat-card" style={{ padding: '12px 10px' }}>
          <div className="stat-label" style={{ fontSize: 10 }}>QC पास</div>
          <div className="stat-value" style={{ color: 'var(--green)', fontSize: 22 }}>
            {loading ? '—' : qcApproved}
          </div>
        </div>
        <div className="stat-card" style={{ padding: '12px 10px' }}>
          <div className="stat-label" style={{ fontSize: 10 }}>QC रद्द</div>
          <div className="stat-value" style={{ color: 'var(--red)', fontSize: 22 }}>
            {loading ? '—' : rejected}
          </div>
        </div>
      </div>

      {/* QC Rejected section */}
      {!loading && rejectedItems.length > 0 && (
        <>
          <div className="section-label">ध्यान दें — QC रद्द</div>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rejectedItems.map(item => (
              <div
                key={item.chassis_no}
                className="card"
                style={{ borderLeft: '3px solid var(--red)' }}
              >
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span
                        className="mono"
                        style={{ color: 'var(--accent)', display: 'block', marginBottom: 2, cursor: 'pointer', textDecoration: 'underline' }}
                        onClick={() => navigate(`/history?chassis=${encodeURIComponent(item.chassis_no)}`)}
                      >
                        {item.chassis_no}
                      </span>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                        {item.product_description ?? item.product_line ?? '—'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {item.sales_team ?? customerName(item)}
                      </div>
                    </div>
                    <span className="badge badge-red">QC रद्द</span>
                  </div>
                  {item.qc_record?.remarks && (
                    <div style={{ marginTop: 8, padding: '6px 10px', background: '#FEE2E2', borderRadius: 8, fontSize: 12, color: 'var(--red)' }}>
                      {item.qc_record.remarks}
                    </div>
                  )}
                  {item.delivery_date && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                      {fmtDate(item.delivery_date)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Driver Task Report */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px' }}>
        <div className="section-label" style={{ padding: 0 }}>ड्राइवर रिपोर्ट</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {(['today', 'week', 'month', 'custom'] as DateRange[]).map(r => (
            <button
              key={r}
              onClick={() => handleRangeClick(r)}
              style={{
                fontSize: 11,
                padding: '4px 9px',
                borderRadius: 20,
                border: '1px solid var(--border)',
                background: dateRange === r ? 'var(--text)' : 'transparent',
                color: dateRange === r ? 'var(--surface)' : 'var(--muted)',
                cursor: 'pointer',
                fontWeight: 500,
                textTransform: 'capitalize',
              }}
            >
              {r === 'week' ? 'इस हफ्ते' : r === 'month' ? 'इस महीने' : r === 'custom' ? 'कस्टम' : 'आज'}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range picker */}
      {showCustom && (
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 10px', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>से</span>
          <input
            type="date"
            className="form-input"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            style={{ flex: 1, fontSize: 13 }}
          />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>तक</span>
          <input
            type="date"
            className="form-input"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            style={{ flex: 1, fontSize: 13 }}
          />
          <button
            onClick={() => void loadDriverStats()}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            लागू करें
          </button>
        </div>
      )}

      {/* Driver report table */}
      <div style={{ margin: '0 16px 8px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 44px 44px 44px 58px',
            padding: '8px 12px',
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ड्राइवर</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>कुल</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>शहर में</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>शहर बाहर</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>पूरे</div>
          </div>

          {driverLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>लोड हो रहा है...</div>
          ) : driverStats.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
              इस अवधि में कोई ड्राइवर टास्क नहीं मिला
            </div>
          ) : (
            driverStats.map((stat, idx) => {
              const doneColor =
                stat.completed === stat.total ? '#DCFCE7' :
                stat.completed === 0          ? '#FEE2E2' : '#FEF3C7'
              const doneTextColor =
                stat.completed === stat.total ? 'var(--green)' :
                stat.completed === 0          ? 'var(--red)' : 'var(--amber)'

              return (
                <div
                  key={stat.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 44px 44px 44px 58px',
                    padding: '10px 12px',
                    borderBottom: idx < driverStats.length - 1 ? '1px solid var(--border)' : 'none',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                    {stat.name}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', textAlign: 'center' }}>{stat.total}</div>
                  <div style={{ fontSize: 13, color: 'var(--accent)', textAlign: 'center', fontWeight: 500 }}>{stat.inCity}</div>
                  <div style={{ fontSize: 13, color: 'var(--amber)', textAlign: 'center', fontWeight: 500 }}>{stat.outCity}</div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 7px',
                      borderRadius: 20,
                      background: doneColor,
                      color: doneTextColor,
                      fontWeight: 600,
                    }}>
                      {stat.completed}/{stat.total}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div style={{ height: 16 }} />
    </div>
  )
}