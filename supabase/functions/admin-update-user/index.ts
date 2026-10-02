import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authorization = req.headers.get('Authorization') || ''
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    })

    const { data: callerData, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !callerData.user) {
      return new Response(JSON.stringify({ error: 'Authentication required.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: callerProfile } = await callerClient
      .from('profiles')
      .select('role, account_status')
      .eq('id', callerData.user.id)
      .single()

    if (callerProfile?.role !== 'admin' || (callerProfile?.account_status || 'active') !== 'active') {
      return new Response(JSON.stringify({ error: 'Administrator access required.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const userId = String(body.user_id || '')
    const fullName = String(body.full_name || '').trim()
    const email = String(body.email || '').trim().toLowerCase()

    if (!userId || !fullName || !email) {
      throw new Error('A user ID, name and email are required.')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Enter a valid email address.')
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(userId)
    if (targetError) throw targetError
    if (!targetData.user) throw new Error('The selected user was not found.')

    const oldUser = targetData.user
    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
      user_metadata: { ...oldUser.user_metadata, full_name: fullName },
    })
    if (authError) throw authError

    const { error: profileError } = await adminClient
      .from('profiles')
      .update({ full_name: fullName, email, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (profileError) {
      const { error: rollbackError } = await adminClient.auth.admin.updateUserById(userId, {
        email: oldUser.email,
        email_confirm: true,
        user_metadata: oldUser.user_metadata,
      })
      if (rollbackError) {
        throw new Error(`Profile update failed (${profileError.message}); Auth rollback also failed (${rollbackError.message}).`)
      }
      throw profileError
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message || 'Unable to update user.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
