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

    // Client acting as the person who called the function.
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
    const fullName = String(body.full_name || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const universityId = String(body.university_id || '').trim()
    const role = String(body.role || 'student').toLowerCase()
    const department = String(body.department || '').trim()

    if (!fullName || !email || password.length < 10) {
      throw new Error('Name, email and a password of at least 10 characters are required.')
    }

    if (!/^\d{9}$/.test(universityId)) {
      throw new Error('University ID must contain exactly 9 digits.')
    }

    if (!['student', 'faculty', 'admin'].includes(role)) {
      throw new Error('Invalid role.')
    }

    // Service-role client is used only inside this server-side Edge Function.
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (createError) throw createError

    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id: created.user.id,
        university_id: universityId,
        full_name: fullName,
        email,
        role,
        department,
        account_status: 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (profileError) {
      // Avoid leaving an Auth account without a matching profile if profile creation fails.
      await adminClient.auth.admin.deleteUser(created.user.id)
      throw profileError
    }

    return new Response(JSON.stringify({
      user: { id: created.user.id, email: created.user.email },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message || 'Unable to create user.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
