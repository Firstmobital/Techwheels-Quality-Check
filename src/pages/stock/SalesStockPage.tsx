import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, History, AlertCircle, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import {
  buildSalesTeamMap,
  getSalesTeamLocation,
  deriveCarStatus,
  getDeliveryStatus,
  carStatusLabel,
  carStatusBadgeClass,
  customerName,
  fmtDate,
} from '@/lib/utils'
import type { BookingRow, CarStatus, DeliveryDateStatus, MatchedStock } from '@/types'

type FilterKey = 'all' | 'today' | 'week' | 'overdue'

interface SalesCar extends MatchedStock {
  delivery_date: string | null
  qc_status: string | null
  car_status: CarStatus
  delivery_status: DeliveryDateStatus
  delivery_branch: string | null
}

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'सब' },
  { key: 'today', label: 'आज' },
  { key: 'week', label: 'इस हफ्ते' },
  { key: 'overdue', label: 'देरी' },
]

export default function SalesStockPage() {
  const navigate = useNavigate()
  const supabase = createClient()
  const { authUser } = useAuth()

  const [items, setItems] = useState<SalesCar[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')

  const firstName = authUser?.employee?.first_name ?? ''
  const lastName = authUser?.employee?.last_name ?? ''
  const salesName = [firstName, lastName].filter(Boolean).join(' ').trim()

  const load = useCallback(async () => {
    if (!salesName) {
      setItems([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [
        salesTeamMap,
        { data: stockData },
        { data: bookingData },
      ] = await Promise.all([
        buildSalesTeamMap(),
        supabase
          .from('matched_stock_customers')
          .select('*')
          .eq('sales_team', salesName),
        supabase
          .from('booking')
          .select('id, crm_opty_id, delivery_date, delivery_time, qc_check_status'),
      ])

      const bookingMap = new Map<string, BookingRow>()
      for (const b of (bookingData ?? []) as BookingRow[]) {
        if (b.crm_opty_id) bookingMap.set(b.crm_opty_id, b)
      }

      const rows = (stockData ?? []) as MatchedStock[]

      const mapped = rows.map(row => {
        const booking = row.opportunity_name ? bookingMap.get(row.opportunity_name) : null
        const deliveryDate = booking?.delivery_date ?? null
        const qcStatus = booking?.qc_check_status ?? null
        const deliveryBranch = getSalesTeamLocation(salesTeamMap, row.sales_team)

        return {
          ...row,
          delivery_date: deliveryDate,
          qc_status: qcStatus,
          delivery_status: getDeliveryStatus(deliveryDate),
          car_status: deriveCarStatus(
            row.current_location,
            deliveryBranch,
            null,
            qcStatus,
            deliveryDate,
          ),
          delivery_branch: deliveryBranch,
        } satisfies SalesCar
      })

      mapped.sort((a, b) => {
        if (!a.delivery_date && !b.delivery_date) return 0
        if (!a.delivery_date) return 1
        if (!b.delivery_date) return -1
        return a.delivery_date.localeCompare(b.delivery_date)
      })

      setItems(mapped)
    } finally {
      setLoading(false)
    }
  }, [salesName, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    return items.filter(item => {
      if (filter === 'all') return true
      if (filter === 'today') return item.delivery_status === 'today'
      if (filter === 'week') return item.delivery_status === 'this_week'
      return item.delivery_status === 'overdue'
    })
  }, [filter, items])

  const todayDelivery = items.filter(i => i.delivery_status === 'today').length
  const qcPending = items.filter(i => i.car_status.includes('qc')).length

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>मेरी गाड़ियां</h1>
          {!loading && <p className="subtitle">{filtered.length} गाड़ियां</p>}
        </div>
        <button
          className="nav-btn"
          title="रिफ्रेश"
          style={{ minWidth: 36, minHeight: 36 }}
          onClick={() => { void load() }}
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">आज डिलीवरी</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{loading ? '—' : todayDelivery}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">बाकी QC</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{loading ? '—' : qcPending}</div>
        </div>
      </div>

      <div className="filter-row" style={{ paddingTop: 2 }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`filter-pill${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          लोड हो रहा है...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          आपको कोई गाड़ी नहीं मिली
        </div>
      ) : (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(item => (
            <div
              key={item.chassis_no}
              className="card"
              style={{ padding: '12px 14px' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{customerName(item)}</div>
                  <span className="mono" style={{ color: 'var(--accent)', fontSize: 12 }}>{item.chassis_no}</span>
                  <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 3 }}>
                    {item.product_description ?? item.product_line ?? '—'}
                  </div>
                  {item.delivery_date && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      डिलीवरी: {fmtDate(item.delivery_date)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span className={`badge ${carStatusBadgeClass(item.car_status)}`}>
                    {carStatusLabel(item.car_status)}
                  </span>
                  <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="filter-pill"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => navigate(`/history?chassis=${encodeURIComponent(item.chassis_no)}`)}
                >
                  <History size={12} />
                  यात्रा देखें
                </button>
                <button
                  type="button"
                  className="filter-pill"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => navigate('/concerns')}
                >
                  <AlertCircle size={12} />
                  चिंता दर्ज करें
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 16 }} />
    </div>
  )
}
