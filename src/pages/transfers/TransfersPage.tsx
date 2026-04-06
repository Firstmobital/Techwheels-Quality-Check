import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search, X, UserCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { useBranch } from '@/context/branch-context'
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
  const navigate = useNavigate()
  const { success, error: toastError } = useToast()
  const supabase = createClient()
  const [drivers, setDrivers] = useState<DriverEmployee[]>([])
  const [selectedDriver, setSelectedDriver] = useState(
    item.transfer?.driver_id ? String(item.transfer.driver_id) : '',
  )
  const [saving, setSaving] = useState(false)

  // look up assigned driver name
  const assignedDriver = drivers.find(d => d.id === item.transfer?.driver_id)
  const assignedDriverName = assignedDriver
    ? [assignedDriver.first_name, assignedDriver.last_name].filter(Boolean).join(' ')
    : null

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
          .update({ driver_id: driverId, status: 'assigned', assigned_at: new Date().toISOString() })
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
      toastError('Failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
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
              <span
                className="mono"
                style={{ color: 'var(--accent)', fontSize: 14, cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => navigate(`/history?chassis=${encodeURIComponent(item.chassis_no)}`)}
              >
                {item.chassis_no}
              </span>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                {item.product_description ?? item.product_line ?? '—'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{item.sales_team ?? '—'}</div>
            </div>
            <button onClick={onClose} style={{ padding: 6, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: '16px' }}>
          {/* Route */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Transfer route
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>From</div>
                <span className="badge badge-gray">{item.current_location ?? '—'}</span>
              </div>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 18, color: 'var(--muted)' }}>→</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>To</div>
                <span className="badge badge-blue">{item.delivery_branch ?? '—'}</span>
              </div>
            </div>
            {item.delivery_date && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                Delivery: {fmtDate(item.delivery_date)}
              </div>
            )}
          </div>

          {item.transfer && item.transfer.status !== 'arrived' && (
            <div style={{ padding: '10px 12px', background: '#FEF3C7', borderRadius: 8, fontSize: 12, color: 'var(--amber)', marginBottom: 14 }}>
              Current status:{' '}
              <strong>
                {item.transfer.status === 'assigned'
                  ? 'Driver assigned, awaiting pickup'
                  : 'In transit — driver has picked up'}
              </strong>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {item.transfer ? 'Reassign driver' : 'Assign driver'}
            </label>
            <select className="form-input" value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}>
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
            {saving ? <RefreshCw size={15} className="spin" /> : <UserCheck size={15} />}
            {saving ? 'Assigning...' : 'Assign Driver'}
          </button>

          <div style={{ height: 24 }} />
        </div>
      </div>
    </>
  )
}

