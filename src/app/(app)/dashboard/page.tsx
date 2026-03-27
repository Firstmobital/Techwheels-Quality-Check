'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import Header from '@/components/layout/Header'
import { fmtDate, getDeliveryStatus } from '@/lib/utils'
import {
  Car, AlertCircle, CalendarCheck, CheckSquare,
  Clock, TrendingUp, RefreshCw
} from 'lucide-react'
import Link from 'next/link'

interface Stats {
  totalStock: number
  deliveryToday: number
  deliveryThisWeek: number
  qcPending: number
  qcApproved: number
  overdueDelivery: number
}

interface TodayDelivery {
  chassis_no: string
  parent_product_line: string | null
  first_name: string | null
  last_name: string | null
  mobile_number: string | null
  delivery_date: string | null
  delivery_time: string | null
  current_location: string | null
  qc_check_status: string | null
}

export default function DashboardPage() {
  const { isManager } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [todayItems, setTodayItems] = useState<TodayDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    // Fetch matched stock joined with booking for delivery dates
    const { data: stock } = await supabase
      .from('matched_stock_customers')
      .select('chassis_no, opportunity_name, current_location')

    // Fetch bookings with delivery dates
    const { data: bookings } = await supabase
      .from('booking')
      .select('crm_opty_id, delivery_date, delivery_time, qc_check_status')
      .not('crm_opty_id', 'is', null)

    // Fetch QC records
    const { data: qcRecords } = await supabase
      .from('car_qc_records')
      .select('chassis_no, final_status')

    const bookingMap = new Map(bookings?.map(b => [b.crm_opty_id, b]) ?? [])
    const qcMap = new Map(qcRecords?.map(q => [q.chassis_no, q]) ?? [])

    const enriched = (stock ?? []).map(s => {
      const booking = bookingMap.get(s.opportunity_name ?? '')
      const qc = qcMap.get(s.chassis_no)
      return {
        ...s,
        delivery_date: booking?.delivery_date ?? null,
        delivery_time: booking?.delivery_time ?? null,
        qc_check_status: booking?.qc_check_status ?? null,
        qc_final_status: qc?.final_status ?? null,
      }
    })

    const deliveryToday = enriched.filter(r => r.delivery_date === today).length
    const deliveryThisWeek = enriched.filter(r => {
      const s = getDeliveryStatus(r.delivery_date)
      return s === 'today' || s === 'tomorrow' || s === 'this_week'
    }).length
    const overdueDelivery = enriched.filter(r => getDeliveryStatus(r.delivery_date) === 'overdue').length
    const qcApproved = enriched.filter(r => r.qc_final_status === 'approved').length
    const qcPending = enriched.filter(r => !r.qc_final_status).length

    setStats({
      totalStock: enriched.length,
      deliveryToday,
      deliveryThisWeek,
      qcPending,
      qcApproved,
      overdueDelivery,
    })

    // Today's deliveries - fetch with full info
    const { data: todayStock } = await supabase
      .from('matched_stock_customers')
      .select('chassis_no, parent_product_line, first_name, last_name, mobile_number, current_location, opportunity_name')

    const todayDeliveries: TodayDelivery[] = (todayStock ?? [])
      .map(s => {
        const b = bookingMap.get(s.opportunity_name ?? '')
        return { ...s, delivery_date: b?.delivery_date ?? null, delivery_time: b?.delivery_time ?? null, qc_check_status: b?.qc_check_status ?? null }
      })
      .filter(s => s.delivery_date === today)

    setTodayItems(todayDeliveries)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const statCards = stats ? [
    { label: 'Total Stock', value: stats.totalStock, icon: Car, color: 'text-blue-600', bg: 'bg-blue-50', href: '/stock' },
    { label: 'Deliver Today', value: stats.deliveryToday, icon: CalendarCheck, color: 'text-red-600', bg: 'bg-red-50', href: '/delivery' },
    { label: 'This Week', value: stats.deliveryThisWeek, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50', href: '/delivery' },
    { label: 'QC Pending', value: stats.qcPending, icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50', href: '/qc' },
    { label: 'QC Approved', value: stats.qcApproved, icon: CheckSquare, color: 'text-emerald-600', bg: 'bg-emerald-50', href: '/qc' },
    { label: 'Overdue', value: stats.overdueDelivery, icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50', href: '/delivery' },
  ] : []

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Overview of all locations"
        actions={
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                                            text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <div className="space-y-6">

        {/* Today alert */}
        {stats && stats.deliveryToday > 0 && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle size={18} className="text-red-500 shrink-0" />
            <p className="text-sm font-medium text-red-700">
              <span className="font-bold">{stats.deliveryToday} gaadi</span> aaj deliver honi hai
              {todayItems.some(t => !t.qc_check_status || t.qc_check_status === 'pending') && (
                <span className="text-red-500"> — kuch QC abhi bhi pending hai!</span>
              )}
            </p>
            <Link href="/delivery" className="ml-auto text-xs font-semibold text-red-600 hover:text-red-800 whitespace-nowrap">
              Dekho →
            </Link>
          </div>
        )}

        {/* Stat cards */}
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
            {statCards.map(card => {
              const Icon = card.icon
              return (
                <Link key={card.label} href={card.href} className="stat-card hover:shadow-md transition-shadow">
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

        {/* Today's deliveries */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
            <CalendarCheck size={16} className="text-red-500" />
            <h2 className="text-sm font-bold text-slate-800">Aaj ki Deliveries</h2>
            <span className="badge bg-red-100 text-red-700 ml-auto">{todayItems.length}</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
          ) : todayItems.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <CalendarCheck size={32} className="mx-auto mb-2 text-slate-200" />
              <p className="text-sm">Aaj koi delivery nahi hai</p>
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
                    <th>QC Status</th>
                  </tr>
                </thead>
                <tbody>
                  {todayItems.map(item => (
                    <tr key={item.chassis_no}>
                      <td className="font-mono text-xs text-brand-600 font-semibold">{item.chassis_no}</td>
                      <td className="font-medium">{item.parent_product_line ?? '—'}</td>
                      <td>{[item.first_name, item.last_name].filter(Boolean).join(' ') || '—'}</td>
                      <td className="text-slate-500">{item.mobile_number ?? '—'}</td>
                      <td className="text-slate-500">{item.current_location ?? '—'}</td>
                      <td className="text-slate-500">{item.delivery_time ?? '—'}</td>
                      <td>
                        <span className={`badge ${
                          item.qc_check_status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                          item.qc_check_status === 'failed'    ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {item.qc_check_status ?? 'Pending'}
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
    </>
  )
}
