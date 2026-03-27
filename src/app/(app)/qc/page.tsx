'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/Toast'
import Header from '@/components/layout/Header'
import { customerName, fmtDate, getDeliveryStatus } from '@/lib/utils'
import {
  Search, ClipboardCheck, CheckCircle2, XCircle,
  Camera, Loader2, ChevronDown, ChevronUp, MapPin, RefreshCw
} from 'lucide-react'
import type { StockWithDelivery, QCChecklistItem, QCPhoto } from '@/types'

const CHECKLIST_ITEMS = [
  { key: 'engine',        label: 'Engine'            },
  { key: 'ac',            label: 'AC / Climate'      },
  { key: 'lights_front',  label: 'Front Lights'      },
  { key: 'lights_rear',   label: 'Rear Lights'       },
  { key: 'tyres',         label: 'Tyres'             },
  { key: 'brakes',        label: 'Brakes'            },
  { key: 'body_exterior', label: 'Body / Exterior'   },
  { key: 'interior',      label: 'Interior Cleaning' },
  { key: 'fuel_level',    label: 'Fuel Level'        },
  { key: 'documents',     label: 'Documents'         },
  { key: 'horn',          label: 'Horn'              },
  { key: 'windshield',    label: 'Windshield'        },
]

const PHOTO_LABELS = ['Front', 'Rear', 'Left Side', 'Right Side', 'Interior', 'Engine Bay']

interface QCFormState {
  inspectorName: string
  checklist: Record<string, { passed: boolean; note: string }>
  photos: Record<string, { file: File; preview: string }>
  remarks: string
  decision: 'approved' | 'rejected' | null
}

function initialChecklist() {
  return Object.fromEntries(CHECKLIST_ITEMS.map(i => [i.key, { passed: false, note: '' }]))
}

