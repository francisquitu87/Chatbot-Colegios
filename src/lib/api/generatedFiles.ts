import { supabase } from '../supabase/client'
import type { GeneratedFile } from '../chat/types'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

export async function listGeneratedFiles(conversationId: string) {
  const { data, error } = await requireSupabase()
    .from('generated_files')
    .select('id, filename, mime_type, size_bytes, message_id, version, parent_generated_file_id')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as Array<GeneratedFile & { message_id: string | null }>
}

export async function createGeneratedFileDownloadUrl(fileId: string, expiresIn = 300) {
  const client = requireSupabase()
  const { data: file, error: fileError } = await client
    .from('generated_files')
    .select('storage_bucket, storage_path')
    .eq('id', fileId)
    .single()
  if (fileError || !file) throw new Error('Archivo generado no encontrado o sin permisos.')
  const { data, error } = await client.storage.from(file.storage_bucket).createSignedUrl(file.storage_path, expiresIn)
  if (error || !data?.signedUrl) throw new Error('No se pudo generar la descarga segura.')
  if (data.signedUrl.startsWith('http')) return data.signedUrl
  const storageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1`
  return `${storageUrl}${data.signedUrl.startsWith('/') ? data.signedUrl : `/${data.signedUrl}`}`
}