// ── Delivery vehicle card ─────────────────────────────────────────────────────
function DeliveryCard({
  item,
  driverMap,
  onAssign,
}: {
  item: StockWithMeta
  driverMap: Map<number, string>
  onAssign: (item: StockWithMeta) => void
}) {
  const navigate = useNavigate()
  const needsDriver = item.car_status === 'transfer_needed'
  const isAssigned  = item.car_status === 'transfer_assigned'
  const isMoving    = item.car_status === 'in_transit'
  const transferType = item.transfer?.task_type

  const assignedDriverName = item.transfer?.driver_id
    ? (driverMap.get(item.transfer.driver_id) ?? null)
    : null

  return (
    <div
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
            <span
              className="mono"
              style={{ color: 'var(--accent)', display: 'block', marginBottom: 2, cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => navigate(`/history?chassis=${encodeURIComponent(item.chassis_no)}`)}
            >
              {item.chassis_no}
            </span>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.product_description ?? item.product_line ?? '—'}
            </div>
            {/* Sales team instead of customer name */}
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
              {item.sales_team ?? '—'}
            </div>
            {/* Driver tag — only when assigned */}
            {assignedDriverName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Driver</span>
                <span className="badge badge-blue" style={{ fontSize: 10 }}>{assignedDriverName}</span>
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0 }}>
            {transferType === 'stock_transfer' && <span className="badge badge-amber">स्टॉक ट्रांसफर</span>}
            {transferType === 'yard_transfer' && <span className="badge badge-blue">यार्ड ट्रांसफर</span>}
            {needsDriver && <span className="badge badge-amber">No driver</span>}
            {isAssigned  && <span className="badge badge-amber">Assigned</span>}
            {isMoving    && <span className="badge badge-blue">In transit</span>}
          </div>
        </div>

        {/* From → To + delivery date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <span className="badge badge-gray">{item.current_location ?? '—'}</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>→</span>
          <span className="badge badge-blue">{item.delivery_branch ?? '—'}</span>
          {item.delivery_date && (
            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
              {fmtDate(item.delivery_date)}
            </span>
          )}
        </div>

        <button
          className="big-btn big-btn-primary"
          style={{ marginTop: 10, minHeight: 40, fontSize: 13 }}
          onClick={() => onAssign(item)}
        >
          <UserCheck size={14} />
          {needsDriver ? 'Assign Driver' : 'Reassign Driver'}
        </button>
      </div>
    </div>
  )
}

// ── Placeholder card for future data ─────────────────────────────────────────
function PlaceholderCard({ label }: { label: string }) {
  return (
    <div
      className="card"
      style={{ padding: '14px', opacity: 0.6 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="mono" style={{ color: 'var(--accent)', display: 'block', marginBottom: 2 }}>
            MH12AB1234
          </span>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {label} Vehicle
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
            Sales team name
          </div>
        </div>
        <span className="badge badge-gray">Pending</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <span className="badge badge-gray">From location</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>→</span>
        <span className="badge badge-blue">To location</span>
      </div>
    </div>
  )
}

// ── Top-level tab types ───────────────────────────────────────────────────────
type MainTab = 'delivery' | 'testdrive' | 'stock'
type StockSubTab = 'incity' | 'outcity'

// ── Transfers Page ────────────────────────────────────────────────────────────
export default function TransfersPage() {
  const { authUser, isManager, isSuperAdmin } = useAuth()
  const { selectedBranch } = useBranch()
  const [items, setItems] = useState<StockWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<StockWithMeta | null>(null)
  const [mainTab, setMainTab] = useState<MainTab>('delivery')
  const [stockSubTab, setStockSubTab] = useState<StockSubTab>('incity')
  const [driverMap, setDriverMap] = useState<Map<number, string>>(new Map())
  const [drivers, setDrivers] = useState<Array<{ id: number; name: string }>>([])
  const [showStockTransferForm, setShowStockTransferForm] = useState(false)
  const [newChassisNo, setNewChassisNo] = useState('')
  const [newFromLocation, setNewFromLocation] = useState('')
  const [newToLocation, setNewToLocation] = useState('अजमेर रोड')
  const [newDriverId, setNewDriverId] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [submittingStockTransfer, setSubmittingStockTransfer] = useState(false)
  const supabase = createClient()
  const { success, error: toastError } = useToast()

  const locationName = authUser?.location?.name ?? ''
  const yardList = ['अजमेर रोड', 'जगतपुरा', 'हवा सड़क']

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [
        salesTeamMap,
        { data: stockData },
        { data: bookingData },
        { data: qcData },
        { data: transferData },
        { data: driverData },
      ] = await Promise.all([
        buildSalesTeamMap(),
        supabase.from('matched_stock_customers').select('*'),
        supabase.from('booking').select('id, crm_opty_id, delivery_date, delivery_time, qc_check_status'),
        supabase.from('car_qc_records').select('*'),
        supabase
          .from('transfer_tasks')
          .select('id, chassis_no, task_type, from_dealer, driver_id, from_location, to_location, status, assigned_at, picked_up_at, arrived_at, notes'),
        supabase.from('employees').select('id, first_name, last_name, role:roles!inner(code)').eq('roles.code', 'DRIVER'),
      ])

      // build driver name map
      const dMap = new Map<number, string>()
      for (const d of (driverData ?? []) as Array<{ id: number; first_name: string; last_name: string | null }>) {
        dMap.set(d.id, [d.first_name, d.last_name].filter(Boolean).join(' '))
      }
      setDriverMap(dMap)
      setDrivers(
        ((driverData ?? []) as Array<{ id: number; first_name: string; last_name: string | null }>).map(d => ({
          id: d.id,
          name: [d.first_name, d.last_name].filter(Boolean).join(' '),
        })),
      )

      const bookingMap = new Map<string, BookingRow>()
      for (const b of (bookingData ?? []) as BookingRow[]) {
        if (b.crm_opty_id) bookingMap.set(b.crm_opty_id, b)
      }

      const qcMap = new Map<string, QCRecord>()
      for (const q of (qcData ?? []) as QCRecord[]) { qcMap.set(q.chassis_no, q) }

      const transferMap = new Map<string, TransferTask>()
      for (const t of (transferData ?? []) as TransferTask[]) { transferMap.set(t.chassis_no, t) }

      let stock = (stockData ?? []) as MatchedStock[]
      stock = stock.filter(s => `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim().length > 0)
      if (!isManager && !isSuperAdmin && locationName) {
        stock = stock.filter(s => s.current_location === locationName)
      }

      const withMeta: StockWithMeta[] = stock
        .map(s => {
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
            car_status: deriveCarStatus(s.current_location, deliveryBranch, transfer, qcStatus, deliveryDate),
            delivery_branch: deliveryBranch,
          } satisfies StockWithMeta
        })
        .filter(s => ['transfer_needed', 'transfer_assigned', 'in_transit'].includes(s.car_status))
        .filter(s => !selectedBranch || s.delivery_branch === selectedBranch)
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
  }, [isManager, isSuperAdmin, locationName, selectedBranch])

  useEffect(() => { void load() }, [load])

  const submitStockTransfer = async () => {
    const chassis = newChassisNo.trim().toUpperCase()
    const fromLocation = newFromLocation.trim()
    const driverId = parseInt(newDriverId)

    if (!chassis) {
      toastError('चेसिस नंबर जरूरी है')
      return
    }
    if (!fromLocation) {
      toastError('कहाँ से (डीलर/लोकेशन) जरूरी है')
      return
    }
    if (!newToLocation) {
      toastError('कहाँ जाएगी चुनें')
      return
    }
    if (!newDriverId || Number.isNaN(driverId)) {
      toastError('ड्राइवर चुनें')
      return
    }
    if (!authUser?.employee?.id) {
      toastError('यूजर जानकारी नहीं मिली')
      return
    }

    setSubmittingStockTransfer(true)
    try {
      const now = new Date().toISOString()

      const { error: transferError } = await supabase.from('transfer_tasks').insert({
        chassis_no: chassis,
        driver_id: driverId,
        from_location: fromLocation,
        to_location: newToLocation,
        status: 'assigned',
        task_type: 'stock_transfer',
        from_dealer: fromLocation,
        notes: newNotes.trim() || null,
        assigned_at: now,
      })
      if (transferError) throw transferError

      const { error: movementError } = await supabase.from('chassis_movements').insert({
        event_type: 'transfer_assigned',
        chassis_no: chassis,
        from_location: fromLocation,
        to_location: newToLocation,
        performed_by: authUser.employee.id,
        notes: newNotes.trim() || null,
        event_at: now,
      })
      if (movementError) throw movementError

      success('स्टॉक ट्रांसफर असाइन हो गया')
      setShowStockTransferForm(false)
      setNewChassisNo('')
      setNewFromLocation('')
      setNewToLocation('अजमेर रोड')
      setNewDriverId('')
      setNewNotes('')
      void load()
    } catch (err: unknown) {
      toastError('सेव नहीं हुआ: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSubmittingStockTransfer(false)
    }
  }

  const filtered = items.filter(i => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      i.chassis_no.toLowerCase().includes(q) ||
      (i.product_description ?? '').toLowerCase().includes(q) ||
      (i.product_line ?? '').toLowerCase().includes(q) ||
      (i.sales_team ?? '').toLowerCase().includes(q) ||
      (i.current_location ?? '').toLowerCase().includes(q) ||
      (i.delivery_branch ?? '').toLowerCase().includes(q)
    )
  })

  const needsAssign = filtered.filter(i => i.car_status === 'transfer_needed').length
  const inTransit   = filtered.filter(i => i.car_status === 'transfer_assigned' || i.car_status === 'in_transit').length

  const JAIPUR_LOCS = new Set(['Jagatpura', 'Ajmer Road', 'Hawa Sadak'])

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Transfers</h1>
          {!loading && mainTab === 'delivery' && (
            <p className="subtitle">{needsAssign} need driver · {inTransit} in transit</p>
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

      {/* Main tabs */}
      <div style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        {([
          { key: 'delivery', label: 'Delivery Vehicles' },
          { key: 'testdrive', label: 'Test Drive' },
          { key: 'stock', label: 'Stock Transfer' },
        ] as { key: MainTab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            style={{
              flex: 1,
              padding: '10px 4px',
              fontSize: 11,
              fontWeight: 600,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: mainTab === t.key ? 'var(--accent)' : 'var(--muted)',
              borderBottom: mainTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Stock Transfer sub-tabs */}
      {mainTab === 'stock' && (
        <div style={{ display: 'flex', background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '0 16px' }}>
          {([
            { key: 'incity', label: 'In City' },
            { key: 'outcity', label: 'Out of City' },
          ] as { key: StockSubTab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setStockSubTab(t.key)}
              style={{
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: stockSubTab === t.key ? 'var(--text)' : 'var(--muted)',
                borderBottom: stockSubTab === t.key ? '2px solid var(--text)' : '2px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Delivery vehicles content */}
      {mainTab === 'delivery' && (
        <>
          {(isManager || isSuperAdmin) && (
            <div style={{ padding: '12px 16px 0' }}>
              <div className="task-card" style={{ margin: 0 }}>
                <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>स्टॉक ट्रांसफर असाइन करें</div>
                </div>

                <div style={{ padding: 12 }}>
                  <button
                    className="filter-pill"
                    onClick={() => setShowStockTransferForm(v => !v)}
                    type="button"
                    disabled={submittingStockTransfer}
                  >
                    + नया स्टॉक ट्रांसफर
                  </button>

                  {showStockTransferForm && (
                    <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                      <div>
                        <label className="section-label" style={{ padding: 0, marginBottom: 4 }}>Chassis Number</label>
                        <input
                          className="form-input"
                          value={newChassisNo}
                          onChange={e => setNewChassisNo(e.target.value)}
                          placeholder="जैसे: MA1ABCD123"
                        />
                      </div>

                      <div>
                        <label className="section-label" style={{ padding: 0, marginBottom: 4 }}>कहाँ से (डीलर/लोकेशन)</label>
                        <input
                          className="form-input"
                          value={newFromLocation}
                          onChange={e => setNewFromLocation(e.target.value)}
                          placeholder="डीलर/लोकेशन नाम"
                        />
                      </div>

                      <div>
                        <label className="section-label" style={{ padding: 0, marginBottom: 4 }}>कहाँ जाएगी</label>
                        <select
                          className="form-input"
                          value={newToLocation}
                          onChange={e => setNewToLocation(e.target.value)}
                        >
                          {yardList.map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="section-label" style={{ padding: 0, marginBottom: 4 }}>ड्राइवर चुनें</label>
                        <select
                          className="form-input"
                          value={newDriverId}
                          onChange={e => setNewDriverId(e.target.value)}
                        >
                          <option value="">ड्राइवर चुनें</option>
                          {drivers.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="section-label" style={{ padding: 0, marginBottom: 4 }}>Notes</label>
                        <textarea
                          className="form-input"
                          rows={3}
                          value={newNotes}
                          onChange={e => setNewNotes(e.target.value)}
                          placeholder="वैकल्पिक नोट्स"
                        />
                      </div>

                      <button
                        className="big-btn big-btn-primary"
                        onClick={() => { void submitStockTransfer() }}
                        disabled={submittingStockTransfer}
                        type="button"
                      >
                        {submittingStockTransfer ? <RefreshCw size={15} className="spin" /> : <UserCheck size={15} />}
                        {submittingStockTransfer ? 'सेव हो रहा है...' : 'असाइन करें'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ padding: '12px 16px 8px' }}>
            <div className="search-bar">
              <Search size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Chassis, model, location..."
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ margin: '16px', padding: '32px 20px', textAlign: 'center', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {search ? 'No cars match your search' : 'All cars are at their delivery branch'}
              </div>
            </div>
          ) : (
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(item => (
                <DeliveryCard
                  key={item.chassis_no}
                  item={item}
                  driverMap={driverMap}
                  onAssign={setSelected}
                />
              ))}
              <div style={{ height: 8 }} />
            </div>
          )}
        </>
      )}

      {/* Test Drive content — placeholder */}
      {mainTab === 'testdrive' && (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ padding: '10px 12px', background: '#FEF3C7', borderRadius: 8, fontSize: 12, color: 'var(--amber)', marginBottom: 4 }}>
            Test drive data will be connected to this section in a future update.
          </div>
          {[1, 2, 3].map(i => (
            <PlaceholderCard key={i} label="Test Drive" />
          ))}
        </div>
      )}

      {/* Stock Transfer content — placeholder with in/out subtabs */}
      {mainTab === 'stock' && (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ padding: '10px 12px', background: '#FEF3C7', borderRadius: 8, fontSize: 12, color: 'var(--amber)', marginBottom: 4 }}>
            {stockSubTab === 'incity'
              ? 'In-city stock transfer data (Jagatpura, Ajmer Road, Hawa Sadak) will be connected here.'
              : 'Out-of-city stock transfer data will be connected here.'}
          </div>
          {[1, 2].map(i => (
            <PlaceholderCard key={i} label={stockSubTab === 'incity' ? 'In City Stock' : 'Out of City Stock'} />
          ))}
        </div>
      )}

      <div style={{ height: 16 }} />

      {selected && (
        <AssignDriverSheet
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); void load() }}
        />
      )}
    </div>
  )
}