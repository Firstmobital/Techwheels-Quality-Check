'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (authError) {
      setError(
        authError.message.includes('Invalid login')
          ? 'Email ya password galat hai. Dobara try karein.'
          : authError.message
      )
      setLoading(false)
      return
    }

    // Auth context will pick up the session change;
    // middleware will handle routing but we push to root
    // so the server component can role-redirect.
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 mb-4 shadow-lg">
            <span className="text-2xl">🚗</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">GaadiCheck</h1>
          <p className="text-slate-500 text-sm mt-1">Vehicle QC & Delivery Management</p>
        </div>

        {/* Form Card */}
        <div className="card p-6 shadow-md">
          <h2 className="text-base font-semibold text-slate-800 mb-5">Apne account mein login karein</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                           placeholder:text-slate-400 transition-shadow"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-slate-200 text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                             placeholder:text-slate-400 transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                <span className="text-red-500 mt-0.5 shrink-0">⚠</span>
                <p className="text-red-700 text-xs leading-relaxed">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700
                         text-white font-semibold py-2.5 rounded-lg text-sm transition-colors
                         disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Logging in...</>
              ) : (
                'Login Karein'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Password bhool gaye? IT team se contact karein.
        </p>
      </div>
    </div>
  )
}
