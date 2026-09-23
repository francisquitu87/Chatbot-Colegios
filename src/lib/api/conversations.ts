import { supabase } from '../supabase/client'
import type { Database } from '../supabase/database.types'

type Conversation = Database['public']['Tables']['conversations']['Row']

function requireSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

export async function createConversation(title = 'Nuevo chat') {
  const client = requireSupabase()
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) throw new Error('La sesión no es válida.')
  const { data, error } = await client.from('conversations').insert({ user_id: userData.user.id, title }).select().single()
  if (error) throw error
  return data
}

export async function listConversations() {
  const { data, error } = await requireSupabase().from('conversations').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return data as Conversation[]
}

export async function getConversation(id: string) {
  const { data, error } = await requireSupabase().from('conversations').select('*').eq('id', id).single()
  if (error) throw error
  return data as Conversation
}

export async function updateConversation(id: string, values: Database['public']['Tables']['conversations']['Update']) {
  const { data, error } = await requireSupabase().from('conversations').update(values).eq('id', id).select().single()
  if (error) throw error
  return data as Conversation
}

export async function deleteConversation(id: string) {
  const { error } = await requireSupabase().from('conversations').delete().eq('id', id)
  if (error) throw error
}
