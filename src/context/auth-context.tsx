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
    console.debug(`[Auth] loadEmployee: Starting for user ${userId} (request ${requestId})`)

    try {
      console.debug(`[Auth] loadEmployee: Querying employees table for auth_user_id=${userId}`)
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

      if (latestRequestIdRef.current !== requestId || latestUserIdRef.current !== userId) {
        console.debug(`[Auth] Ignoring stale employee request ${requestId} for user ${userId}`)
        return
      }

      if (error) {
        console.error('[Auth] Employee lookup query error:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        })
        clearAuth()
        return
      }

      if (!emp) {
        console.error('[Auth] Employee record not found for user:', userId)
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
      console.info(`[Auth] Employee loaded: ${employee.first_name} ${employee.last_name} (ID: ${employee.id})`)
    } catch (err) {
      if (latestRequestIdRef.current === requestId) {
        console.error('[Auth] Employee lookup exception:', {
          name: err instanceof Error ? err.name : 'Unknown',
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        })
        clearAuth()
      }
    } finally {
      if (latestRequestIdRef.current === requestId) {
        console.debug(`[Auth] loadEmployee: Setting loading=false for request ${requestId}`)
        setLoading(false)
      } else {
        console.debug(`[Auth] loadEmployee: Skipping loading=false for stale request ${requestId} (current: ${latestRequestIdRef.current})`)
      }
    }
  }, [clearAuth, supabase])

  useEffect(() => {
    let mounted = true
    let timeoutId: NodeJS.Timeout | null = null

    const bootstrap = async () => {
      try {
        console.debug('[Auth] Bootstrap: Starting session restoration')
        
        const { data, error } = await supabase.auth.getSession()
        console.debug('[Auth] Bootstrap: getSession result:', {
          hasSession: !!data.session,
          hasUser: !!data.session?.user,
          userId: data.session?.user?.id || 'none',
          error: error?.message || 'none',
        })


        if (!mounted) {
          console.debug('[Auth] Bootstrap: Component unmounted, skipping')
          return
        }

        if (error) {
          console.error('[Auth] Bootstrap: Session retrieval error:', error.message)
          clearAuth()
          return
        }

        if (!data.session?.user) {
          console.debug('[Auth] Bootstrap: No session found, clearing auth')
          clearAuth()
          return
        }

        console.debug('[Auth] Bootstrap: Session found, loading employee data')
        await loadEmployee(data.session.user.id)
      } catch (err) {
        if (mounted) {
          console.error('[Auth] Bootstrap: Unexpected error:', err)
          clearAuth()
        }
      }
    }

    bootstrap()

    // Timeout to prevent indefinite loading state (30 seconds)
    timeoutId = setTimeout(() => {
      if (mounted) {
        console.warn('[Auth] Bootstrap timeout - still loading after 30s')
        setLoading(false)
      }
    }, 30000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (!mounted) return

      console.debug('[Auth] onAuthStateChange:', {
        event,
        hasSession: !!session,
        userId: session?.user?.id || 'none',
      })

      console.debug('[Auth] Auth state change:', event)

      if (event === 'INITIAL_SESSION') {
          console.debug('[Auth] INITIAL_SESSION event - skipping handler')
        return
      }

      if (session?.user?.id) {
        console.debug('[Auth] Auth state has user, calling loadEmployee')
        try {
          await loadEmployee(session.user.id)
        } catch (err) {
          console.error('[Auth] State change load failed:', err)
          clearAuth()
        }
      } else {
        console.debug('[Auth] Auth state has no user, clearing auth')
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

    // Profile loading is handled by onAuthStateChange(SIGNED_IN) to avoid duplicate requests.
  }, [supabase])

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
