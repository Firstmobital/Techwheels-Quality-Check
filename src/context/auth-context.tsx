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
  isSuperAdmin: boolean
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
  isSuperAdmin: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
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
      // Wrap query in a timeout promise to prevent hanging
      const queryPromise = supabase
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

      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'Query timeout' } }), 15000)
      )

      const { data: emp, error } = await Promise.race([queryPromise, timeoutPromise])

      if (latestRequestIdRef.current !== requestId || latestUserIdRef.current !== userId) {
        return
      }

      if (error || !emp) {
        console.error('Employee lookup failed:', error?.message)
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
    } catch (err) {
      if (latestRequestIdRef.current === requestId) {
        console.error('Employee lookup failed:', err)
        clearAuth()
      }
    } finally {
      if (latestRequestIdRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [clearAuth, supabase])

  useEffect(() => {
    let mounted = true
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null

    // Safety timeout: if loading is still true after 25 seconds, force clear it
    const safetyTimeout = () => {
      timeoutHandle = setTimeout(() => {
        if (mounted && loading) {
          console.warn('Auth loading timeout exceeded, forcing completion')
          clearAuth()
        }
      }, 25000)
    }

    const bootstrap = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (!mounted) return

      if (error || !data.session?.user) {
        clearAuth()
        return
      }

      await loadEmployee(data.session.user.id)
    }

    safetyTimeout()
    bootstrap()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (!mounted) return

      if (event === 'INITIAL_SESSION') {
        return
      }

      if (session?.user?.id) {
        try {
          await loadEmployee(session.user.id)
        } catch (err) {
          console.error('Auth state load failed:', err)
          clearAuth()
        }
      } else {
        clearAuth()
      }
    })

    return () => {
      mounted = false
      if (timeoutHandle) clearTimeout(timeoutHandle)
      subscription.unsubscribe()
    }
  }, [clearAuth, loadEmployee, supabase])

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

    await loadEmployee(data.user.id)
  }, [loadEmployee, supabase])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      throw new Error(error.message)
    }

    clearAuth()
  }, [clearAuth, supabase])

  const roleCode = authUser?.role?.code ?? ''
  const superAdmin = authUser?.isSuperAdmin ?? false

  const isSuperAdmin = superAdmin || FULL_ACCESS_CODES.has(roleCode)
  const isManager = isSuperAdmin || roleCode === 'PDIQCMGR'
  const isTechnician = !isSuperAdmin && roleCode === 'TECHNICIAN'
  const isDriver = !isSuperAdmin && roleCode === 'DRIVER'

  const value = useMemo(
    () => ({
      authUser,
      loading,
      signIn,
      signOut,
      isManager,
      isTechnician,
      isDriver,
      isSuperAdmin,
    }),
    [authUser, loading, isManager, isTechnician, isDriver, isSuperAdmin]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
