import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Search, X, UserCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/components/ui/Toast'
import {
  buildSalesTeamMap,
  deriveCarStatus,
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
  Role,
} from '@/types'

interface DriverEmployee {
  id: number
  first_name: string
  last_name: string | null
  role: Role
  location: { name: string } | null
}

// ── Assign driver sheet ───────────────────────────────────────────────────────
function AssignDriverSheet({
  item,
  onClose,
  onSaved,
}: {
  item: StockWithMeta
  onClose: () => void
  onSaved: () => void
}) {
  const { success, error: toastError } = useToast()
  const supabase = createClient()
  const [drivers, setDrivers] = useState<DriverEmployee[]>([])
  const [selectedDriver, setSelectedDriver] = useState(
    item.transfer?.driver_id ? String(item.transfer.driver_id) : '',
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('employees')
      .select(
        'id, first_name, last_name, role:roles!employees_role_id_fkey(id, name, code, department_id, is_active), location:locations!employees_location_id_fkey(name)',
      )
      .eq('roles.code', 'DRIVER')
      .then(({ data }) => {
        setDrivers((data ?? []) as unknown as DriverEmployee[])
      })
  }, [])

  async function assign() {
    if (!selectedDriver) {
      toastError('Please select a driver')
      return
    }
    setSaving(true)
    try {
      const driverId = parseInt(selectedDriver)

      if (item.transfer?.id) {
        const { error } = await supabase
          .from('transfer_tasks')
          .update({
            driver_id: driverId,
            status: 'assigned',
            assigned_at: new Date().toISOString(),
          })
          .eq('id', item.transfer.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('transfer_tasks').insert({
          chassis_no: item.chassis_no,
          driver_id: driverId,
          from_location: item.current_location ?? '',
          to_location: item.delivery_branch ?? '',
          status: 'assigned',
          assigned_at: new Date().toISOString(),
        })
        if (error) throw error
      }

      success('Driver assigned!')
      onSaved()
      onClose()
    } catch (err: unknown) {
      toastError(
        'Failed: ' + (err instanceof Error ? err.message : 'Unknown error'),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />

        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <span className="mono" style={{ color: 'var(--accent)', fontSize: 14 }}>
                {item.chassis_no}
              </span>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                {item.product_description ?? item.product_line ?? '—'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {customerName(item)}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ padding: 6, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: '16px' }}>
          {/* From → To */}
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Transfer Route
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>From</div>
                <span className="badge badge-gray">
                  {item.current_location ?? '—'}
                </span>
              </div>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 18, color: 'var(--muted)' }}>→</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>To</div>
                <span className="badge badge-blue">
                  {item.delivery_branch ?? '—'}
                </span>
              </div>
            </div>
            {item.delivery_date && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                Delivery: {fmtDate(item.delivery_date)}
              </div>
            )}
          </div>

          {/* Current transfer status */}
          {item.transfer && item.transfer.status !== 'arrived' && (
            <div
              style={{
                padding: '10px 12px',
                background: '#FEF3C7',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--amber)',
                marginBottom: 14,
              }}
            >
              Current status:{' '}
              <strong>
                {item.transfer.status === 'assigned'
                  ? 'Driver assigned, awaiting pickup'
                  : 'In transit — driver has picked up'}
              </strong>
            </div>
          )}

          {/* Driver select */}
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--muted)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {item.transfer ? 'Reassign Driver' : 'Assign Driver'}
            </label>
            <select
              className="form-input"
              value={selectedDriver}
              onChange={e => setSelectedDriver(e.target.value)}
            >
              <option value="">Select a driver...</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>
                  {[d.first_name, d.last_name].filter(Boolean).join(' ')}
                  {d.location ? ` · ${d.location.name}` : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            className="big-btn big-btn-primary"
            onClick={() => { void assign() }}
            disabled={saving || !selectedDriver}
          >
            {saving ? (
              <RefreshCw size={15} className="spin" />
            ) : (
              <UserCheck size={15} />
            )}
            {saving ? 'Assigning...' : 'Assign Driver'}
          </button>

          <div style={{ height: 24 }} />
        </div>
      </div>
    </>
  )
}

