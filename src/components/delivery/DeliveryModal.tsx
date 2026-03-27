'use client'

import { useState, useEffect } from 'react'
import { X, CalendarCheck, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtDate, fmtTime, customerName } from '@/lib/utils'
import type { StockWithDelivery } from '@/types'

interface Props {
  stock: StockWithDelivery
  onClose: () => void
  onSaved: () => void
}

export default function DeliveryModal({ stock, onClose, onSaved }: Props) {
  const [date, setDate]         = useState(stock.delivery_date ?? '')
  const [time, setTime]         = useState(stock.delivery_time?.slice(0, 5) ?? '')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const supabase = createClient()

  const cust = customerName(stock)

  async function save() {
    if (!date) { setError('Delivery date zaroori hai'); return }
    if (!stock.opportunity_name) {
      setError('Is gaadi ka koi booking record nahi mila (opportunity_name missing)')
      return
    }

    setSaving(true)
    setError(null)

    const { error: err } = await supabase
      .from('booking')
      .update({
        delivery_date: date,
        delivery_time: time || null,
        updated_at: new Date().toISOString(),
      })
      .eq('crm_opty_id', stock.opportunity_name)

    setSaving(false)

    if (err) {
      setError('Save nahi hua: ' + err.message)
      return
    }

    onSaved()
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
        <div className="w-full md:max-w-md bg-white rounded-t-2xl md:rounded-2xl shadow-2xl border border-slate-200">

          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
              <CalendarCheck size={16} className="text-brand-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">Delivery Date Set Karo</p>
              <p className="text-xs text-slate-400 font-mono truncate">
                {stock.chassis_no} · {cust}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Car summary */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { k: 'Model',   v: stock.parent_product_line },
                { k: 'Variant', v: stock.product_line },
                { k: 'Colour',  v: stock.product_description },
              ].map(({ k, v }) => (
                <div key={k} className="bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-400 mb-0.5">{k}</p>
                  <p className="text-xs font-semibold text-slate-700 truncate">{v ?? '—'}</p>
                </div>
              ))}
            </div>

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Delivery Date *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Delivery Time
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Current value reminder */}
            {stock.delivery_date && (
              <p className="text-xs text-slate-400">
                Current: {fmtDate(stock.delivery_date)}
                {stock.delivery_time ? ` at ${fmtTime(stock.delivery_time)}` : ''}
              </p>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600
                         border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !date}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                         text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white
                         transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarCheck size={14} />}
              {saving ? 'Saving...' : 'Save Karo'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
