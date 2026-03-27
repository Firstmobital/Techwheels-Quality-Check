'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AuthUser, Employee, Role, Location } from '@/types'

interface AuthContextValue {
  authUser: AuthUser | null
  loading: boolean
  signOut: () => Promise<void>
  isManager: boolean
  isTechnician: boolean
  isDriver: boolean
  locationName: string | null
}

const AuthContext = createContext<AuthContextValue>({
  authUser: null,
  loading: true,
  signOut: async () => {},
  isManager: false,
  isTechnician: false,
  isDriver: false,
  locationName: null,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const loadEmployee = useCallback(async (userId: string) => {
    // Fetch employee with role and location in one query
    const { data: emp, error } = await supabase
      .from('employees')
      .select(`
        id, auth_user_id, first_name, last_name, email,
        mobile, role_id, location_id, photo_url, employee_code,
        role:roles ( id, name, code, department_id, is_active ),
        location:locations ( id, name, address, city )
      `)
      .eq('auth_user_id', userId)
      .single()

    if (error || !emp) {
      console.error('Employee load error:', error)
      setAuthUser(null)
      setLoading(false)
      return
    }

    const employee = emp as unknown as Employee & { role: Role; location: Location }

    setAuthUser({
      employee,
      role: employee.role,
      location: employee.location ?? null,
    })
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadEmployee(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          loadEmployee(session.user.id)
        } else {
          setAuthUser(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [loadEmployee, supabase])

  const signOut = async () => {
    await supabase.auth.signOut()
    setAuthUser(null)
    window.location.href = '/login'
  }

  const roleCode = authUser?.role?.code
  const isManager = roleCode === 'PDIQCMGR'
  const isTechnician = roleCode === 'TECHNICIAN'
  const isDriver = roleCode === 'DRIVER'
  const locationName = authUser?.location?.name ?? null

  return (
    <AuthContext.Provider value={{
      authUser, loading, signOut,
      isManager, isTechnician, isDriver, locationName,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
