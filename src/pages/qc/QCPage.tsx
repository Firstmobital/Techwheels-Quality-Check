import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, X, Camera, ChevronDown, ChevronUp,
  Check, RefreshCw, MapPin,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { useBranch } from '@/context/branch-context'
import { useToast } from '@/components/ui/Toast'
import {
  buildSalesTeamMap,
  deriveCarStatus,
  fmtDate,
  getDeliveryStatus,
  getSalesTeamLocation,
} from '@/lib/utils'
import type {
  MatchedStock,
  QCRecord,
  QCChecklistItem,
  TransferTask,
  StockWithMeta,
  BookingRow,
} from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────
const CHECKLIST_KEYS: { key: string; label: string }[] = [
  { key: 'engine',       label: 'इंजन' },
  { key: 'ac',           label: 'AC' },
  { key: 'lights_front', label: 'आगे की लाइट' },
  { key: 'lights_rear',  label: 'पीछे की लाइट' },
  { key: 'tyres',        label: 'टायर' },
  { key: 'brakes',       label: 'ब्रेक' },
  { key: 'body',         label: 'बॉडी / रंग' },
  { key: 'interior',     label: 'अंदर की सीट' },
  { key: 'fuel',         label: 'ईंधन स्तर' },
  { key: 'documents',    label: 'कागज़ात' },
  { key: 'horn',         label: 'हॉर्न' },
  { key: 'windshield',   label: 'शीशा' },
]

const PHOTO_LABELS = [
  'Front', 'Rear', 'Left side', 'Right side', 'Interior', 'Engine bay',
]

const MIN_PHOTOS = 2

