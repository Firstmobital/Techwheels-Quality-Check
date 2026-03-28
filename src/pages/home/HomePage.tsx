import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, AlertTriangle, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import {
  buildSalesTeamMap,
  deriveCarStatus,
  carStatusLabel,
  carStatusBadgeClass,
  customerName,
  fmtDate,
  fmtTime,
  getDeliveryStatus,
  isWithin48Hours,
  getSalesTeamLocation,
} from '@/lib/utils'
import type {
  MatchedStock,
  QCRecord,
  TransferTask,
  StockWithMeta,
  BookingRow,
} from '@/types'

// ── Data loader ───────────────────────────────────────────────────────────────
async function loadAllStock(
  isManager: boolean,
  isSuperAdmin: boolean,
  locationName: string,
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

  // booking map: crm_opty_id → booking row
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

  // only cars that have a customer matched
  stock = stock.filter(
    s => `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim().length > 0,
  )

  // location filter for non-managers
  if (!isManager && !isSuperAdmin && locationName) {
    stock = stock.filter(s => s.current_location === locationName)
  }

  return stock.map(s => {
    const booking = s.opportunity_name
      ? bookingMap.get(s.opportunity_name)
      : null
    const qcRecord = qcMap.get(s.chassis_no) ?? null
    const transfer = transferMap.get(s.chassis_no) ?? null
    const deliveryBranch = getSalesTeamLocation(salesTeamMap, s.sales_team)
    const deliveryDate = booking?.delivery_date ?? null
    const deliveryTime = booking?.delivery_time ?? null
    const qcStatus =
      qcRecord?.final_status ?? booking?.qc_check_status ?? null

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
  })
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { authUser, isManager, isSuperAdmin } = useAuth()
  const [items, setItems] = useState<StockWithMeta[]>([])
  const [loading, setLoading] = useState(true)

  const locationName = authUser?.location?.name ?? ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await loadAllStock(isManager, isSuperAdmin, locationName)
      // sort by delivery date ascending, nulls last
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
  }, [isManager, isSuperAdmin, locationName])

  useEffect(() => { void load() }, [load])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const total         = items.length
  const transferCount = items.filter(i =>
    ['transfer_needed', 'transfer_assigned', 'in_transit'].includes(i.car_status),
  ).length
  const qcPending     = items.filter(i => i.car_status === 'qc_pending').length
  const rejected      = items.filter(i => i.car_status === 'qc_rejected').length
  const ready         = items.filter(i =>
    i.car_status === 'qc_approved' || i.car_status === 'ready',
  ).length

  const rejectedItems = items.filter(i => i.car_status === 'qc_rejected')
  const upcoming48    = items.filter(
    i => i.delivery_date && isWithin48Hours(i.delivery_date),
  )

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          {authUser?.location?.name && (
            <p className="subtitle">{authUser.location.name}</p>
          )}
        </div>
        <button
          className="nav-btn"
          style={{ minWidth: 36, minHeight: 36 }}
          onClick={() => { void load() }}
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
            {rejected} car{rejected > 1 ? 's' : ''} failed QC — re-inspection needed
          </span>
        </div>
      )}

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Cars</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>
            {loading ? '—' : total}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Transfer Pending</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>
            {loading ? '—' : transferCount}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">QC Pending</div>
          <div className="stat-value" style={{ color: 'var(--purple)' }}>
            {loading ? '—' : qcPending}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">QC Rejected</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>
            {loading ? '—' : rejected}
          </div>
        </div>
      </div>

      {/* QC Rejected section */}
      {!loading && rejectedItems.length > 0 && (
        <>
          <div className="section-label">Needs Attention — QC Rejected</div>
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
                      <span className="mono" style={{ color: 'var(--accent)', display: 'block', marginBottom: 2 }}>
                        {item.chassis_no}
                      </span>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                        {item.product_description ?? item.product_line ?? '—'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {customerName(item)}
                      </div>
                    </div>
                    <span className="badge badge-red">QC Rejected</span>
                  </div>
                  {item.qc_record?.remarks && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '6px 10px',
                        background: '#FEE2E2',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--red)',
                      }}
                    >
                      {item.qc_record.remarks}
                    </div>
                  )}
                  {item.delivery_date && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                      <Clock size={12} />
                      <span>
                        {fmtDate(item.delivery_date)}
                        {item.delivery_time ? ', ' + fmtTime(item.delivery_time) : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Upcoming 48h deliveries */}
      <div className="section-label">
        {upcoming48.length > 0
          ? `Deliveries in next 48 hours (${upcoming48.length})`
          : 'Deliveries in next 48 hours'}
      </div>

      {loading ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Loading...
        </div>
      ) : upcoming48.length === 0 ? (
        <div style={{ margin: '0 16px', padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          No deliveries in the next 48 hours
        </div>
      ) : (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {upcoming48.map(item => (
            <div key={item.chassis_no} className="card">
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <span className="mono" style={{ color: 'var(--accent)', display: 'block', marginBottom: 2 }}>
                      {item.chassis_no}
                    </span>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                      {item.product_description ?? item.product_line ?? '—'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {customerName(item)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span
                      className={`badge ${
                        item.delivery_status === 'today' ? 'badge-red' : 'badge-amber'
                      }`}
                    >
                      {item.delivery_status === 'today' ? 'Today' : 'Tomorrow'}
                    </span>
                    <span className={`badge ${carStatusBadgeClass(item.car_status)}`}>
                      {carStatusLabel(item.car_status)}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                  <Clock size={12} />
                  <span>
                    {fmtDate(item.delivery_date)}
                    {item.delivery_time ? ', ' + fmtTime(item.delivery_time) : ''}
                  </span>
                  {item.delivery_branch && (
                    <>
                      <span style={{ margin: '0 4px' }}>·</span>
                      <span>{item.delivery_branch}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All cars sorted by delivery date */}
      <div className="section-label" style={{ marginTop: 8 }}>
        All Cars — by delivery date
      </div>

      {loading ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Loading...
        </div>
      ) : items.length === 0 ? (
        <div style={{ margin: '0 16px 16px', padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          No matched stock found
        </div>
      ) : (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <div key={item.chassis_no} className="card">
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="mono" style={{ color: 'var(--accent)', display: 'block', marginBottom: 2 }}>
                      {item.chassis_no}
                    </span>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.product_description ?? item.product_line ?? '—'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {customerName(item)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span className={`badge ${carStatusBadgeClass(item.car_status)}`}>
                      {carStatusLabel(item.car_status)}
                    </span>
                    {item.delivery_date && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {fmtDate(item.delivery_date)}
                      </span>
                    )}
                  </div>
                </div>
                {(item.current_location || item.delivery_branch) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    {item.current_location && (
                      <span className="badge badge-gray">{item.current_location}</span>
                    )}
                    {item.delivery_branch &&
                      item.delivery_branch !== item.current_location && (
                        <>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
                          <span className="badge badge-blue">{item.delivery_branch}</span>
                        </>
                      )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div style={{ height: 8 }} />
        </div>
      )}

      <div style={{ height: 16 }} />
    </div>
  )
}