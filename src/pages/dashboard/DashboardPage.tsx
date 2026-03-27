import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createClient } from '../../lib/supabase/client'
import { useAuth } from '../../context/auth-context'
import { fmtTime, getDeliveryStatus } from '../../lib/utils'
import {
  Car, AlertCircle, CalendarCheck, CheckSquare,
  Clock, TrendingUp, RefreshCw
} from 'lucide-react'

interface TodayRow {
  chassis_no: string
  parent_product_line: string | null
  first_name: string | null
  last_name: string | null
  mobile_number: string | null
  current_location: string | null
  delivery_date: string | null
  delivery_time: string | null
  qc_status: string | null
}

interface Stats {
  total: number
  deliveryToday: number
  deliveryThisWeek: number
  qcPending: number
  qcDone: number
  overdue: number
}

interface StockRow {
  chassis_no: string
  opportunity_name: string | null
  current_location: string | null
  parent_product_line: string | null
  first_name: string | null
  last_name: string | null
  mobile_number: string | null
}

interface BookingRow {
  crm_opty_id: string | null
  delivery_date: string | null
  delivery_time: string | null
  qc_check_status: string | null
}

interface QCRow {
  chassis_no: string
  final_status: string | null
}

interface EnrichedRow extends StockRow {
  delivery_date: string | null
  delivery_time: string | null
  delivery_status: ReturnType<typeof getDeliveryStatus>
  qc_status: string | null
}

