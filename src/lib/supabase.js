import { createClient } from '@supabase/supabase-js'

// Read the connection values from the .env file
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Create one Supabase client for the app
export const supabase = createClient(supabaseUrl, supabaseKey)