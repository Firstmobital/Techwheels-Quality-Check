import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Car, User, Calendar, ClipboardCheck,
  CheckCircle2, XCircle, Clock, MessageCircle, CalendarPlus,
  MapPin, Hash, Palette, Layers, RefreshCw
} from 'lucide-react'
import type { QCRecord, StockWithDelivery } from '../../types'
import { createClient } from '../../lib/supabase/client'
import { useAuth } from '../../context/auth-context'
import WhatsAppPanel from '../../components/whatsapp/WhatsAppPanel'
import DeliveryModal from '../../components/delivery/DeliveryModal'
import { ageingClass, customerName, fmtDate, fmtTime, getDeliveryStatus } from '../../lib/utils'

interface BookingRow {
  crm_opty_id: string | null
  delivery_date: string | null
  delivery_time: string | null
  qc_check_status: string | null
  id: string | null
  customer_name: string | null
  customer_phone: string | null
}

interface QCRow {
  final_status: string | null
  remarks: string | null
  checklist: unknown
  photo_urls: unknown
  checked_at: string | null
  inspector: { first_name?: string | null; last_name?: string | null } | null
}

export default function StockDetailPage() {
  const { chassis } = useParams<{ chassis: string }>()
  const navigate = useNavigate()
  const { authUser, isManager, isSuperAdmin } = useAuth()

  const [stock, setStock] = useState<StockWithDelivery | null>(null)
  const [qc, setQC] = useState<QCRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [showWA, setShowWA] = useState(false)
  const [showDel, setShowDel] = useState(false)

  const supabase = createClient()

  async function load() {
    setLoading(true)

    const rawChassis = chassis ?? ''
    const decodedChassis = decodeURIComponent(rawChassis)

    const [{ data: stockRow }, { data: bookings }, { data: qcRow }] = await Promise.all([
      supabase
        .from('matched_stock_customers')
        .select('*')
        .not('first_name', 'is', null)
        .neq('first_name', '')
        .eq('chassis_no', decodedChassis)
        .single(),
      supabase
        .from('booking')
        .select('crm_opty_id, delivery_date, delivery_time, qc_check_status, id, customer_name, customer_phone')
        .not('crm_opty_id', 'is', null),
      supabase
        .from('car_qc_records')
        .select('*, inspector:employees(first_name, last_name)')
        .eq('chassis_no', decodedChassis)
        .order('checked_at', { ascending: false })
        .limit(1)
        .single(),
    ])

    if (!stockRow || ((stockRow.first_name ?? '').trim().length === 0)) {
      setLoading(false)
      return
    }

    const bookingRows = (bookings ?? []) as BookingRow[]
    const bookingMap = new Map(bookingRows.map((b) => [b.crm_opty_id, b]))
    const booking = bookingMap.get(stockRow.opportunity_name ?? '')

    const latestQc = (qcRow ?? null) as QCRow | null

    const enriched: StockWithDelivery = {
      ...(stockRow as StockWithDelivery),
      delivery_date: booking?.delivery_date ?? null,
      delivery_time: booking?.delivery_time ?? null,
      booking_id: booking?.id ?? null,
      delivery_status: getDeliveryStatus(booking?.delivery_date ?? null),
      qc_status: latestQc?.final_status ?? booking?.qc_check_status ?? null,
    }

    setStock(enriched)
    setQC((qcRow as QCRecord | null) ?? null)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [chassis])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading car details...</p>
        </div>
      </div>
    )
  }

  if (!stock) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Car size={40} className="mx-auto mb-3 text-slate-200" />
          <p className="text-slate-500 font-medium">Car not found</p>
          <button onClick={() => navigate(-1)} className="mt-3 text-sm text-brand-600 hover:underline">
            Go back
          </button>
        </div>
      </div>
    )
  }

  const cust = customerName(stock)
  const qcApproved = qc?.final_status === 'approved'
  const qcRejected = qc?.final_status === 'rejected'
  const canEditQC = isManager || isSuperAdmin || authUser?.role?.code === 'TECHNICIAN'

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">{stock.chassis_no}</h1>
          <p className="text-sm text-slate-500">{`${stock.parent_product_line ?? ''} ${stock.product_line ?? ''} · ${cust}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { void load() }}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={13} />
            Back
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowWA(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
        >
          <MessageCircle size={15} />
          WhatsApp Driver
        </button>
        {(isManager || isSuperAdmin) && (
          <button
            onClick={() => setShowDel(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white transition-colors"
          >
            <CalendarPlus size={15} />
            {stock.delivery_date ? 'Edit Delivery Date' : 'Set Delivery Date'}
          </button>
        )}
        {canEditQC && (
          <button
            onClick={() => navigate(`/qc?chassis=${encodeURIComponent(stock.chassis_no)}`)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors"
          >
            <ClipboardCheck size={15} />
            {qc ? 'Re-do QC' : 'Start QC'}
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Car size={16} className="text-brand-600" />
            <h2 className="text-sm font-bold text-slate-800">Vehicle Details</h2>
          </div>
          <div className="space-y-3">
            {[
              { icon: Hash, label: 'Chassis No', value: stock.chassis_no, mono: true },
              { icon: Car, label: 'Model', value: stock.parent_product_line },
              { icon: Layers, label: 'Variant', value: stock.product_line },
              { icon: Palette, label: 'Colour', value: stock.product_description },
              { icon: Hash, label: 'VC Code', value: stock.product_vc, mono: true },
              { icon: MapPin, label: 'Current Location', value: stock.current_location },
              { icon: Calendar, label: 'TM Invoice Date', value: fmtDate(stock.tm_invoice_date) },
              { icon: Calendar, label: 'Mfg Date', value: fmtDate(stock.manufacturing_date) },
            ].map(({ icon: Icon, label, value, mono }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon size={14} className="text-slate-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className={`text-sm font-medium text-slate-800 ${mono ? 'font-mono' : ''}`}>
                    {value ?? '—'}
                  </p>
                </div>
              </div>
            ))}

            <div className="flex items-start gap-3">
              <Clock size={14} className="text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Ageing</p>
                {stock.ageing_days != null ? (
                  <span className={`badge mt-0.5 ${ageingClass(stock.ageing_days)}`}>
                    {stock.ageing_days} days
                  </span>
                ) : (
                  <p className="text-sm text-slate-400">—</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <User size={16} className="text-brand-600" />
              <h2 className="text-sm font-bold text-slate-800">Customer / Booking</h2>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Customer Name', value: cust },
                { label: 'Phone', value: stock.mobile_number, mono: true },
                { label: 'Booking ID', value: stock.opportunity_name, mono: true },
                { label: 'Booking Date', value: fmtDate(stock.stage_3_date) },
                { label: 'Sales Team', value: stock.sales_team },
                { label: 'Stock Rank', value: stock.stock_rank?.toString() },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between gap-4">
                  <p className="text-xs text-slate-400 shrink-0">{label}</p>
                  <p className={`text-xs font-medium text-slate-800 text-right ${mono ? 'font-mono' : ''}`}>
                    {value ?? '—'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className={`card p-5 ${stock.delivery_date ? '' : 'border-dashed'}`}>
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={16} className={stock.delivery_date ? 'text-brand-600' : 'text-slate-300'} />
              <h2 className="text-sm font-bold text-slate-800">Delivery Schedule</h2>
              {stock.delivery_status === 'today' && (
                <span className="badge bg-red-100 text-red-700 ml-auto">Today!</span>
              )}
              {stock.delivery_status === 'overdue' && (
                <span className="badge bg-red-100 text-red-700 ml-auto">⚠ Overdue</span>
              )}
            </div>
            {stock.delivery_date ? (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <p className="text-xs text-slate-400">Date</p>
                  <p className="text-sm font-semibold text-slate-800">{fmtDate(stock.delivery_date)}</p>
                </div>
                <div className="flex justify-between">
                  <p className="text-xs text-slate-400">Time</p>
                  <p className="text-sm font-medium text-slate-700">
                    {stock.delivery_time ? fmtTime(stock.delivery_time) : '—'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-sm text-slate-400">Delivery date set nahi hai</p>
                {(isManager || isSuperAdmin) && (
                  <button
                    onClick={() => setShowDel(true)}
                    className="mt-2 text-xs text-brand-600 hover:underline font-medium"
                  >
                    Set karo →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`card overflow-hidden ${qcApproved ? 'border-emerald-200' : qcRejected ? 'border-red-200' : 'border-dashed'}`}>
        <div className={`flex items-center gap-3 px-5 py-3.5 border-b ${
          qcApproved ? 'bg-emerald-50 border-emerald-100' :
          qcRejected ? 'bg-red-50 border-red-100' :
          'bg-slate-50 border-slate-100'
        }`}>
          {qcApproved ? (
            <CheckCircle2 size={16} className="text-emerald-600" />
          ) : qcRejected ? (
            <XCircle size={16} className="text-red-500" />
          ) : (
            <ClipboardCheck size={16} className="text-slate-400" />
          )}
          <h2 className="text-sm font-bold text-slate-800">
            Quality Check — {qcApproved ? 'APPROVED ✓' : qcRejected ? 'REJECTED ✗' : 'Not done yet'}
          </h2>
          {qc && (
            <span className="text-xs text-slate-400 ml-auto">
              {fmtDate(qc.checked_at)}
              {(qc.inspector as { first_name?: string | null } | undefined)?.first_name && (
                <>
                  {' '}
                  · {(qc.inspector as { first_name?: string | null }).first_name}{' '}
                  {(qc.inspector as { last_name?: string | null }).last_name ?? ''}
                </>
              )}
            </span>
          )}
        </div>

        {qc ? (
          <div className="p-5 space-y-5">
            {qc.remarks && (
              <div className="bg-slate-50 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-400 mb-1">Remarks</p>
                <p className="text-sm text-slate-700">{qc.remarks}</p>
              </div>
            )}

            {Array.isArray(qc.checklist) && qc.checklist.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Checklist ({qc.checklist.filter((i: any) => i.passed).length}/{qc.checklist.length} passed)
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {(qc.checklist as any[]).map((item: any) => (
                    <div
                      key={item.key}
                      className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                        item.passed ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">{item.passed ? '✓' : '✗'}</span>
                      <div>
                        <p className="font-medium">{item.label}</p>
                        {item.note && <p className="opacity-70 mt-0.5">{item.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(qc.photo_urls) && qc.photo_urls.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Photos ({qc.photo_urls.length})
                </p>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {(qc.photo_urls as any[]).map((photo: any, i: number) => (
                    <a
                      key={i}
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100"
                    >
                      <img
                        src={photo.url}
                        alt={photo.label}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 py-1 px-1.5">
                        <p className="text-white text-xs truncate text-center">{photo.label}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center">
            <ClipboardCheck size={32} className="mx-auto mb-2 text-slate-200" />
            <p className="text-sm text-slate-400">QC abhi tak nahi hui</p>
            {canEditQC && (
              <button
                onClick={() => navigate(`/qc?chassis=${encodeURIComponent(stock.chassis_no)}`)}
                className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors mx-auto"
              >
                <ClipboardCheck size={14} />
                Start QC
              </button>
            )}
          </div>
        )}
      </div>

      {showWA && <WhatsAppPanel stock={stock} onClose={() => setShowWA(false)} />}
      {showDel && (
        <DeliveryModal
          stock={stock}
          onClose={() => setShowDel(false)}
          onSaved={() => {
            setShowDel(false)
            void load()
          }}
        />
      )}
    </div>
  )
}
