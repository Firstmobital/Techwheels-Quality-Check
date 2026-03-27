import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Get employee role
  const { data: emp } = await supabase
    .from('employees')
    .select('role_id, roles(code)')
    .eq('auth_user_id', user.id)
    .single()

  const code = (emp?.roles as any)?.code as string | undefined

  if (code === 'PDIQCMGR') redirect('/dashboard')
  if (code === 'TECHNICIAN') redirect('/stock')
  if (code === 'DRIVER') redirect('/delivery')

  // Unknown role - send to stock as fallback
  redirect('/stock')
}
