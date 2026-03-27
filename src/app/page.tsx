import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const FULL_ACCESS_CODES = new Set(['PDIQCMGR', 'ADMIN', 'SUPER_ADMIN', 'HR', 'GM'])

export default async function RootPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: emp } = await supabase
    .from('employees')
    .select('is_super_admin, role:roles(code)')
    .eq('auth_user_id', user.id)
    .single()

  const code       = (emp?.role as any)?.code as string | undefined
  const superAdmin = !!(emp as any)?.is_super_admin

  if (superAdmin || (code && FULL_ACCESS_CODES.has(code))) redirect('/dashboard')
  if (code === 'TECHNICIAN') redirect('/stock')
  if (code === 'DRIVER')     redirect('/delivery')

  redirect('/dashboard')
}