export default function QCPage() {
  const { authUser, isManager, isSuperAdmin, locationName } = useAuth()
  const { success, error: toastError } = useToast()
  const searchParams       = useSearchParams()
  const preselectedChassis = searchParams.get('chassis')

  const [allData, setAllData]   = useState<StockWithDelivery[]>([])
  const [loading, setLoading]   = useState(true)
  const [locFilter, setLocFilter] = useState<string>('ALL')
  const [locations, setLocations] = useState<string[]>([])
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<StockWithDelivery | null>(null)
  const [form, setForm]         = useState<QCFormState>({
    inspectorName: '', checklist: initialChecklist(), photos: {}, remarks: '', decision: null,
  })
  const [saving, setSaving]     = useState(false)
  const [noteOpen, setNoteOpen] = useState<string | null>(null)
  const supabase = createClient()

  async function load() {
    setLoading(true)

    const [{ data: stock }, { data: bookings }, { data: qcRecords }] = await Promise.all([
      supabase.from('matched_stock_customers').select('*'),
      supabase.from('booking')
        .select('crm_opty_id, delivery_date, delivery_time, qc_check_status, id')
        .not('crm_opty_id', 'is', null),
      supabase.from('car_qc_records').select('chassis_no, final_status'),
    ])

    const bookingMap = new Map(bookings?.map(b => [b.crm_opty_id, b]) ?? [])
    const qcMap      = new Map(qcRecords?.map(q => [q.chassis_no, q]) ?? [])

    const enriched: StockWithDelivery[] = (stock ?? []).map(s => {
      const booking       = bookingMap.get(s.opportunity_name ?? '')
      const qc            = qcMap.get(s.chassis_no)
      const delivery_date = booking?.delivery_date ?? null
      return {
        ...s,
        delivery_date,
        delivery_time:   booking?.delivery_time ?? null,
        booking_id:      booking?.id            ?? null,
        delivery_status: getDeliveryStatus(delivery_date),
        qc_status:       qc?.final_status ?? booking?.qc_check_status ?? null,
      }
    })

    const locs = [...new Set(enriched.map(r => r.current_location).filter(Boolean))] as string[]
    setLocations(locs.sort())
    setAllData(enriched)
    setLoading(false)

    // Auto-open form if chassis pre-selected via URL param
    if (preselectedChassis) {
      const target = enriched.find(r => r.chassis_no === preselectedChassis)
      if (target) openFormFor(target, form.inspectorName)
    }
  }

  useEffect(() => { load() }, [])

  // Auto-lock location for non-managers
  useEffect(() => {
    if (!isManager && !isSuperAdmin && locationName && locFilter === 'ALL') {
      setLocFilter(locationName)
    }
  }, [isManager, isSuperAdmin, locationName])

  // Pre-fill inspector name
  useEffect(() => {
    if (authUser) {
      const name = [authUser.employee.first_name, authUser.employee.last_name].filter(Boolean).join(' ')
      setForm(f => ({ ...f, inspectorName: name }))
    }
  }, [authUser])

  const filtered = useMemo(() => {
    let data = allData
    if (locFilter !== 'ALL') data = data.filter(r => r.current_location === locFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter(r =>
        [r.chassis_no, r.first_name, r.last_name, r.parent_product_line]
          .some(v => v && String(v).toLowerCase().includes(q))
      )
    }
    return data
  }, [allData, locFilter, search])

  function openFormFor(row: StockWithDelivery, inspectorName: string) {
    setSelected(row)
    setForm({ inspectorName, checklist: initialChecklist(), photos: {}, remarks: '', decision: null })
    setNoteOpen(null)
  }

  function openForm(row: StockWithDelivery) {
    openFormFor(row, form.inspectorName)
  }

  function toggleItem(key: string) {
    setForm(f => ({
      ...f,
      checklist: { ...f.checklist, [key]: { ...f.checklist[key], passed: !f.checklist[key].passed } }
    }))
  }

  function setNote(key: string, note: string) {
    setForm(f => ({
      ...f,
      checklist: { ...f.checklist, [key]: { ...f.checklist[key], note } }
    }))
  }

  function handlePhoto(label: string, file: File) {
    const preview = URL.createObjectURL(file)
    setForm(f => ({ ...f, photos: { ...f.photos, [label]: { file, preview } } }))
  }

  const passedCount = Object.values(form.checklist).filter(v => v.passed).length
  const progressPct = Math.round((passedCount / CHECKLIST_ITEMS.length) * 100)

  async function submitQC() {
    if (!selected) return
    if (!form.decision) { toastError('Approve ya Reject decision zaroori hai'); return }
    setSaving(true)

    // Upload photos
    const photoUrls: QCPhoto[] = []
    for (const [label, { file }] of Object.entries(form.photos)) {
      const path = `qc/${selected.chassis_no}/${Date.now()}_${label.replace(/\s/g, '_')}`
      const { data: up, error: upErr } = await supabase.storage
        .from('qc-photos').upload(path, file, { upsert: true })
      if (!upErr && up) {
        const { data: urlData } = supabase.storage.from('qc-photos').getPublicUrl(up.path)
        photoUrls.push({ label, url: urlData.publicUrl, path: up.path })
      }
    }

    const checklistArr: QCChecklistItem[] = CHECKLIST_ITEMS.map(item => ({
      key:    item.key,
      label:  item.label,
      passed: form.checklist[item.key]?.passed ?? false,
      note:   form.checklist[item.key]?.note   ?? '',
    }))

    const { error: qcError } = await supabase.from('car_qc_records').upsert({
      chassis_no:   selected.chassis_no,
      booking_id:   selected.booking_id ?? null,
      inspector_id: authUser?.employee.id ?? null,
      checklist:    checklistArr,
      photo_urls:   photoUrls,
      remarks:      form.remarks,
      final_status: form.decision,
      checked_at:   new Date().toISOString(),
    }, { onConflict: 'chassis_no' })

    if (!qcError && selected.opportunity_name) {
      await supabase.from('booking').update({
        qc_check_status:       form.decision === 'approved' ? 'completed' : 'failed',
        qc_check_completed_at: new Date().toISOString(),
        qc_check_completed_by: authUser?.employee.auth_user_id ?? null,
        updated_at:            new Date().toISOString(),
      }).eq('crm_opty_id', selected.opportunity_name)
    }

    setSaving(false)

    if (qcError) {
      toastError('QC save nahi hua: ' + qcError.message)
      return
    }

    success(form.decision === 'approved'
      ? `✓ QC Approved — ${selected.chassis_no}`
      : `✗ QC Rejected — ${selected.chassis_no}`
    )
    setSelected(null)
    load()
  }

  const qcBadge = (status: string | null) => {
    if (status === 'approved' || status === 'completed')
      return <span className="badge bg-emerald-100 text-emerald-700">✓ Approved</span>
    if (status === 'rejected' || status === 'failed')
      return <span className="badge bg-red-100 text-red-700">✗ Rejected</span>
    return <span className="badge bg-amber-100 text-amber-700">Pending</span>
  }

  return (
    <>
      <Header
        title="QC Checklist"
        subtitle={`${filtered.length} vehicles`}
        actions={
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                       text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <MapPin size={14} className="text-slate-400" />
            {(isManager || isSuperAdmin) && (
              <button onClick={() => setLocFilter('ALL')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  locFilter === 'ALL' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                All
              </button>
            )}
            {locations.map(loc => (
              <button key={loc} onClick={() => setLocFilter(loc)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  locFilter === loc ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {loc}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg
                          px-3 py-2 ml-auto min-w-[240px] focus-within:ring-2 focus-within:ring-brand-500">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Chassis, customer..."
              className="text-sm outline-none flex-1 bg-transparent placeholder:text-slate-400" />
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Chassis No</th>
                  <th>Model</th>
                  <th>Colour</th>
                  <th>Customer</th>
                  <th>Delivery Date</th>
                  <th>Location</th>
                  <th>QC Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j}><div className="h-3 bg-slate-100 rounded w-16" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-400">
                      <ClipboardCheck size={28} className="mx-auto mb-2 text-slate-200" />
                      <p className="text-sm">Koi gaadi nahi mili</p>
                    </td>
                  </tr>
                ) : filtered.map(row => (
                  <tr key={row.chassis_no} onClick={() => openForm(row)}>
                    <td><span className="font-mono text-xs font-semibold text-brand-600">{row.chassis_no}</span></td>
                    <td className="font-medium">{row.parent_product_line ?? '—'}</td>
                    <td className="text-slate-500">{row.product_description ?? '—'}</td>
                    <td>{customerName(row)}</td>
                    <td>
                      {row.delivery_date
                        ? <span className={`badge ${row.delivery_status === 'today' ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                            {fmtDate(row.delivery_date)}
                          </span>
                        : <span className="text-slate-300 text-xs">—</span>
                      }
                    </td>
                    <td><span className="badge bg-slate-100 text-slate-600">{row.current_location ?? '—'}</span></td>
                    <td>{qcBadge(row.qc_status)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button onClick={() => openForm(row)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                                   bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                        <ClipboardCheck size={12} />
                        {row.qc_status ? 'Re-QC' : 'Start QC'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* QC Form modal */}
      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => !saving && setSelected(null)} />
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
            <div className="w-full md:max-w-2xl bg-white rounded-t-2xl md:rounded-2xl shadow-2xl
                            border border-slate-200 max-h-[95vh] flex flex-col">

              {/* Header */}
              <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center mt-0.5">
                  <ClipboardCheck size={16} className="text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">Quality Check Form</p>
                  <p className="text-xs text-slate-400 font-mono">
                    {selected.chassis_no} · {selected.parent_product_line} · {customerName(selected)}
                  </p>
                </div>
                <button onClick={() => setSelected(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-6">

                  {/* Inspector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                      Inspector Name
                    </label>
                    <input
                      value={form.inspectorName}
                      onChange={e => setForm(f => ({ ...f, inspectorName: e.target.value }))}
                      placeholder="QC karne wale ka naam"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg
                                 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>

                  {/* Checklist */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Checklist
                      </label>
                      <span className="text-xs font-semibold text-slate-600">
                        {passedCount}/{CHECKLIST_ITEMS.length}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${progressPct}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {CHECKLIST_ITEMS.map(item => {
                        const state  = form.checklist[item.key]
                        const passed = state?.passed ?? false
                        const note   = state?.note   ?? ''
                        const open   = noteOpen === item.key
                        return (
                          <div key={item.key}
                            className={`rounded-xl border transition-colors ${
                              passed ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                            }`}>
                            <button type="button" onClick={() => toggleItem(item.key)}
                              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0
                                              border-2 transition-colors ${
                                passed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'
                              }`}>
                                {passed && <span className="text-white text-xs font-bold">✓</span>}
                              </div>
                              <span className={`text-sm font-medium flex-1 ${passed ? 'text-emerald-800' : 'text-slate-700'}`}>
                                {item.label}
                              </span>
                              <button type="button"
                                onClick={e => { e.stopPropagation(); setNoteOpen(open ? null : item.key) }}
                                className="text-slate-300 hover:text-slate-500 ml-1">
                                {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            </button>
                            {open && (
                              <div className="px-3 pb-2.5">
                                <input
                                  value={note}
                                  onChange={e => setNote(item.key, e.target.value)}
                                  placeholder="Note likhein (optional)..."
                                  onClick={e => e.stopPropagation()}
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg
                                             bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Photos */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Photos
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {PHOTO_LABELS.map(label => {
                        const photo = form.photos[label]
                        return (
                          <label key={label}
                            className={`relative aspect-square rounded-xl border-2 border-dashed
                                        flex flex-col items-center justify-center cursor-pointer
                                        overflow-hidden transition-colors ${
                              photo
                                ? 'border-emerald-300 bg-emerald-50'
                                : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50'
                            }`}>
                            {photo ? (
                              <>
                                <img src={photo.preview} alt={label}
                                  className="absolute inset-0 w-full h-full object-cover" />
                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 py-1 px-1.5">
                                  <p className="text-white text-xs font-medium text-center truncate">{label}</p>
                                </div>
                              </>
                            ) : (
                              <>
                                <Camera size={18} className="text-slate-300 mb-1" />
                                <span className="text-xs text-slate-400 font-medium text-center px-1 leading-tight">
                                  {label}
                                </span>
                              </>
                            )}
                            <input
                              type="file" accept="image/*" capture="environment"
                              className="absolute inset-0 opacity-0 cursor-pointer"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhoto(label, f) }}
                            />
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                      Remarks / Notes
                    </label>
                    <textarea
                      value={form.remarks}
                      onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                      placeholder="Koi additional notes likhein..."
                      rows={3}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg resize-none
                                 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>

                  {/* Decision */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Final Decision *
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, decision: 'approved' }))}
                        className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold
                                    text-sm border-2 transition-all ${
                          form.decision === 'approved'
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        }`}>
                        <CheckCircle2 size={18} /> APPROVE
                      </button>
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, decision: 'rejected' }))}
                        className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold
                                    text-sm border-2 transition-all ${
                          form.decision === 'rejected'
                            ? 'bg-red-500 border-red-500 text-white'
                            : 'border-red-200 text-red-700 hover:bg-red-50'
                        }`}>
                        <XCircle size={18} /> REJECT
                      </button>
                    </div>
                  </div>

                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-slate-100 flex gap-3 shrink-0">
                <button onClick={() => setSelected(null)} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600
                             border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={submitQC} disabled={saving || !form.decision}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                              text-sm font-semibold text-white transition-all
                              disabled:opacity-50 disabled:cursor-not-allowed ${
                    form.decision === 'rejected' ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'
                  }`}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
                  {saving ? 'Saving...' : 'Submit QC'}
                </button>
              </div>

            </div>
          </div>
        </>
      )}
    </>
  )
}