// ── Transfers Page ────────────────────────────────────────────────────────────
export default function TransfersPage() {
  const { authUser, isManager, isSuperAdmin } = useAuth()
  const [items, setItems] = useState<StockWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<StockWithMeta | null>(null)
  const supabase = createClient()

  const locationName = authUser?.location?.name ?? ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
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

      const withMeta: StockWithMeta[] = stock
        .map(s => {
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
        // only show cars that need transfer (not yet at delivery branch)
        .filter(s =>
          ['transfer_needed', 'transfer_assigned', 'in_transit'].includes(
            s.car_status,
          ),
        )
        // sort by delivery date ascending, nulls last
        .sort((a, b) => {
          if (!a.delivery_date && !b.delivery_date) return 0
          if (!a.delivery_date) return 1
          if (!b.delivery_date) return -1
          return a.delivery_date.localeCompare(b.delivery_date)
        })

      setItems(withMeta)
    } finally {
      setLoading(false)
    }
  }, [isManager, isSuperAdmin, locationName])

  useEffect(() => { void load() }, [load])

  const filtered = items.filter(i => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      i.chassis_no.toLowerCase().includes(q) ||
      (i.product_description ?? '').toLowerCase().includes(q) ||
      (i.product_line ?? '').toLowerCase().includes(q) ||
      customerName(i).toLowerCase().includes(q) ||
      (i.current_location ?? '').toLowerCase().includes(q) ||
      (i.delivery_branch ?? '').toLowerCase().includes(q)
    )
  })

  const needsAssign = filtered.filter(i => i.car_status === 'transfer_needed').length
  const inTransit   = filtered.filter(i =>
    i.car_status === 'transfer_assigned' || i.car_status === 'in_transit',
  ).length

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Assign Transfers</h1>
          {!loading && (
            <p className="subtitle">
              {needsAssign} need driver · {inTransit} in transit
            </p>
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

      <div style={{ padding: '12px 16px 8px' }}>
        <div className="search-bar">
          <Search size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Chassis, model, location..."
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ margin: '16px', padding: '32px 20px', textAlign: 'center', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {search ? 'No cars match your search' : 'All cars are at their delivery branch'}
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(item => {
            const needsDriver = item.car_status === 'transfer_needed'
            const isAssigned  = item.car_status === 'transfer_assigned'
            const isMoving    = item.car_status === 'in_transit'

            return (
              <div
                key={item.chassis_no}
                className="card"
                style={{
                  borderLeft: needsDriver
                    ? '3px solid var(--amber)'
                    : isMoving
                    ? '3px solid var(--accent)'
                    : undefined,
                }}
              >
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="mono" style={{ color: 'var(--accent)', display: 'block', marginBottom: 2 }}>
                        {item.chassis_no}
                      </span>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.product_description ?? item.product_line ?? '—'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
                        {customerName(item)}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {needsDriver && <span className="badge badge-amber">No driver</span>}
                      {isAssigned  && <span className="badge badge-amber">Driver assigned</span>}
                      {isMoving    && <span className="badge badge-blue">In transit</span>}
                    </div>
                  </div>

                  {/* From → To */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <span className="badge badge-gray">
                      {item.current_location ?? '—'}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>→</span>
                    <span className="badge badge-blue">
                      {item.delivery_branch ?? '—'}
                    </span>
                    {item.delivery_date && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                        {fmtDate(item.delivery_date)}
                      </span>
                    )}
                  </div>

                  {/* Assign / reassign button */}
                  <button
                    className="big-btn big-btn-primary"
                    style={{ marginTop: 10, minHeight: 40, fontSize: 13 }}
                    onClick={() => setSelected(item)}
                  >
                    <UserCheck size={14} />
                    {needsDriver ? 'Assign Driver' : 'Reassign Driver'}
                  </button>
                </div>
              </div>
            )
          })}
          <div style={{ height: 8 }} />
        </div>
      )}

      <div style={{ height: 16 }} />

      {selected && (
        <AssignDriverSheet
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null)
            void load()
          }}
        />
      )}
    </div>
  )
}