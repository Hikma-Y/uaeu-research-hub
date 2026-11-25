import { createClient } from '@supabase/supabase-js'
import { createAuthStorage } from './authStorage'

// Read the connection values from the .env file
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Create one Supabase client for the app
export const authStorage = createAuthStorage(window.localStorage, window.sessionStorage)
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { storage: authStorage },
})
