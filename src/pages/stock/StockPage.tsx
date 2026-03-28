import { useEffect, useState, useCallback } from 'react'
import { Search, X, RefreshCw, ChevronRight, CalendarDays, UserCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/components/ui/Toast'
import {
  buildSalesTeamMap,
  deriveCarStatus,
  carStatusLabel,
  carStatusBadgeClass,
  customerName,
  fmtDate,
  getDeliveryStatus,
} from '@/lib/utils'
import type { MatchedStock, QCRecord, TransferTask, StockWithMeta, Role } from '@/types'

type FilterKey = 'all' | 'transfer' | 'qc_needed' | 'ready'

const FILTER_PILLS: { key: FilterKey; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'transfer',  label: 'Transfer' },
  { key: 'qc_needed', label: 'QC Needed' },
  { key: 'ready',     label: 'Ready' },
]

interface DriverEmployee {
  id: number
  first_name: string
  last_name: string | null
  role: Role
  location?: { name: string } | null
}

// ── Stock Detail Sheet ────────────────────────────────────────────────────────
function StockSheet({
  item,
  onClose,
  onSaved,
}: {
  item: StockWithMeta
  onClose: () => void
  onSaved: () => void
}) {
  const { isManager, isSuperAdmin } = useAuth()
  const { success, error: toastError } = useToast()
  const supabase = createClient()

  const [drivers, setDrivers] = useState<DriverEmployee[]>([])
  const [selectedDriver, setSelectedDriver] = useState('')
  const [assigningDriver, setAssigningDriver] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState(item.delivery_date ?? '')
  const [deliveryTime, setDeliveryTime] = useState(item.delivery_time ?? '')
  const [savingDelivery, setSavingDelivery] = useState(false)

  const canAssignDriver = (isManager || isSuperAdmin) &&
    (item.car_status === 'transfer_needed' || item.car_status === 'transfer_assigned')

  useEffect(() => {
    if (!canAssignDriver) return
    supabase
      .from('employees')
      .select('id, first_name, last_name, role:roles!inner(id, name, code, department_id, is_active), location:locations(name)')
      .eq('roles.code', 'DRIVER')
      .then(({ data }) => {
        setDrivers((data ?? []) as unknown as DriverEmployee[])
        if (item.transfer?.driver_id) {
          setSelectedDriver(String(item.transfer.driver_id))
        }
      })
  }, [canAssignDriver])

  async function assignDriver() {
    if (!selectedDriver) { toastError('Select a driver'); return }
    setAssigningDriver(true)
    try {
      const payload = {
        chassis_no: item.chassis_no,
        driver_id: parseInt(selectedDriver),
        from_location: item.current_location ?? '',
        to_location: item.booking_branch ?? '',
        status: 'assigned' as const,
        assigned_at: new Date().toISOString(),
      }

      if (item.transfer?.id) {
        const { error } = await supabase
          .from('transfer_tasks')
          .update({ driver_id: parseInt(selectedDriver), status: 'assigned', assigned_at: new Date().toISOString() })
          .eq('id', item.transfer.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('transfer_tasks').insert(payload)
        if (error) throw error
      }
      success('Driver assigned!')
      onSaved()
    } catch (err: unknown) {
      toastError('Failed: ' + (err instanceof Error ? err.message : 'error'))
    } finally {
      setAssigningDriver(false)
    }
  }

  async function saveDelivery() {
    if (!item.booking_id) { toastError('No booking found'); return }
    setSavingDelivery(true)
    const { error } = await supabase
      .from('booking')
      .update({ delivery_date: deliveryDate || null, delivery_time: deliveryTime || null })
      .eq('crm_opty_id', item.booking_id)
    setSavingDelivery(false)
    if (error) { toastError('Save failed'); return }
    success('Delivery date saved!')
    onSaved()
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />

        {/* Car header */}
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <span className="mono" style={{ color: 'var(--accent)', fontSize: 14 }}>{item.chassis_no}</span>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                {item.product_description ?? item.product_line ?? '—'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{customerName(item)}</div>
            </div>
            <button onClick={onClose} style={{ padding: 6, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span className={`badge ${carStatusBadgeClass(item.car_status)}`}>{carStatusLabel(item.car_status)}</span>
            {item.current_location && <span className="badge badge-gray">{item.current_location}</span>}
            {item.booking_branch && item.booking_branch !== item.current_location && (
              <span className="badge badge-blue">→ {item.booking_branch}</span>
            )}
          </div>
        </div>

        <div style={{ padding: '16px' }}>
          {/* Assign Driver section */}
          {canAssignDriver && (
            <div style={{ marginBottom: 18, padding: '14px', background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontWeight: 600, fontSize: 13 }}>
                <UserCheck size={15} style={{ color: 'var(--accent)' }} />
                Assign Transfer Driver
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                From: <strong>{item.current_location ?? '—'}</strong> → To: <strong>{item.booking_branch ?? '—'}</strong>
              </div>
              <select
                className="form-input"
                value={selectedDriver}
                onChange={e => setSelectedDriver(e.target.value)}
                style={{ marginBottom: 10 }}
              >
                <option value="">Select driver...</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {[d.first_name, d.last_name].filter(Boolean).join(' ')}
                    {d.location ? ` (${(d.location as { name: string }).name})` : ''}
                  </option>
                ))}
              </select>
              <button
                className="big-btn big-btn-primary"
                onClick={() => { void assignDriver() }}
                disabled={assigningDriver || !selectedDriver}
              >
                {assigningDriver ? <RefreshCw size={15} className="spin" /> : <UserCheck size={15} />}
                Assign Driver
              </button>
            </div>
          )}

          {/* Set Delivery Date section */}
          {(isManager || isSuperAdmin) && (
            <div style={{ marginBottom: 18, padding: '14px', background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontWeight: 600, fontSize: 13 }}>
                <CalendarDays size={15} style={{ color: 'var(--accent)' }} />
                Set Delivery Date
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  type="date"
                  className="form-input"
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  style={{ flex: 1 }}
                />
                <input
                  type="time"
                  className="form-input"
                  value={deliveryTime}
                  onChange={e => setDeliveryTime(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              <button
                className="big-btn big-btn-primary"
                onClick={() => { void saveDelivery() }}
                disabled={savingDelivery}
              >
                {savingDelivery ? <RefreshCw size={15} className="spin" /> : <CalendarDays size={15} />}
                Save Delivery Date
              </button>
            </div>
          )}

          {/* Vehicle info rows */}
          <div className="section-label" style={{ padding: '0 0 8px' }}>Vehicle Info</div>
          <div className="card" style={{ marginBottom: 16 }}>
            {[
              { label: 'Model', value: item.product_description ?? item.product_line },
              { label: 'Variant', value: item.product_vc },
              { label: 'Colour', value: item.product_description },
              { label: 'Customer Mobile', value: item.mobile_number },
              { label: 'Ageing', value: item.ageing_days != null ? `${item.ageing_days} days` : null },
              { label: 'Booking ID', value: item.booking_id ?? item.opportunity_name },
              { label: 'Delivery', value: item.delivery_date ? fmtDate(item.delivery_date) : null },
            ].map(({ label, value }) => (
              <div key={label} className="card-row">
                <span style={{ fontSize: 12, color: 'var(--muted)', flex: '0 0 120px' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{value ?? '—'}</span>
              </div>
            ))}
          </div>

          <div style={{ height: 24 }} />
        </div>
      </div>
    </>
  )
}

// ── Stock Page ────────────────────────────────────────────────────────────────
export default function StockPage() {
  const { authUser, isManager, isSuperAdmin } = useAuth()
  const [items, setItems] = useState<StockWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selected, setSelected] = useState<StockWithMeta | null>(null)
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

      const bookingMap = new Map<string, { crm_opty_id: string | null; delivery_date: string | null; delivery_time: string | null; qc_check_status: string | null }>()
      for (const b of (bookingData ?? [])) { if (b.crm_opty_id) bookingMap.set(b.crm_opty_id, b) }

      const qcMap = new Map<string, QCRecord>()
      for (const q of (qcData ?? []) as QCRecord[]) { qcMap.set(q.chassis_no, q) }

      const transferMap = new Map<string, TransferTask>()
      for (const t of (transferData ?? []) as TransferTask[]) { transferMap.set(t.chassis_no, t) }

      let stock = (stockData ?? []) as MatchedStock[]
      if (!isManager && !isSuperAdmin && locationName) {
        stock = stock.filter(s => s.current_location === locationName)
      }

      const withMeta: StockWithMeta[] = stock.map(s => {
        const booking = s.opportunity_name ? bookingMap.get(s.opportunity_name) : null
        const qcRecord = qcMap.get(s.chassis_no) ?? null
        const transfer = transferMap.get(s.chassis_no) ?? null
        const bookingBranch = s.sales_team ? (salesTeamMap.get(s.sales_team) ?? null) : null
        const deliveryDate = booking?.delivery_date ?? null
        const deliveryTime = booking?.delivery_time ?? null
        const qcStatus = qcRecord?.final_status ?? booking?.qc_check_status ?? null
        return {
          ...s,
          delivery_date: deliveryDate,
          delivery_time: deliveryTime,
          booking_id: s.opportunity_name ?? null,
          delivery_status: getDeliveryStatus(deliveryDate),
          qc_status: qcStatus,
          qc_record: qcRecord,
          transfer,
          car_status: deriveCarStatus(s, bookingBranch, transfer, qcStatus, deliveryDate),
          booking_branch: bookingBranch,
        }
      })

      setItems(withMeta)
    } finally {
      setLoading(false)
    }
  }, [isManager, isSuperAdmin, locationName])

  useEffect(() => { void load() }, [load])

  const filtered = items.filter(i => {
    // Filter pill
    if (filter === 'transfer') {
      if (!['transfer_needed', 'transfer_assigned', 'in_transit'].includes(i.car_status)) return false
    } else if (filter === 'qc_needed') {
      if (!['at_branch', 'qc_pending', 'qc_rejected'].includes(i.car_status)) return false
    } else if (filter === 'ready') {
      if (!['qc_approved', 'ready'].includes(i.car_status)) return false
    }

    // Search
    if (!search) return true
    const q = search.toLowerCase()
    return (
      i.chassis_no.toLowerCase().includes(q) ||
      (i.product_description ?? '').toLowerCase().includes(q) ||
      (i.product_line ?? '').toLowerCase().includes(q) ||
      customerName(i).toLowerCase().includes(q) ||
      (i.mobile_number ?? '').includes(q)
    )
  })

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Stock</h1>
          {!loading && <p className="subtitle">{filtered.length} vehicles</p>}
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

      {/* Search */}
      <div style={{ padding: '12px 16px 4px' }}>
        <div className="search-bar">
          <Search size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Chassis, model, customer..."
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div className="filter-row">
        {FILTER_PILLS.map(p => (
          <button
            key={p.key}
            className={`filter-pill${filter === p.key ? ' active' : ''}`}
            onClick={() => setFilter(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No vehicles found</div>
      ) : (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(item => (
            <button
              key={item.chassis_no}
              style={{ textAlign: 'left', cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, width: '100%', padding: '12px 14px' }}
              onClick={() => setSelected(item)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="mono" style={{ color: 'var(--accent)', display: 'block', marginBottom: 2 }}>
                    {item.chassis_no}
                  </span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.product_description ?? item.product_line ?? '—'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{customerName(item)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span className={`badge ${carStatusBadgeClass(item.car_status)}`}>
                    {carStatusLabel(item.car_status)}
                  </span>
                  {item.current_location && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.current_location}</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {item.ageing_days != null && (
                    <span className={`badge ${item.ageing_days > 30 ? 'badge-red' : item.ageing_days > 15 ? 'badge-amber' : 'badge-green'}`}>
                      {item.ageing_days}d
                    </span>
                  )}
                  {item.delivery_date && (
                    <span className={`badge ${item.delivery_status === 'overdue' || item.delivery_status === 'today' ? 'badge-red' : item.delivery_status === 'tomorrow' ? 'badge-amber' : 'badge-blue'}`}>
                      {fmtDate(item.delivery_date)}
                    </span>
                  )}
                </div>
                <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ height: 16 }} />

      {selected && (
        <StockSheet
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { void load(); setSelected(null) }}
        />
      )}
    </div>
  )
}