export default function DashboardPage() {
  const { isManager, isSuperAdmin, authUser } = useAuth()
  const locationName = authUser?.location?.name ?? null
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [todayRows, setTodayRows] = useState<TodayRow[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const [{ data: stock }, { data: bookings }, { data: qcRecords }] = await Promise.all([
      supabase.from('matched_stock_customers')
        .select('chassis_no, opportunity_name, current_location, parent_product_line, first_name, last_name, mobile_number'),
      supabase.from('booking')
        .select('crm_opty_id, delivery_date, delivery_time, qc_check_status')
        .not('crm_opty_id', 'is', null),
      supabase.from('car_qc_records').select('chassis_no, final_status'),
    ])

    const stockRows = (stock ?? []) as StockRow[]
    const bookingRows = (bookings ?? []) as BookingRow[]
    const qcRows = (qcRecords ?? []) as QCRow[]

    const bookingMap = new Map(bookingRows.map((b) => [b.crm_opty_id, b]))
    const qcMap = new Map(qcRows.map((q) => [q.chassis_no, q]))

    const relevantStock = stockRows.filter((s) => {
      if (isSuperAdmin || isManager) return true
      if (locationName) return s.current_location === locationName
      return true
    })

    const enriched: EnrichedRow[] = relevantStock.map((s) => {
      const b = bookingMap.get(s.opportunity_name ?? '')
      const qc = qcMap.get(s.chassis_no)
      return {
        ...s,
        delivery_date: b?.delivery_date ?? null,
        delivery_time: b?.delivery_time ?? null,
        delivery_status: getDeliveryStatus(b?.delivery_date ?? null),
        qc_status: qc?.final_status ?? b?.qc_check_status ?? null,
      }
    })

    const todayDeliveries = enriched.filter((r) => r.delivery_date === today)

    setStats({
      total: enriched.length,
      deliveryToday: todayDeliveries.length,
      deliveryThisWeek: enriched.filter((r) => ['today', 'tomorrow', 'this_week'].includes(r.delivery_status ?? '')).length,
      qcPending: enriched.filter((r) => !r.qc_status || r.qc_status === 'pending').length,
      qcDone: enriched.filter((r) => r.qc_status === 'approved' || r.qc_status === 'completed').length,
      overdue: enriched.filter((r) => r.delivery_status === 'overdue').length,
    })

    setTodayRows(todayDeliveries.map((r) => ({
      chassis_no: r.chassis_no,
      parent_product_line: r.parent_product_line,
      first_name: r.first_name,
      last_name: r.last_name,
      mobile_number: r.mobile_number,
      current_location: r.current_location,
      delivery_date: r.delivery_date,
      delivery_time: r.delivery_time,
      qc_status: r.qc_status,
    })))

    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [locationName])

  const statCards = stats ? [
    { label: 'Total Stock', value: stats.total, color: 'text-blue-600', bg: 'bg-blue-50', icon: Car, href: '/stock' },
    { label: 'Deliver Today', value: stats.deliveryToday, color: 'text-red-600', bg: 'bg-red-50', icon: CalendarCheck, href: '/delivery' },
    { label: 'This Week', value: stats.deliveryThisWeek, color: 'text-amber-600', bg: 'bg-amber-50', icon: TrendingUp, href: '/delivery' },
    { label: 'QC Pending', value: stats.qcPending, color: 'text-purple-600', bg: 'bg-purple-50', icon: Clock, href: '/qc' },
    { label: 'QC Approved', value: stats.qcDone, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckSquare, href: '/qc' },
    { label: 'Overdue', value: stats.overdue, color: 'text-rose-600', bg: 'bg-rose-50', icon: AlertCircle, href: '/delivery' },
  ] : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {isSuperAdmin || isManager ? 'All locations overview' : `${locationName ?? 'Your location'}`}
          </p>
        </div>
        <button
          onClick={() => { void load() }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                     text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {stats && stats.overdue > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-red-500 shrink-0" />
          <p className="text-sm font-medium text-red-700">
            <span className="font-bold">{stats.overdue} gaadi</span> ki delivery date nikal gayi — abhi tak deliver nahi hui!
          </p>
          <Link to="/delivery" className="ml-auto text-xs font-semibold text-red-600 hover:text-red-800 whitespace-nowrap">
            Dekho →
          </Link>
        </div>
      )}

      {stats && stats.deliveryToday > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <CalendarCheck size={16} className="text-amber-500 shrink-0" />
          <p className="text-sm font-medium text-amber-700">
            <span className="font-bold">{stats.deliveryToday} gaadi</span> aaj deliver honi hai
            {todayRows.some((r: TodayRow) => !r.qc_status || r.qc_status === 'pending') && (
              <span className="text-amber-600"> — kuch QC abhi bhi pending hai</span>
            )}
          </p>
          <Link to="/delivery" className="ml-auto text-xs font-semibold text-amber-600 hover:text-amber-800 whitespace-nowrap">
            Dekho →
          </Link>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="stat-card animate-pulse">
              <div className="h-8 w-12 bg-slate-100 rounded mb-2" />
              <div className="h-3 w-20 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon
            return (
              <Link key={card.label} to={card.href}
                className="stat-card hover:shadow-md transition-shadow group">
                <div className={`inline-flex p-2 rounded-lg ${card.bg} mb-3`}>
                  <Icon size={18} className={card.color} />
                </div>
                <div className={`text-2xl font-bold font-mono ${card.color}`}>{card.value}</div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">{card.label}</div>
              </Link>
            )
          })}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
          <CalendarCheck size={16} className="text-red-500" />
          <h2 className="text-sm font-bold text-slate-800">Aaj ki Deliveries</h2>
          <span className="badge bg-red-100 text-red-700 ml-auto">{todayRows.length}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
        ) : todayRows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <CalendarCheck size={32} className="mx-auto mb-2 text-slate-200" />
            <p className="text-sm">Aaj koi delivery schedule nahi</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Chassis No</th>
                  <th>Model</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Location</th>
                  <th>Time</th>
                  <th>QC</th>
                </tr>
              </thead>
              <tbody>
                {todayRows.map((row) => (
                  <tr
                    key={row.chassis_no}
                    className="cursor-pointer"
                    onClick={() => navigate(`/stock/${encodeURIComponent(row.chassis_no)}`)}
                  >
                    <td className="font-mono text-xs text-brand-600 font-semibold">{row.chassis_no}</td>
                    <td className="font-medium">{row.parent_product_line ?? '—'}</td>
                    <td>{[row.first_name, row.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td className="text-slate-500">{row.mobile_number ?? '—'}</td>
                    <td className="text-slate-500">{row.current_location ?? '—'}</td>
                    <td className="text-slate-500">{row.delivery_time ? fmtTime(row.delivery_time) : '—'}</td>
                    <td>
                      <span className={`badge ${
                        row.qc_status === 'completed' || row.qc_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        row.qc_status === 'failed' || row.qc_status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {row.qc_status ?? 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
