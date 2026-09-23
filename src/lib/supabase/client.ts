import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient<Database>(supabaseUrl, supabasePublishableKey)
    : null

export function getSupabaseConfigError() {
  if (supabase) return null

  return 'Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY para conectar Supabase.'
}
