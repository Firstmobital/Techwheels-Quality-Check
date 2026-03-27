'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle2, XCircle, AlertCircle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastContextValue>({
  toast:   () => {},
  success: () => {},
  error:   () => {},
})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++counter.current
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  const success = useCallback((msg: string) => toast(msg, 'success'), [toast])
  const error   = useCallback((msg: string) => toast(msg, 'error'),   [toast])

  const icons = {
    success: <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />,
    error:   <XCircle      size={15} className="text-red-500     shrink-0" />,
    info:    <AlertCircle  size={15} className="text-brand-500   shrink-0" />,
  }

  const styles = {
    success: 'border-emerald-200 bg-emerald-50',
    error:   'border-red-200   bg-red-50',
    info:    'border-brand-200 bg-brand-50',
  }

  return (
    <ToastContext.Provider value={{ toast, success, error }}>
      {children}

      {/* Toast stack — bottom-right on desktop, bottom-center on mobile */}
      <div className="fixed bottom-4 right-4 left-4 md:left-auto md:w-80 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg
                        pointer-events-auto animate-in slide-in-from-bottom-2 duration-200
                        ${styles[t.type]}`}
          >
            {icons[t.type]}
            <p className="text-sm font-medium text-slate-800 flex-1 leading-snug">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="text-slate-400 hover:text-slate-600 shrink-0 mt-0.5"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
