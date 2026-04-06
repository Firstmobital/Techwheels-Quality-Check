import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { Employee, Location, Role } from '../types'
import { getSupabaseBrowserClient } from '../lib/supabase/client'

export interface AuthUser {
  employee: Employee
  role: Role
  location: Location | null
  isSuperAdmin: boolean
}

interface SignInInput {
  email: string
  password: string
  role?: string
}

interface AuthContextValue {
  authUser: AuthUser | null
  loading: boolean
  signIn: (input: SignInInput) => Promise<void>
  signOut: () => Promise<void>
  isManager: boolean
  isTechnician: boolean
  isDriver: boolean
  isYardManager: boolean
  isSales: boolean
  isSuperAdmin: boolean
  // Global branch filter
  selectedBranch: string | null
  setSelectedBranch: (branch: string | null) => void
}

const FULL_ACCESS_CODES = new Set(['PDIQCMGR', 'ADMIN', 'SUPER_ADMIN', 'HR', 'GM'])

const AuthContext = createContext<AuthContextValue>({
  authUser: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  isManager: false,
  isTechnician: false,
  isDriver: false,
  isYardManager: false,
  isSales: false,
  isSuperAdmin: false,
  selectedBranch: null,
  setSelectedBranch: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const supabase = getSupabaseBrowserClient()
  const latestUserIdRef = useRef<string | null>(null)
  const latestRequestIdRef = useRef(0)

  const clearAuth = useCallback(() => {
    latestRequestIdRef.current += 1
    latestUserIdRef.current = null
    setAuthUser(null)
    setLoading(false)
  }, [])

  const loadEmployee = useCallback(async (userId: string) => {
    const requestId = latestRequestIdRef.current + 1
    latestRequestIdRef.current = requestId
    latestUserIdRef.current = userId
    setLoading(true)

    try {
      const { data: emp, error } = await supabase
        .from('employees')
        .select(`
          id, auth_user_id, first_name, last_name, email,
          mobile, role_id, location_id, photo_url, employee_code,
          is_super_admin,
          role:roles ( id, name, code, department_id, is_active ),
          location:locations ( id, name, address, city )
        `)
        .eq('auth_user_id', userId)
        .single()

      if (latestRequestIdRef.current !== requestId || latestUserIdRef.current !== userId) return

      if (error || !emp) {
        clearAuth()
        return
      }

      const employee = emp as unknown as Employee & {
        role: Role
        location: Location | null
        is_super_admin?: boolean
      }

      setAuthUser({
        employee,
        role: employee.role,
        location: employee.location ?? null,
        isSuperAdmin: employee.is_super_admin ?? false,
      })
    } catch {
      if (latestRequestIdRef.current === requestId) clearAuth()
    } finally {
      if (latestRequestIdRef.current === requestId) setLoading(false)
    }
  }, [clearAuth, supabase])

  useEffect(() => {
    let mounted = true
    let timeoutId: NodeJS.Timeout | null = null

    const bootstrap = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!mounted) return
        if (error || !data.session?.user) { clearAuth(); return }
        await loadEmployee(data.session.user.id)
      } catch {
        if (mounted) clearAuth()
      }
    }

    bootstrap()

    timeoutId = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 30000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (!mounted) return
      if (event === 'INITIAL_SESSION') return
      if (session?.user?.id) {
        setTimeout(() => {
          if (!mounted) return
          void loadEmployee(session.user.id).catch(() => clearAuth())
        }, 0)
      } else {
        clearAuth()
      }
    })

    return () => {
      mounted = false
      if (timeoutId) clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [clearAuth, loadEmployee])

  const signIn = useCallback(async ({ email, password }: SignInInput) => {
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error || !data.user) {
      setLoading(false)
      throw new Error(error?.message ?? 'Login failed')
    }
  }, [supabase])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(error.message)
    setSelectedBranch(null)
    clearAuth()
  }, [clearAuth, supabase])

  const roleCode = authUser?.role?.code ?? ''
  const superAdmin = authUser?.isSuperAdmin ?? false

  const isSuperAdmin = superAdmin || FULL_ACCESS_CODES.has(roleCode)
  const isManager = isSuperAdmin || roleCode === 'PDIQCMGR'
  const isTechnician = !isSuperAdmin && roleCode === 'TECHNICIAN'
  const isDriver = !isSuperAdmin && roleCode === 'DRIVER'
  const isYardManager = !isSuperAdmin && roleCode === 'YARDMGR'
  const isSales = !isSuperAdmin && roleCode === 'SALES'

  const value = useMemo(
    () => ({
      authUser,
      loading,
      signIn,
      signOut,
      isManager,
      isTechnician,
      isDriver,
      isYardManager,
      isSales,
      isSuperAdmin,
      selectedBranch,
      setSelectedBranch,
    }),
    [authUser, loading, isManager, isTechnician, isDriver, isYardManager, isSales, isSuperAdmin, selectedBranch, signIn, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}