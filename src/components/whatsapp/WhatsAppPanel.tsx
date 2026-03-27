'use client'

import { useState, useEffect } from 'react'
import { X, MessageCircle, Send } from 'lucide-react'
import { buildWhatsAppUrl, buildDriverWhatsAppMessage, customerName, fmtDate, fmtTime } from '@/lib/utils'
import type { StockWithDelivery } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'

interface Props {
  stock: StockWithDelivery
  onClose: () => void
}

const YARDS = ['Yard 1', 'Yard 2', 'Yard 3', 'Yard 4', 'Yard 5']

export default function WhatsAppPanel({ stock, onClose }: Props) {
  const [driverName, setDriverName]       = useState('')
  const [driverPhone, setDriverPhone]     = useState('')
  const [yardNo, setYardNo]               = useState(YARDS[0])
  const [deliveryLocation, setDeliveryLocation] = useState('')
  const [yards, setYards]                 = useState<string[]>(YARDS)
  const supabase = createClient()
  const { error: toastError } = useToast()

  // Load yard list from settings if available
  useEffect(() => {
    supabase.from('app_settings')
      .select('value').eq('key', 'yards').single()
      .then(({ data }) => {
        if (data?.value) setYards(data.value as string[])
      })
  }, [])

  const cust = customerName(stock)
  const message = buildDriverWhatsAppMessage({
    driverName: driverName || '[Driver Naam]',
    chassisNo: stock.chassis_no,
    model: stock.parent_product_line ?? '—',
    variant: stock.product_line ?? '',
    colour: stock.product_description ?? '',
    yardNo,
    customerName: cust,
    deliveryDate: stock.delivery_date ?? null,
    deliveryTime: stock.delivery_time ?? null,
    deliveryLocation: deliveryLocation || stock.current_location || '—',
  })

  function send() {
    if (!driverPhone.trim()) { toastError('Driver ka phone number daalo'); return }
    const url = buildWhatsAppUrl(driverPhone, message)
    window.open(url, '_blank', 'noopener')
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:left-auto md:right-6 md:bottom-6
                      md:w-[480px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl
                      border border-slate-200 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <MessageCircle size={16} className="text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">WhatsApp Driver ko bhejo</p>
            <p className="text-xs text-slate-400 font-mono">{stock.chassis_no} · {cust}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Driver details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Driver Name *
              </label>
              <input
                value={driverName}
                onChange={e => setDriverName(e.target.value)}
                placeholder="Driver ka naam"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Driver Phone *
              </label>
              <input
                value={driverPhone}
                onChange={e => setDriverPhone(e.target.value)}
                placeholder="9876543210"
                type="tel"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Yard No
              </label>
              <select
                value={yardNo}
                onChange={e => setYardNo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
              >
                {yards.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Deliver To
              </label>
              <input
                value={deliveryLocation}
                onChange={e => setDeliveryLocation(e.target.value)}
                placeholder={stock.current_location ?? 'Location'}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Delivery info summary */}
          {stock.delivery_date && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <span className="text-blue-500 text-sm">📅</span>
              <p className="text-xs text-blue-700">
                Delivery: <strong>{fmtDate(stock.delivery_date)}</strong>
                {stock.delivery_time && <> at <strong>{fmtTime(stock.delivery_time)}</strong></>}
              </p>
            </div>
          )}

          {/* Message preview */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Message Preview
            </label>
            <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-emerald-400
                            whitespace-pre-wrap leading-relaxed max-h-52 overflow-y-auto">
              {message}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600
                       border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={!driverPhone.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={14} />
            WhatsApp par bhejo
          </button>
        </div>
      </div>
    </>
  )
}
