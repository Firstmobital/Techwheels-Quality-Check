import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RoleCode, useAuth } from '../../context/auth-context'

const ROLE_OPTIONS: Array<{ value: RoleCode; label: string }> = [
  { value: 'PDIQCMGR', label: 'Manager (PDIQCMGR)' },
  { value: 'TECHNICIAN', label: 'Technician' },
  { value: 'DRIVER', label: 'Driver' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<RoleCode>('PDIQCMGR')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)

    await signIn({ email, password, role })
    navigate('/', { replace: true })

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Techwheels Login</h1>
        <p className="text-sm text-slate-500 mt-1">Phase 1 auth shell</p>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              placeholder="********"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Role (for Phase 1 testing)</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as RoleCode)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
