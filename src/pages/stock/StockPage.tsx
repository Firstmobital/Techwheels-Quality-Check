import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, RefreshCw, MessageCircle, CalendarPlus, ClipboardCheck, MapPin } from 'lucide-react'
import type { StockWithDelivery } from '../../types'
import { createClient } from '../../lib/supabase/client'
import { useAuth } from '../../context/auth-context'
import { ageingClass, customerName, fmtDate, getDeliveryStatus, truncate } from '../../lib/utils'
import WhatsAppPanel from '../../components/whatsapp/WhatsAppPanel'
import DeliveryModal from '../../components/delivery/DeliveryModal'

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

export default function StockPage() {
  const { isManager, authUser } = useAuth()
  const locationName = authUser?.location?.name ?? null
  const navigate = useNavigate()

  const [allData, setAllData] = useState<StockWithDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [locFilter, setLocFilter] = useState<string>('ALL')
  const [locations, setLocations] = useState<string[]>([])
  const [waStock, setWaStock] = useState<StockWithDelivery | null>(null)
  const [delStock, setDelStock] = useState<StockWithDelivery | null>(null)

  const supabase = createClient()

  async function load() {
    setLoading(true)

    const [{ data: stock }, { data: bookings }, { data: qcRecords }] = await Promise.all([
      supabase.from('matched_stock_customers').select('*'),
      supabase.from('booking').select('crm_opty_id, delivery_date, delivery_time, qc_check_status, id').not('crm_opty_id', 'is', null),
      supabase.from('car_qc_records').select('chassis_no, final_status'),
    ])

    const bookingRows = (bookings ?? []) as BookingRow[]
    const qcRows = (qcRecords ?? []) as QCRow[]

    const bookingMap = new Map(bookingRows.map((b) => [b.crm_opty_id, b]))
    const qcMap = new Map(qcRows.map((q) => [q.chassis_no, q]))

    const enriched: StockWithDelivery[] = ((stock ?? []) as StockWithDelivery[]).map((s) => {
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
    let data = allData
    if (locFilter !== 'ALL') {
      data = data.filter((r: StockWithDelivery) => r.current_location === locFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter((r: StockWithDelivery) =>
        [r.chassis_no, r.first_name, r.last_name, r.parent_product_line,
         r.product_line, r.product_vc, r.opportunity_name, r.mobile_number]
          .some((v) => v && String(v).toLowerCase().includes(q))
      )
    }
    return data
  }, [allData, locFilter, search])

  const qcStatusBadge = (status: string | null) => {
    if (status === 'approved' || status === 'completed') {
      return <span className="badge bg-emerald-100 text-emerald-700">✓ Approved</span>
    }
    if (status === 'rejected' || status === 'failed') {
      return <span className="badge bg-red-100 text-red-700">✗ Rejected</span>
    }
    return <span className="badge bg-amber-100 text-amber-700">Pending</span>
  }

  const deliveryBadge = (row: StockWithDelivery) => {
    if (!row.delivery_date) return <span className="text-slate-300 text-xs">—</span>

    const cls =
      row.delivery_status === 'overdue' ? 'bg-red-100 text-red-700' :
      row.delivery_status === 'today' ? 'bg-red-100 text-red-700' :
      row.delivery_status === 'tomorrow' ? 'bg-amber-100 text-amber-700' :
      'bg-blue-50 text-blue-700'

    return <span className={`badge ${cls}`}>{fmtDate(row.delivery_date)}</span>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Match Stock</h1>
          <p className="text-sm text-slate-500">
            {filtered.length} vehicles{locFilter !== 'ALL' ? ` · ${locFilter}` : ''}
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
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

        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 ml-auto min-w-[260px] focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent transition-shadow">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Chassis, customer, model..."
            className="text-sm outline-none flex-1 bg-transparent placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Chassis No</th>
                <th>Model</th>
                <th>Variant</th>
                <th>Colour</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Location</th>
                <th>Ageing</th>
                <th>Delivery</th>
                <th>QC</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j}><div className="h-3 bg-slate-100 rounded w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-400">
                    <Search size={28} className="mx-auto mb-2 text-slate-200" />
                    <p className="text-sm">Koi gaadi nahi mili</p>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.chassis_no}
                    onClick={() => navigate(`/stock/${encodeURIComponent(row.chassis_no)}`)}
                    className="cursor-pointer"
                  >
                    <td>
                      <span className="font-mono text-xs font-semibold text-brand-600">
                        {row.chassis_no}
                      </span>
                    </td>
                    <td className="font-medium text-slate-800">
                      {row.parent_product_line ?? '—'}
                    </td>
                    <td className="text-slate-500">{truncate(row.product_line, 20)}</td>
                    <td className="text-slate-500">{row.product_description ?? '—'}</td>
                    <td className="font-medium">{customerName(row)}</td>
                    <td className="text-slate-500 font-mono text-xs">{row.mobile_number ?? '—'}</td>
                    <td>
                      {row.current_location && (
                        <span className="badge bg-slate-100 text-slate-600">
                          {row.current_location}
                        </span>
                      )}
                    </td>
                    <td>
                      {row.ageing_days != null && (
                        <span className={`badge ${ageingClass(row.ageing_days)}`}>
                          {row.ageing_days}d
                        </span>
                      )}
                    </td>
                    <td>{deliveryBadge(row)}</td>
                    <td>{qcStatusBadge(row.qc_status)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setWaStock(row)}
                          title="WhatsApp"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                        >
                          <MessageCircle size={14} />
                        </button>
                        <button
                          onClick={() => setDelStock(row)}
                          title="Set Delivery"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          <CalendarPlus size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/qc?chassis=${encodeURIComponent(row.chassis_no)}`)
                          }}
                          title="QC Form"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                        >
                          <ClipboardCheck size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {waStock && (
        <WhatsAppPanel stock={waStock} onClose={() => setWaStock(null)} />
      )}
      {delStock && (
        <DeliveryModal stock={delStock} onClose={() => setDelStock(null)} onSaved={load} />
      )}
    </div>
  )
}
