import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import {
  CalendarCheck, AlertCircle, RefreshCw, MessageCircle,
  CalendarPlus, ClipboardCheck, MapPin, Calendar
} from 'lucide-react'
import type { StockWithDelivery } from '../../types'
import { createClient } from '../../lib/supabase/client'
import { useAuth } from '../../context/auth-context'
import {
  fmtDate, fmtTime, customerName, getDeliveryStatus,
  deliveryStatusLabel, ageingClass
} from '../../lib/utils'
import WhatsAppPanel from '../../components/whatsapp/WhatsAppPanel'
import DeliveryModal from '../../components/delivery/DeliveryModal'

type TabId = 'today' | 'upcoming' | 'unscheduled'

interface BookingRow {
  crm_opty_id: string | null
  delivery_date: string | null
  delivery_time: string | null
  qc_check_status: string | null
  id: string | null
}

interface QCRow {
  chassis_no: string
  final_status: string | null
}

export default function DeliveryPage() {
  const { isManager, authUser } = useAuth()
  const locationName = authUser?.location?.name ?? null

  const [allData, setAllData] = useState<StockWithDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const [locFilter, setLocFilter] = useState<string>('ALL')
  const [locations, setLocations] = useState<string[]>([])
  const [tab, setTab] = useState<TabId>('today')
  const [waStock, setWaStock] = useState<StockWithDelivery | null>(null)
  const [delStock, setDelStock] = useState<StockWithDelivery | null>(null)

  const supabase = createClient()

  async function load() {
    setLoading(true)

    const [{ data: stock }, { data: bookings }, { data: qcRecords }] = await Promise.all([
      supabase
        .from('matched_stock_customers')
        .select('*')
        .not('first_name', 'is', null)
        .neq('first_name', ''),
      supabase
        .from('booking')
        .select('crm_opty_id, delivery_date, delivery_time, qc_check_status, id')
        .not('crm_opty_id', 'is', null),
      supabase.from('car_qc_records').select('chassis_no, final_status'),
    ])

    const bookingRows = (bookings ?? []) as BookingRow[]
    const qcRows = (qcRecords ?? []) as QCRow[]

    const bookingMap = new Map(bookingRows.map((b) => [b.crm_opty_id, b]))
    const qcMap = new Map(qcRows.map((q) => [q.chassis_no, q]))

    const enriched: StockWithDelivery[] = ((stock ?? []) as StockWithDelivery[])
      .filter((s) => (s.first_name ?? '').trim().length > 0)
      .map((s) => {
        const booking = bookingMap.get(s.opportunity_name ?? '')
        const qc = qcMap.get(s.chassis_no)
        const delivery_date = booking?.delivery_date ?? null
        return {
          ...s,
          delivery_date,
          delivery_time: booking?.delivery_time ?? null,
          booking_id: booking?.id ?? null,
          delivery_status: getDeliveryStatus(delivery_date),
          qc_status: qc?.final_status ?? booking?.qc_check_status ?? null,
        }
      })

    const locs = Array.from(new Set(enriched.map((r: StockWithDelivery) => r.current_location).filter(Boolean))) as string[]
    setLocations(locs.sort())

    setAllData(enriched)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!isManager && locationName && locFilter === 'ALL') {
      setLocFilter(locationName)
    }
  }, [isManager, locationName, locFilter])

  const filtered = useMemo(() => {
    if (locFilter === 'ALL') return allData
    return allData.filter((r: StockWithDelivery) => r.current_location === locFilter)
  }, [allData, locFilter])

  const todayRows = filtered.filter((r: StockWithDelivery) => r.delivery_status === 'today')
  const overdueRows = filtered.filter((r: StockWithDelivery) => r.delivery_status === 'overdue')
  const upcomingRows = filtered
    .filter((r: StockWithDelivery) => r.delivery_date && r.delivery_status !== 'today' && r.delivery_status !== 'overdue')
    .sort((a: StockWithDelivery, b: StockWithDelivery) => (a.delivery_date ?? '').localeCompare(b.delivery_date ?? ''))
  const unscheduledRows = filtered.filter((r: StockWithDelivery) => !r.delivery_date)

  const tabs: { id: TabId; label: string; count: number; color: string }[] = [
    { id: 'today', label: 'Aaj', count: todayRows.length + overdueRows.length, color: 'text-red-600' },
    { id: 'upcoming', label: 'Upcoming', count: upcomingRows.length, color: 'text-brand-600' },
    { id: 'unscheduled', label: 'Unscheduled', count: unscheduledRows.length, color: 'text-slate-500' },
  ]

  const deliveryStatusBadge = (row: StockWithDelivery) => {
    const cls =
      row.delivery_status === 'overdue' ? 'bg-red-100 text-red-700' :
      row.delivery_status === 'today' ? 'bg-red-100 text-red-700' :
      row.delivery_status === 'tomorrow' ? 'bg-amber-100 text-amber-700' :
      'bg-blue-50 text-blue-700'

    return (
      <span className={`badge ${cls}`}>
        {row.delivery_status === 'overdue' ? '⚠ Overdue' : deliveryStatusLabel(row.delivery_status)}
      </span>
    )
  }

  const qcBadge = (status: string | null) => {
    if (status === 'approved' || status === 'completed') {
      return <span className="badge bg-emerald-100 text-emerald-700">✓ QC Done</span>
    }
    if (status === 'rejected' || status === 'failed') {
      return <span className="badge bg-red-100 text-red-700">✗ QC Failed</span>
    }
    return <span className="badge bg-amber-100 text-amber-700">QC Pending</span>
  }

  const ActionButtons = ({ row }: { row: StockWithDelivery }) => (
    <div className="flex items-center gap-1">
      <button
        onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setWaStock(row) }}
        title="WhatsApp"
        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
      >
        <MessageCircle size={14} />
      </button>
      <button
        onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setDelStock(row) }}
        title={row.delivery_date ? 'Edit Delivery Date' : 'Set Delivery Date'}
        className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
      >
        <CalendarPlus size={14} />
      </button>
      <button
        title="QC Form"
        className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
      >
        <ClipboardCheck size={14} />
      </button>
    </div>
  )

  const ScheduledTable = ({ rows }: { rows: StockWithDelivery[] }) => (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Delivery Date</th>
              <th>Time</th>
              <th>Chassis No</th>
              <th>Model</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Location</th>
              <th>Status</th>
              <th>QC</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-slate-400">
                  <Calendar size={28} className="mx-auto mb-2 text-slate-200" />
                  <p className="text-sm">Koi delivery nahi</p>
                </td>
              </tr>
            ) : rows.map((row: StockWithDelivery) => (
              <tr key={row.chassis_no}>
                <td className="font-semibold text-slate-800">{fmtDate(row.delivery_date)}</td>
                <td className="text-slate-500">{row.delivery_time ? fmtTime(row.delivery_time) : '—'}</td>
                <td>
                  <span className="font-mono text-xs font-semibold text-brand-600">{row.chassis_no}</span>
                </td>
                <td className="font-medium">{row.parent_product_line ?? '—'}</td>
                <td>{customerName(row)}</td>
                <td className="text-slate-500 font-mono text-xs">{row.mobile_number ?? '—'}</td>
                <td>
                  <span className="badge bg-slate-100 text-slate-600">{row.current_location ?? '—'}</span>
                </td>
                <td>{deliveryStatusBadge(row)}</td>
                <td>{qcBadge(row.qc_status)}</td>
                <td><ActionButtons row={row} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Delivery Schedule</h1>
          <p className="text-sm text-slate-500">
            {filtered.filter((r: StockWithDelivery) => r.delivery_date).length} scheduled · {unscheduledRows.length} unscheduled
          </p>
        </div>
        <button
          onClick={() => { void load() }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {!loading && overdueRows.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700">
            <strong>{overdueRows.length} gaadi</strong> ki delivery date nikal gayi — abhi tak deliver nahi hui!
          </p>
        </div>
      )}

      {!loading && todayRows.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <CalendarCheck size={16} className="text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700">
            <strong>{todayRows.length} gaadi</strong> aaj deliver honi hai
            {todayRows.some((r: StockWithDelivery) => !r.qc_status || r.qc_status === 'pending') && (
              <span className="text-amber-600"> · kuch QC abhi bhi pending hai</span>
            )}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <MapPin size={14} className="text-slate-400" />
        {isManager && (
          <button
            onClick={() => setLocFilter('ALL')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              locFilter === 'ALL'
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All
          </button>
        )}
        {locations.map((loc: string) => (
          <button
            key={loc}
            onClick={() => setLocFilter(loc)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              locFilter === loc
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {loc}
          </button>
        ))}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            <span className={`badge text-xs ${tab === t.id ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-10 text-center text-slate-400 text-sm animate-pulse">
          Data load ho raha hai...
        </div>
      ) : tab === 'today' ? (
        <div className="space-y-4">
          {overdueRows.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">⚠ Overdue ({overdueRows.length})</h3>
              <ScheduledTable rows={overdueRows} />
            </div>
          )}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Aaj ki Deliveries ({todayRows.length})</h3>
            <ScheduledTable rows={todayRows} />
          </div>
        </div>
      ) : tab === 'upcoming' ? (
        <ScheduledTable rows={upcomingRows} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Chassis No</th>
                  <th>Model</th>
                  <th>Variant</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Location</th>
                  <th>Ageing</th>
                  <th>Set Delivery</th>
                </tr>
              </thead>
              <tbody>
                {unscheduledRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-400">
                      <CalendarCheck size={28} className="mx-auto mb-2 text-slate-200" />
                      <p className="text-sm">Sab gaadiyaan schedule ho gayi ✓</p>
                    </td>
                  </tr>
                ) : unscheduledRows.map((row: StockWithDelivery) => (
                  <tr key={row.chassis_no}>
                    <td>
                      <span className="font-mono text-xs font-semibold text-brand-600">{row.chassis_no}</span>
                    </td>
                    <td className="font-medium">{row.parent_product_line ?? '—'}</td>
                    <td className="text-slate-500">{row.product_line ?? '—'}</td>
                    <td>{customerName(row)}</td>
                    <td className="text-slate-500 font-mono text-xs">{row.mobile_number ?? '—'}</td>
                    <td>
                      <span className="badge bg-slate-100 text-slate-600">{row.current_location ?? '—'}</span>
                    </td>
                    <td>
                      {row.ageing_days != null && (
                        <span className={`badge ${ageingClass(row.ageing_days)}`}>{row.ageing_days}d</span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => setDelStock(row)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
                      >
                        <CalendarPlus size={12} />
                        Set Date
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {waStock && <WhatsAppPanel stock={waStock} onClose={() => setWaStock(null)} />}
      {delStock && <DeliveryModal stock={delStock} onClose={() => setDelStock(null)} onSaved={load} />}
    </div>
  )
}
