import { useEffect, useState, useCallback } from 'react'
import { MapPin, ArrowRight, Truck, CheckCircle, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/components/ui/Toast'
import type { TransferTask } from '@/types'

interface TaskWithStock extends TransferTask {
  model?: string
  customer?: string
}

export default function TasksPage() {
  const { authUser } = useAuth()
  const { success, error: toastError } = useToast()
  const [tasks, setTasks] = useState<TaskWithStock[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const supabase = createClient()

  const driverId = authUser?.employee?.id

  const load = useCallback(async () => {
    if (!driverId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('transfer_tasks')
        .select('*')
        .eq('driver_id', driverId)
        .neq('status', 'arrived')
        .order('assigned_at', { ascending: false })

      if (error) throw error

      const taskList = (data ?? []) as TransferTask[]

      // Enrich with model and customer from matched_stock_customers
      if (taskList.length > 0) {
        const chassisNos = taskList.map(t => t.chassis_no)
        const { data: stockData } = await supabase
          .from('matched_stock_customers')
          .select('chassis_no, product_description, product_line, first_name, last_name')
          .in('chassis_no', chassisNos)

        const stockMap = new Map<string, { product_description: string | null; product_line: string | null; first_name: string | null; last_name: string | null }>()
        for (const s of (stockData ?? [])) {
          stockMap.set(s.chassis_no, s)
        }

        const enriched: TaskWithStock[] = taskList.map(t => {
          const s = stockMap.get(t.chassis_no)
          const customerName = s ? [s.first_name, s.last_name].filter(Boolean).join(' ').trim() : ''
          return {
            ...t,
            model: s?.product_description ?? s?.product_line ?? undefined,
            customer: customerName || undefined,
          }
        })
        setTasks(enriched.filter((t) => Boolean(t.customer)))
      } else {
        setTasks([])
      }
    } catch (err) {
      toastError('Could not load tasks')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [driverId])

  useEffect(() => { void load() }, [load])

  async function markPickedUp(task: TaskWithStock) {
    setUpdating(task.id)
    const { error } = await supabase
      .from('transfer_tasks')
      .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
      .eq('id', task.id)
    setUpdating(null)
    if (error) { toastError('Update failed'); return }
    success('Marked as picked up!')
    void load()
  }

  async function markArrived(task: TaskWithStock) {
    setUpdating(task.id)
    const { error } = await supabase
      .from('transfer_tasks')
      .update({ status: 'arrived', arrived_at: new Date().toISOString() })
      .eq('id', task.id)
    setUpdating(null)
    if (error) { toastError('Update failed'); return }
    success('Marked as arrived!')
    void load()
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>My Tasks</h1>
          {tasks.length > 0 && <p className="subtitle">{tasks.length} active transfer{tasks.length > 1 ? 's' : ''}</p>}
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

      <div style={{ paddingTop: 12 }}>
        {loading ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Loading...
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ margin: '32px 16px', textAlign: 'center' }}>
            <Truck size={40} strokeWidth={1.5} style={{ color: 'var(--border)', margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No active tasks</p>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>You have no pending transfers right now</p>
          </div>
        ) : (
          tasks.map(task => {
            const isUpdating = updating === task.id
            const canPickup = task.status === 'assigned'
            const canArrive = task.status === 'picked_up'

            return (
              <div key={task.id} className="task-card">
                <div style={{ padding: '12px 14px' }}>
                  {/* Chassis + status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="mono" style={{ color: 'var(--accent)', fontSize: 13 }}>
                      {task.chassis_no}
                    </span>
                    <span className={`badge ${task.status === 'assigned' ? 'badge-amber' : 'badge-blue'}`}>
                      {task.status === 'assigned' ? 'Pickup pending' : 'In transit'}
                    </span>
                  </div>

                  {/* Model + customer */}
                  {task.model && (
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                      {task.model}
                    </div>
                  )}
                  {task.customer && (
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                      {task.customer}
                    </div>
                  )}

                  {/* From → To */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} style={{ color: 'var(--red)' }} />
                      <span className="badge badge-red">{task.from_location}</span>
                    </span>
                    <ArrowRight size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} style={{ color: 'var(--green)' }} />
                      <span className="badge badge-green">{task.to_location}</span>
                    </span>
                  </div>
                </div>

                <div className="task-actions">
                  <button
                    className="task-action-btn"
                    onClick={() => { void markPickedUp(task) }}
                    disabled={!canPickup || isUpdating}
                    style={!canPickup ? { opacity: 0.3 } : {}}
                  >
                    {isUpdating && canPickup ? (
                      <RefreshCw size={14} className="spin" />
                    ) : (
                      <Truck size={14} />
                    )}
                    Mark Picked Up
                  </button>
                  <button
                    className="task-action-btn"
                    onClick={() => { void markArrived(task) }}
                    disabled={!canArrive || isUpdating}
                    style={!canArrive ? { opacity: 0.3 } : {}}
                  >
                    {isUpdating && canArrive ? (
                      <RefreshCw size={14} className="spin" />
                    ) : (
                      <CheckCircle size={14} />
                    )}
                    Mark Arrived
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
