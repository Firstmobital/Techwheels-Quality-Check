import { useEffect, useState, useCallback } from 'react'
import { AlertTriangle, RefreshCw, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import {
  buildSalesTeamMap,
  deriveCarStatus,
  fmtDate,
  fmtTime,
  customerName,
  isWithin48Hours,
  getDeliveryStatus,
} from '@/lib/utils'
import type { MatchedStock, QCRecord, TransferTask, StockWithMeta } from '@/types'

interface BookingRow {
  crm_opty_id: string | null
  delivery_date: string | null
  delivery_time: string | null
  qc_check_status: string | null
}

function buildStockMeta(
  stock: MatchedStock,
  bookings: Map<string, BookingRow>,
  qcMap: Map<string, QCRecord>,
  transferMap: Map<string, TransferTask>,
  salesTeamMap: Map<string, string>
): StockWithMeta {
  const booking = stock.opportunity_name ? bookings.get(stock.opportunity_name) : null
  const qcRecord = qcMap.get(stock.chassis_no) ?? null
  const transfer = transferMap.get(stock.chassis_no) ?? null
  const bookingBranch = stock.sales_team ? (salesTeamMap.get(stock.sales_team) ?? null) : null
  const deliveryDate = booking?.delivery_date ?? null
  const deliveryTime = booking?.delivery_time ?? null
  const qcStatus = qcRecord?.final_status ?? booking?.qc_check_status ?? null

  return {
    ...stock,
    delivery_date: deliveryDate,
    delivery_time: deliveryTime,
    booking_id: stock.opportunity_name ?? null,
    delivery_status: getDeliveryStatus(deliveryDate),
    qc_status: qcStatus,
    qc_record: qcRecord,
    transfer,
    car_status: deriveCarStatus(stock, bookingBranch, transfer, qcStatus, deliveryDate),
    booking_branch: bookingBranch,
  }
}

export default function HomePage() {
  const { authUser, isManager, isSuperAdmin } = useAuth()
  const [items, setItems] = useState<StockWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const locationName = authUser?.location?.name ?? ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [salesTeamMap, { data: stockData }, { data: bookingData }, { data: qcData }, { data: transferData }] =
        await Promise.all([
          buildSalesTeamMap(),
          supabase.from('matched_stock_customers').select('*'),
          supabase.from('booking').select('crm_opty_id, delivery_date, delivery_time, qc_check_status'),
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
      stock = stock.filter((s) => `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim().length > 0)
      if (!isManager && !isSuperAdmin && locationName) {
        stock = stock.filter(s => s.current_location === locationName)
      }

      const withMeta = stock.map(s =>
        buildStockMeta(s, bookingMap, qcMap, transferMap, salesTeamMap)
      )

      setItems(withMeta)
    } finally {
      setLoading(false)
    }
  }, [isManager, isSuperAdmin, locationName])

  useEffect(() => { void load() }, [load])

  // Stats
  const total = items.length
  const rejected = items.filter(i => i.car_status === 'qc_rejected').length
  const transferPending = items.filter(i =>
    i.car_status === 'transfer_needed' || i.car_status === 'transfer_assigned' || i.car_status === 'in_transit'
  ).length
  const approved = items.filter(i => i.car_status === 'qc_approved' || i.car_status === 'ready').length

  // Deliveries in next 48 hours
  const upcoming48 = items
    .filter(i => i.delivery_date && isWithin48Hours(i.delivery_date))
    .sort((a, b) => (a.delivery_date ?? '').localeCompare(b.delivery_date ?? ''))

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          {locationName && <p className="subtitle">{locationName}</p>}
        </div>
        <button
          onClick={() => { void load() }}
          className="nav-btn"
          style={{ minWidth: 36, minHeight: 36 }}
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {/* Alert strip — only if rejected */}
      {rejected > 0 && (
        <div className="alert-strip">
          <AlertTriangle size={16} />
          <span>{rejected} car{rejected > 1 ? 's' : ''} failed QC — action needed</span>
        </div>
      )}

      {/* Stat grid */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Stock</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{loading ? '—' : total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">QC Rejected</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{loading ? '—' : rejected}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Transfer Pending</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{loading ? '—' : transferPending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">QC Approved</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{loading ? '—' : approved}</div>
        </div>
      </div>

      {/* Deliveries in next 48 hours */}
      <div className="section-label">Deliveries in next 48 hours</div>

      {loading ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Loading...
        </div>
      ) : upcoming48.length === 0 ? (
        <div style={{ margin: '0 16px', padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          No deliveries in the next 48 hours
        </div>
      ) : (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {upcoming48.map(item => {
            const ds = item.delivery_status
            return (
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
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                        {customerName(item)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span className={`badge ${ds === 'today' ? 'badge-red' : 'badge-amber'}`}>
                        {ds === 'today' ? 'Today' : 'Tomorrow'}
                      </span>
                      <span className={`badge badge-${item.car_status === 'ready' ? 'green' : item.car_status === 'qc_rejected' ? 'red' : 'gray'}`}>
                        {item.car_status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                    <Clock size={12} />
                    <span>{fmtDate(item.delivery_date)}{item.delivery_time ? ', ' + fmtTime(item.delivery_time) : ''}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ height: 16 }} />
    </div>
  )
}