type QCTab = 'pending' | 'done' | 'rejected'

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
  const navigate = useNavigate()
  const supabase = createClient()

  const [checks, setChecks]   = useState<CheckState>(initChecklist)
  const [photos, setPhotos]   = useState<PhotoState>(
    Object.fromEntries(PHOTO_LABELS.map(l => [l, { file: null, url: null }])),
  )
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving]   = useState(false)

  const fileInputRef     = useRef<HTMLInputElement>(null)
  const activePhotoLabel = useRef<string | null>(null)

  useEffect(() => {
    if (!item.qc_record) return
    const r  = item.qc_record
    const cs = initChecklist()
    for (const c of r.checklist ?? []) {
      if (cs[c.key]) {
        cs[c.key] = { passed: c.passed, note: c.note ?? '', expanded: false }
      }
    }
    setChecks(cs)
    setRemarks(r.remarks ?? '')
    if (r.photo_urls?.length) {
      setPhotos(prev => {
        const next = { ...prev }
        for (const p of r.photo_urls) {
          if (next[p.label] !== undefined) {
            next[p.label] = { file: null, url: p.url }
          }
        }
        return next
      })
    }
  }, [item.qc_record])

  const passedCount   = Object.values(checks).filter(c => c.passed === true).length
  const totalCount    = CHECKLIST_KEYS.length
  const progress      = Math.round((passedCount / totalCount) * 100)
  const uploadedCount = Object.values(photos).filter(p => p.url !== null).length
  const canSubmit     = uploadedCount >= MIN_PHOTOS

  const atBranch =
    !item.delivery_branch ||
    item.current_location === item.delivery_branch ||
    item.transfer?.status === 'arrived'

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
    const file  = e.target.files?.[0]
    const label = activePhotoLabel.current
    if (!file || !label) return
    const url = URL.createObjectURL(file)
    setPhotos(prev => ({ ...prev, [label]: { file, url } }))
    e.target.value = ''
  }

  async function submit(finalStatus: 'approved' | 'rejected') {
    if (!canSubmit) {
      toastError(`Please upload at least ${MIN_PHOTOS} photos before submitting`)
      return
    }
    setSaving(true)
    try {
      const photoUrls: { label: string; url: string; path: string }[] = []

      for (const [label, { file, url }] of Object.entries(photos)) {
        if (file) {
          const path = `qc/${item.chassis_no}/${label.replace(/ /g, '_')}_${Date.now()}`
          const { error: upErr } = await supabase.storage
            .from('qc-photos')
            .upload(path, file, { upsert: true })
          if (upErr) { console.warn('Photo upload failed:', upErr.message); continue }
          const { data: { publicUrl } } = supabase.storage.from('qc-photos').getPublicUrl(path)
          photoUrls.push({ label, url: publicUrl, path })
        } else if (url) {
          const existingPath = item.qc_record?.photo_urls?.find(p => p.label === label)?.path ?? ''
          photoUrls.push({ label, url, path: existingPath })
        }
      }

      const checklist: QCChecklistItem[] = CHECKLIST_KEYS.map(c => ({
        key:    c.key,
        label:  c.label,
        passed: checks[c.key].passed ?? false,
        note:   checks[c.key].note,
      }))

      const { error: saveErr } = await supabase
        .from('car_qc_records')
        .upsert(
          {
            chassis_no:   item.chassis_no,
            booking_id:   item.booking_id,
            inspector_id: authUser?.employee?.id ?? null,
            checklist,
            photo_urls:   photoUrls,
            remarks,
            final_status: finalStatus,
            checked_at:   new Date().toISOString(),
          },
          { onConflict: 'chassis_no' },
        )

      if (saveErr) throw saveErr

      const eventAt = new Date().toISOString()
      const performedBy = authUser?.employee?.id ?? null
      const fromLocation = item.current_location ?? item.delivery_branch ?? null
      const toLocation = item.delivery_branch ?? null

      const { error: movementErr } = await supabase
        .from('chassis_movements')
        .insert({
          event_type: finalStatus === 'approved' ? 'qc_approved' : 'qc_rejected',
          chassis_no: item.chassis_no,
          from_location: fromLocation,
          to_location: toLocation,
          performed_by: performedBy,
          notes: remarks.trim() || null,
          event_at: eventAt,
        })
      if (movementErr) throw movementErr

      if (finalStatus === 'rejected') {
        const faultDescription = remarks.trim() || 'QC में खराबी पाई गई'

        const { data: technician } = await supabase
          .from('employees')
          .select('id, role:roles!inner(code)')
          .eq('roles.code', 'TECHNICIAN')
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle()

        const assignedTechnicianId = (technician as { id: number } | null)?.id ?? null

        const { error: faultErr } = await supabase
          .from('fault_tickets')
          .insert({
            chassis_no: item.chassis_no,
            stage: 'delivery_qc',
            raised_by: performedBy,
            assigned_to: assignedTechnicianId,
            severity: 'major',
            description: faultDescription,
            photo_urls: [],
            status: 'open',
          })
        if (faultErr) throw faultErr

        const { error: faultMovementErr } = await supabase
          .from('chassis_movements')
          .insert({
            event_type: 'fault_raised',
            chassis_no: item.chassis_no,
            from_location: fromLocation,
            to_location: toLocation,
            performed_by: performedBy,
            notes: faultDescription,
            event_at: eventAt,
          })
        if (faultMovementErr) throw faultMovementErr
      }

      if (item.booking_id) {
        await supabase
          .from('booking')
          .update({ qc_check_status: finalStatus, qc_check_completed_at: new Date().toISOString() })
          .eq('crm_opty_id', item.booking_id)
      }

      success(
        finalStatus === 'approved'
          ? 'QC पास हो गई!'
          : 'QC फेल — दोबारा जांच जरूरी',
      )
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
              {/* Sales team instead of customer name */}
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {item.sales_team ?? '—'}
                {item.delivery_date ? ` · ${fmtDate(item.delivery_date)}` : ''}
              </div>
            </div>
            <button onClick={onClose} style={{ padding: 6, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={12} style={{ color: 'var(--muted)' }} />
              <span className="badge badge-gray">{item.current_location ?? '—'}</span>
            </span>
            {item.delivery_branch && (
              <>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>→</span>
                <span className="badge badge-blue">{item.delivery_branch}</span>
              </>
            )}
            {atBranch ? (
              <span className="badge badge-green" style={{ marginLeft: 'auto' }}>At branch ✓</span>
            ) : (
              <span className="badge badge-amber" style={{ marginLeft: 'auto' }}>Not at branch</span>
            )}
          </div>

          <div style={{ marginTop: 12, marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
              <span>Checklist progress</span>
              <span>{passedCount}/{totalCount} passed</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <div style={{ padding: '16px' }}>
          <div className="section-label" style={{ padding: '0 0 8px' }}>Checklist</div>
          {CHECKLIST_KEYS.map(c => {
            const state = checks[c.key]
            return (
              <div key={c.key} className="check-item">
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{c.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        className={`check-circle${state.passed === true ? ' pass' : ''}`}
                        onClick={() => toggleCheck(c.key, true)}
                      >
                        {state.passed === true && <Check size={14} />}
                      </button>
                      <button
                        className={`check-circle${state.passed === false ? ' fail' : ''}`}
                        onClick={() => toggleCheck(c.key, false)}
                        style={{ borderColor: state.passed === false ? 'var(--red)' : undefined }}
                      >
                        {state.passed === false && <X size={14} />}
                      </button>
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
                      style={{ marginTop: 8, width: '100%', padding: '8px 10px', fontSize: 13, border: '1.5px solid var(--border)', borderRadius: 8, resize: 'none', outline: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)' }}
                    />
                  )}
                </div>
              </div>
            )
          })}

          <div style={{ marginTop: 16, marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="section-label" style={{ padding: 0 }}>Photos</div>
              <span style={{ fontSize: 11, color: uploadedCount >= MIN_PHOTOS ? 'var(--green)' : 'var(--amber)', fontWeight: 600 }}>
                {uploadedCount}/{MIN_PHOTOS} required
              </span>
            </div>
            <div className="photo-grid">
              {PHOTO_LABELS.map(label => {
                const photo = photos[label]
                return (
                  <div key={label} className={`photo-slot${photo.url ? ' filled' : ''}`} onClick={() => openCamera(label)}>
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
            {!canSubmit && (
              <div style={{ marginTop: 8, padding: '7px 10px', background: '#FEF3C7', borderRadius: 8, fontSize: 12, color: 'var(--amber)', textAlign: 'center' }}>
                Upload at least {MIN_PHOTOS} photos to enable approve / reject
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
          </div>

          <div style={{ marginTop: 16, marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Remarks
            </label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Any additional notes or reason for rejection..."
              rows={3}
              className="form-input"
              style={{ resize: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="big-btn big-btn-green"
              onClick={() => { void submit('approved') }}
              disabled={saving || !canSubmit}
              style={{ flex: 1, opacity: canSubmit ? 1 : 0.45 }}
            >
              {saving ? <RefreshCw size={16} className="spin" /> : <Check size={16} />}
              QC पास करें
            </button>
            <button
              className="big-btn big-btn-red"
              onClick={() => { void submit('rejected') }}
              disabled={saving || !canSubmit}
              style={{ flex: 1, opacity: canSubmit ? 1 : 0.45 }}
            >
              {saving ? <RefreshCw size={16} className="spin" /> : <X size={16} />}
              QC फेल करें
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
  const navigate = useNavigate()
  const { authUser, isManager, isSuperAdmin } = useAuth()
  const { selectedBranch } = useBranch()
  const [items, setItems]       = useState<StockWithMeta[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [tab, setTab]           = useState<QCTab>('pending')
  const [selected, setSelected] = useState<StockWithMeta | null>(null)
  const supabase = createClient()

  const locationName = authUser?.location?.name ?? ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [
        salesTeamMap,
        { data: stockData },
        { data: bookingData },
        { data: qcData },
        { data: transferData },
      ] = await Promise.all([
        buildSalesTeamMap(),
        supabase.from('matched_stock_customers').select('*'),
        supabase.from('booking').select('id, crm_opty_id, delivery_date, delivery_time, qc_check_status'),
        supabase.from('car_qc_records').select('*'),
        supabase.from('transfer_tasks').select('*'),
      ])

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

      const withMeta: StockWithMeta[] = stock.map(s => {
        const booking = s.opportunity_name ? bookingMap.get(s.opportunity_name) : null
        const qcRecord = qcMap.get(s.chassis_no) ?? null
        const transfer = transferMap.get(s.chassis_no) ?? null
        const deliveryBranch = getSalesTeamLocation(salesTeamMap, s.sales_team)
        const deliveryDate = booking?.delivery_date ?? null
        const deliveryTime = booking?.delivery_time ?? null
        const qcStatus = qcRecord?.final_status ?? booking?.qc_check_status ?? null

        return {
          ...s,
          booking_uuid:    booking?.id ?? null,
          booking_id:      s.opportunity_name ?? null,
          delivery_date:   deliveryDate,
          delivery_time:   deliveryTime,
          delivery_status: getDeliveryStatus(deliveryDate),
          qc_status:       qcStatus,
          qc_record:       qcRecord,
          transfer,
          car_status:      deriveCarStatus(s.current_location, deliveryBranch, transfer, qcStatus, deliveryDate),
          delivery_branch: deliveryBranch,
        } satisfies StockWithMeta
      })

      const qcRelevant = withMeta
        .filter(s => !['transfer_needed', 'transfer_assigned', 'in_transit'].includes(s.car_status))
        .filter(s => !selectedBranch || s.delivery_branch === selectedBranch)

      qcRelevant.sort((a, b) => {
        if (!a.delivery_date && !b.delivery_date) return 0
        if (!a.delivery_date) return 1
        if (!b.delivery_date) return -1
        return a.delivery_date.localeCompare(b.delivery_date)
      })

      setItems(qcRelevant)
    } finally {
      setLoading(false)
    }
  }, [isManager, isSuperAdmin, locationName, selectedBranch])

  useEffect(() => { void load() }, [load])

  const pendingItems  = items.filter(i => i.car_status === 'qc_pending')
  const doneItems     = items.filter(i => i.car_status === 'qc_approved' || i.car_status === 'ready')
  const rejectedItems = items.filter(i => i.car_status === 'qc_rejected')

  const tabItems =
    tab === 'pending'  ? pendingItems  :
    tab === 'done'     ? doneItems     :
                         rejectedItems

  const filtered = tabItems.filter(i => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      i.chassis_no.toLowerCase().includes(q) ||
      (i.product_description ?? '').toLowerCase().includes(q) ||
      (i.product_line ?? '').toLowerCase().includes(q) ||
      (i.sales_team ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Quality Check</h1>
          {!loading && <p className="subtitle">{filtered.length} vehicles</p>}
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

      {/* Sub-tabs */}
      <div style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        {([
          { key: 'pending',  label: 'बाकी',  count: pendingItems.length,  color: 'var(--purple)', bg: '#EDE9FE' },
          { key: 'done',     label: 'पूरी',   count: doneItems.length,     color: 'var(--green)',  bg: '#DCFCE7' },
          { key: 'rejected', label: 'रद्द', count: rejectedItems.length, color: 'var(--red)',    bg: '#FEE2E2' },
        ] as { key: QCTab; label: string; count: number; color: string; bg: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1,
              padding: '10px 4px',
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: tab === t.key ? t.color : 'var(--muted)',
              borderBottom: tab === t.key ? `2px solid ${t.color}` : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {t.label}
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: t.bg, color: t.color }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '10px 16px 6px' }}>
        <div className="search-bar">
          <Search size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Chassis, model, sales team..."
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ margin: '16px', padding: '32px 20px', textAlign: 'center', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {search ? 'No vehicles match your search' : `No ${tab} vehicles`}
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(item => (
            <button
              key={item.chassis_no}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                background: 'var(--surface)',
                border: `1px solid ${item.car_status === 'qc_rejected' ? 'var(--red)' : 'var(--border)'}`,
                borderLeft: item.car_status === 'qc_rejected' ? '3px solid var(--red)' : undefined,
                borderRadius: 12,
                width: '100%',
                padding: '12px 14px',
              }}
              onClick={() => setSelected(item)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    className="mono"
                    style={{ color: 'var(--accent)', display: 'block', marginBottom: 2, cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/history?chassis=${encodeURIComponent(item.chassis_no)}`)
                    }}
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
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  {item.delivery_date && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(item.delivery_date)}</span>
                  )}
                  {item.delivery_branch && (
                    <span className="badge badge-blue" style={{ fontSize: 10 }}>{item.delivery_branch}</span>
                  )}
                </div>
              </div>

              {item.car_status === 'qc_rejected' && item.qc_record?.remarks && (
                <div style={{ marginTop: 8, padding: '6px 10px', background: '#FEE2E2', borderRadius: 8, fontSize: 12, color: 'var(--red)' }}>
                  {item.qc_record.remarks}
                </div>
              )}
            </button>
          ))}
          <div style={{ height: 8 }} />
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