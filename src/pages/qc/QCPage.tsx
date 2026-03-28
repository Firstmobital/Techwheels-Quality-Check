import { useEffect, useState, useCallback, useRef } from 'react'
import { Search, X, Camera, ChevronDown, ChevronUp, Check, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/components/ui/Toast'
import {
  buildSalesTeamMap,
  deriveCarStatus,
  carStatusLabel,
  carStatusBadgeClass,
  customerName,
  fmtDate,
  getDeliveryStatus,
} from '@/lib/utils'
import type { MatchedStock, QCRecord, QCChecklistItem, TransferTask, StockWithMeta } from '@/types'

const CHECKLIST_KEYS: { key: string; label: string }[] = [
  { key: 'engine',       label: 'Engine' },
  { key: 'ac',           label: 'Air Conditioning' },
  { key: 'lights_front', label: 'Front Lights' },
  { key: 'lights_rear',  label: 'Rear Lights' },
  { key: 'tyres',        label: 'Tyres' },
  { key: 'brakes',       label: 'Brakes' },
  { key: 'body',         label: 'Body / Paint' },
  { key: 'interior',     label: 'Interior' },
  { key: 'fuel',         label: 'Fuel Level' },
  { key: 'documents',    label: 'Documents' },
  { key: 'horn',         label: 'Horn' },
  { key: 'windshield',   label: 'Windshield' },
]

const PHOTO_LABELS = ['Front', 'Rear', 'Left side', 'Right side', 'Interior', 'Engine bay']

interface CheckState {
  [key: string]: { passed: boolean | null; note: string; expanded: boolean }
}

interface PhotoState {
  [label: string]: { file: File | null; url: string | null }
}

function initChecklist(): CheckState {
  const s: CheckState = {}
  for (const c of CHECKLIST_KEYS) {
    s[c.key] = { passed: null, note: '', expanded: false }
  }
  return s
}

// ── QC Sheet ──────────────────────────────────────────────────────────────────
function QCSheet({
  item,
  authUser,
  onClose,
  onSaved,
}: {
  item: StockWithMeta
  authUser: ReturnType<typeof useAuth>['authUser']
  onClose: () => void
  onSaved: () => void
}) {
  const { success, error: toastError } = useToast()
  const supabase = createClient()

  const [inspector, setInspector] = useState(
    authUser ? [authUser.employee.first_name, authUser.employee.last_name].filter(Boolean).join(' ') : ''
  )
  const [checks, setChecks] = useState<CheckState>(initChecklist)
  const [photos, setPhotos] = useState<PhotoState>(
    Object.fromEntries(PHOTO_LABELS.map(l => [l, { file: null, url: null }]))
  )
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const activePhotoLabel = useRef<string | null>(null)

  // Pre-fill from existing record
  useEffect(() => {
    if (item.qc_record) {
      const r = item.qc_record
      const cs: CheckState = initChecklist()
      for (const c of (r.checklist ?? [])) {
        if (cs[c.key]) {
          cs[c.key] = { passed: c.passed, note: c.note ?? '', expanded: false }
        }
      }
      setChecks(cs)
      setRemarks(r.remarks ?? '')
    }
  }, [item.qc_record])

  const passedCount = Object.values(checks).filter(c => c.passed === true).length
  const totalCount = CHECKLIST_KEYS.length
  const progress = Math.round((passedCount / totalCount) * 100)

  function toggleCheck(key: string, value: boolean) {
    setChecks(prev => ({
      ...prev,
      [key]: { ...prev[key], passed: prev[key].passed === value ? null : value },
    }))
  }

  function toggleNote(key: string) {
    setChecks(prev => ({
      ...prev,
      [key]: { ...prev[key], expanded: !prev[key].expanded },
    }))
  }

  function setNote(key: string, note: string) {
    setChecks(prev => ({ ...prev, [key]: { ...prev[key], note } }))
  }

  function openCamera(label: string) {
    activePhotoLabel.current = label
    fileInputRef.current?.click()
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const label = activePhotoLabel.current
    if (!file || !label) return
    const url = URL.createObjectURL(file)
    setPhotos(prev => ({ ...prev, [label]: { file, url } }))
    e.target.value = ''
  }

  async function submit(finalStatus: 'approved' | 'rejected') {
    if (!inspector.trim()) { toastError('Inspector name is required'); return }
    setSaving(true)
    try {
      // Upload photos
      const photoUrls: { label: string; url: string; path: string }[] = []
      for (const [label, { file }] of Object.entries(photos)) {
        if (file) {
          const path = `qc/${item.chassis_no}/${label.replace(/ /g, '_')}_${Date.now()}`
          const { error: upErr } = await supabase.storage
            .from('qc-photos')
            .upload(path, file, { upsert: true })
          if (upErr) { console.warn('Photo upload failed:', upErr.message); continue }
          const { data: { publicUrl } } = supabase.storage.from('qc-photos').getPublicUrl(path)
          photoUrls.push({ label, url: publicUrl, path })
        } else if (item.qc_record?.photo_urls) {
          const existing = item.qc_record.photo_urls.find(p => p.label === label)
          if (existing) photoUrls.push(existing)
        }
      }

      const checklist: QCChecklistItem[] = CHECKLIST_KEYS.map(c => ({
        key: c.key,
        label: c.label,
        passed: checks[c.key].passed ?? false,
        note: checks[c.key].note,
      }))

      const { error: saveErr } = await supabase
        .from('car_qc_records')
        .upsert(
          {
            chassis_no: item.chassis_no,
            booking_id: item.booking_id,
            inspector_id: authUser?.employee?.id ?? null,
            checklist,
            photo_urls: photoUrls,
            remarks,
            final_status: finalStatus,
            checked_at: new Date().toISOString(),
          },
          { onConflict: 'chassis_no' }
        )

      if (saveErr) throw saveErr

      // Update booking qc_check_status
      if (item.booking_id) {
        await supabase
          .from('booking')
          .update({ qc_check_status: finalStatus, qc_check_completed_at: new Date().toISOString() })
          .eq('crm_opty_id', item.booking_id)
      }

      success(`QC ${finalStatus === 'approved' ? 'approved' : 'rejected'} successfully!`)
      onSaved()
      onClose()
    } catch (err: unknown) {
      toastError('Save failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />

        {/* Car header */}
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <span className="mono" style={{ color: 'var(--accent)', fontSize: 14 }}>{item.chassis_no}</span>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                {item.product_description ?? item.product_line ?? '—'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{customerName(item)}</div>
            </div>
            <button
              onClick={onClose}
              style={{ padding: 6, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 12, marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
              <span>QC Progress</span>
              <span>{passedCount}/{totalCount} passed</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <div style={{ padding: '16px' }}>
          {/* Inspector */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Inspector Name
            </label>
            <input
              className="form-input"
              value={inspector}
              onChange={e => setInspector(e.target.value)}
              placeholder="Your name"
            />
          </div>

          {/* Checklist */}
          <div style={{ marginBottom: 14 }}>
            <div className="section-label" style={{ padding: '0 0 8px' }}>Checklist</div>
            {CHECKLIST_KEYS.map(c => {
              const state = checks[c.key]
              return (
                <div key={c.key} className="check-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{c.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {/* Pass button */}
                        <button
                          className={`check-circle${state.passed === true ? ' pass' : ''}`}
                          onClick={() => toggleCheck(c.key, true)}
                        >
                          {state.passed === true && <Check size={14} />}
                        </button>
                        {/* Fail button */}
                        <button
                          className={`check-circle${state.passed === false ? ' fail' : ''}`}
                          onClick={() => toggleCheck(c.key, false)}
                          style={{ borderColor: state.passed === false ? 'var(--red)' : undefined }}
                        >
                          {state.passed === false && <X size={14} />}
                        </button>
                        {/* Toggle note */}
                        <button
                          onClick={() => toggleNote(c.key)}
                          style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
                        >
                          {state.expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>
                    {state.expanded && (
                      <textarea
                        value={state.note}
                        onChange={e => setNote(c.key, e.target.value)}
                        placeholder="Add note..."
                        rows={2}
                        style={{
                          marginTop: 8,
                          width: '100%',
                          padding: '8px 10px',
                          fontSize: 13,
                          border: '1.5px solid var(--border)',
                          borderRadius: 8,
                          resize: 'none',
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Photos */}
          <div style={{ marginBottom: 14 }}>
            <div className="section-label" style={{ padding: '0 0 8px' }}>Photos</div>
            <div className="photo-grid">
              {PHOTO_LABELS.map(label => {
                const photo = photos[label]
                return (
                  <div
                    key={label}
                    className={`photo-slot${photo.url ? ' filled' : ''}`}
                    onClick={() => openCamera(label)}
                  >
                    {photo.url ? (
                      <img src={photo.url} alt={label} />
                    ) : (
                      <>
                        <Camera size={18} style={{ color: 'var(--muted)' }} />
                        <span>{label}</span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
          </div>

          {/* Remarks */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Remarks
            </label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Any additional notes..."
              rows={3}
              className="form-input"
              style={{ resize: 'none' }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="big-btn big-btn-green"
              onClick={() => { void submit('approved') }}
              disabled={saving}
              style={{ flex: 1 }}
            >
              {saving ? <RefreshCw size={16} className="spin" /> : <Check size={16} />}
              Approve
            </button>
            <button
              className="big-btn big-btn-red"
              onClick={() => { void submit('rejected') }}
              disabled={saving}
              style={{ flex: 1 }}
            >
              {saving ? <RefreshCw size={16} className="spin" /> : <X size={16} />}
              Reject
            </button>
          </div>

          <div style={{ height: 24 }} />
        </div>
      </div>
    </>
  )
}

// ── QC Page ───────────────────────────────────────────────────────────────────
export default function QCPage() {
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
      const [salesTeamMap, { data: stockData }, { data: bookingData }, { data: qcData }, { data: transferData }] =
        await Promise.all([
          buildSalesTeamMap(),
          supabase.from('matched_stock_customers').select('*'),
          supabase.from('booking').select('crm_opty_id, delivery_date, delivery_time, qc_check_status'),
          supabase.from('car_qc_records').select('*'),
          supabase.from('transfer_tasks').select('*'),
        ])

      const bookingMap = new Map<string, { crm_opty_id: string | null; delivery_date: string | null; delivery_time: string | null; qc_check_status: string | null }>()
      for (const b of (bookingData ?? [])) { if (b.crm_opty_id) bookingMap.set(b.crm_opty_id, b) }

      const qcMap = new Map<string, QCRecord>()
      for (const q of (qcData ?? []) as QCRecord[]) { qcMap.set(q.chassis_no, q) }

      const transferMap = new Map<string, TransferTask>()
      for (const t of (transferData ?? []) as TransferTask[]) { transferMap.set(t.chassis_no, t) }

      let stock = (stockData ?? []) as MatchedStock[]
      stock = stock.filter((s) => `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim().length > 0)
      if (!isManager && !isSuperAdmin && locationName) {
        stock = stock.filter(s => s.current_location === locationName)
      }

      const withMeta: StockWithMeta[] = stock.map(s => {
        const booking = s.opportunity_name ? bookingMap.get(s.opportunity_name) : null
        const qcRecord = qcMap.get(s.chassis_no) ?? null
        const transfer = transferMap.get(s.chassis_no) ?? null
        const bookingBranch = s.sales_team ? (salesTeamMap.get(s.sales_team) ?? null) : null
        const deliveryDate = booking?.delivery_date ?? null
        const deliveryTime = booking?.delivery_time ?? null
        const qcStatus = qcRecord?.final_status ?? booking?.qc_check_status ?? null
        return {
          ...s,
          delivery_date: deliveryDate,
          delivery_time: deliveryTime,
          booking_id: s.opportunity_name ?? null,
          delivery_status: getDeliveryStatus(deliveryDate),
          qc_status: qcStatus,
          qc_record: qcRecord,
          transfer,
          car_status: deriveCarStatus(s, bookingBranch, transfer, qcStatus, deliveryDate),
          booking_branch: bookingBranch,
        }
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
      customerName(i).toLowerCase().includes(q)
    )
  })

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>QC Check</h1>
          {!loading && <p className="subtitle">{filtered.length} vehicles</p>}
        </div>
        <button
          onClick={() => { void load() }}
          className="nav-btn"
          style={{ minWidth: 36, minHeight: 36 }}
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
            placeholder="Search chassis, model, customer..."
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
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No vehicles found</div>
      ) : (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(item => (
            <button
              key={item.chassis_no}
              style={{ textAlign: 'left', cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, width: '100%', padding: '12px 14px' }}
              onClick={() => setSelected(item)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="mono" style={{ color: 'var(--accent)', display: 'block', marginBottom: 2 }}>
                    {item.chassis_no}
                  </span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.product_description ?? item.product_line ?? '—'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{customerName(item)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span className={`badge ${carStatusBadgeClass(item.car_status)}`}>
                    {carStatusLabel(item.car_status)}
                  </span>
                  {item.delivery_date && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(item.delivery_date)}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ height: 16 }} />

      {selected && (
        <QCSheet
          item={selected}
          authUser={authUser}
          onClose={() => setSelected(null)}
          onSaved={() => { void load() }}
        />
      )}
    </div>
  )
}
