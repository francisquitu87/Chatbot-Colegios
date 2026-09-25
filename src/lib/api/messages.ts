import { supabase } from '../supabase/client'
import type { ChatMessage, GeneratedFile, MessageRole } from '../chat/types'
import { listGeneratedFiles } from './generatedFiles'
import type { Database, Json } from '../supabase/database.types'

type MessageRow = Database['public']['Tables']['messages']['Row']

function requireSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

function textFromContent(content: Json) {
  if (typeof content === 'object' && content !== null && !Array.isArray(content) && 'text' in content && typeof content.text === 'string') return content.text
  return ''
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await requireSupabase().from('messages').select('*').eq('conversation_id', conversationId).in('role', ['user', 'assistant']).order('created_at', { ascending: true })
  if (error) throw error
  const generatedFiles = await listGeneratedFiles(conversationId)
  const filesByMessage = new Map<string, Map<string, GeneratedFile>>()
  for (const file of generatedFiles) {
    if (!file.message_id) continue
    const files = filesByMessage.get(file.message_id) ?? new Map<string, GeneratedFile>()
    files.set(file.id, { id: file.id, filename: file.filename, mime_type: file.mime_type, size_bytes: file.size_bytes, version: file.version, format: file.mime_type.includes('spreadsheet') ? 'xlsx' : 'pdf', ...(file.parent_generated_file_id ? { parent_generated_file_id: file.parent_generated_file_id } : {}) })
    filesByMessage.set(file.message_id, files)
  }
  return (data as MessageRow[]).map((message) => ({ id: message.id, role: message.role as MessageRole, content: textFromContent(message.content), generatedFiles: filesByMessage.has(message.id) ? [...filesByMessage.get(message.id)!.values()] : undefined, status: message.status === 'completed' ? 'complete' : message.status === 'streaming' ? 'streaming' : message.status === 'failed' ? 'error' : undefined }))
}

export async function insertMessage(input: { conversationId: string; userId: string; role: MessageRole; content: string; status?: Database['public']['Tables']['messages']['Insert']['status'] }) {
  const { data, error } = await requireSupabase().from('messages').insert({ conversation_id: input.conversationId, user_id: input.userId, role: input.role, content: { type: 'text', text: input.content }, status: input.status ?? 'completed' }).select().single()
  if (error) throw error
  return data
}

export async function updateMessage(id: string, values: Database['public']['Tables']['messages']['Update']) {
  const { data, error } = await requireSupabase().from('messages').update(values).eq('id', id).select().single()
  if (error) throw error
  return data
}
