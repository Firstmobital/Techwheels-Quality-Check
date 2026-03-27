'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AuthUser, Employee, Role, Location } from '@/types'

interface AuthContextValue {
  authUser: AuthUser | null
  loading: boolean
  signOut: () => Promise<void>
  isManager: boolean
  isTechnician: boolean
  isDriver: boolean
  isSuperAdmin: boolean
  locationName: string | null
}

const AuthContext = createContext<AuthContextValue>({
  authUser: null,
  loading: true,
  signOut: async () => {},
  isManager: false,
  isTechnician: false,
  isDriver: false,
  isSuperAdmin: false,
  locationName: null,
})

// Any of these role codes gets full manager-level access
const FULL_ACCESS_CODES = new Set(['PDIQCMGR', 'ADMIN', 'SUPER_ADMIN', 'HR', 'GM'])

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [loading, setLoading]   = useState(true)
  const router                  = useRouter()
  // Prevent getSession + onAuthStateChange both triggering loadEmployee
  const loadedRef               = useRef(false)
  const supabase                = createClient()

  const loadEmployee = useCallback(async (userId: string) => {
    if (loadedRef.current) return
    loadedRef.current = true

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

    if (error || !emp) {
      console.error('Employee lookup failed:', error?.message)
      setAuthUser(null)
      setLoading(false)
      return
    }

    const employee = emp as unknown as Employee & {
      role: Role
      location: Location
      is_super_admin: boolean
    }

    setAuthUser({
      employee,
      role:        employee.role,
      location:    employee.location ?? null,
      isSuperAdmin: employee.is_super_admin ?? false,
    })
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately on mount —
    // this replaces the need for a separate getSession() call, saving one round trip.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          loadEmployee(session.user.id)
        } else {
          loadedRef.current = false
          setAuthUser(null)
          setLoading(false)
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [loadEmployee, supabase])

  const signOut = async () => {
    await supabase.auth.signOut()
    loadedRef.current = false
    setAuthUser(null)
    router.push('/login')
  }

  const roleCode   = authUser?.role?.code ?? ''
  const superAdmin = authUser?.isSuperAdmin ?? false

  const isSuperAdmin  = superAdmin || FULL_ACCESS_CODES.has(roleCode)
  const isManager     = isSuperAdmin || roleCode === 'PDIQCMGR'
  const isTechnician  = !isSuperAdmin && roleCode === 'TECHNICIAN'
  const isDriver      = !isSuperAdmin && roleCode === 'DRIVER'
  const locationName  = authUser?.location?.name ?? null

  return (
    <AuthContext.Provider value={{
      authUser, loading, signOut,
      isManager, isTechnician, isDriver, isSuperAdmin, locationName,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
