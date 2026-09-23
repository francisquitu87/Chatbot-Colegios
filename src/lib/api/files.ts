import { supabase } from '../supabase/client'
import { FILE_BUCKET } from '../files/types'
import type { ChatFile } from '../files/types'

const functionUrl = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/files`
  : null

function requireSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

export async function uploadFile(file: File, conversationId: string | null) {
  const client = requireSupabase()
  if (!functionUrl) throw new Error('La función de archivos no está configurada.')
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError || !sessionData.session) throw new Error('Inicia sesión para subir archivos.')

  const form = new FormData()
  form.append('file', file)
  if (conversationId) form.append('conversationId', conversationId)

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: form,
  })
  const body = await response.json().catch(() => null) as { file?: ChatFile; error?: { message?: string } } | null
  if (!response.ok || !body?.file) throw new Error(body?.error?.message ?? 'No se pudo subir el archivo.')
  return body.file
}

export async function listFiles(conversationId: string | null) {
  let query = requireSupabase().from('files').select('*').eq('status', 'uploaded').order('created_at', { ascending: false })
  if (conversationId) query = query.eq('conversation_id', conversationId)
  else query = query.is('conversation_id', null)
  const { data, error } = await query
  if (error) throw error
  return data as ChatFile[]
}

export async function createFileDownloadUrl(fileId: string, expiresIn = 300) {
  const { data: file, error: fileError } = await requireSupabase().from('files').select('storage_bucket, storage_path').eq('id', fileId).eq('status', 'uploaded').single()
  if (fileError || !file) throw new Error('Archivo no encontrado o sin permisos.')
  const { data, error } = await requireSupabase().storage.from(file.storage_bucket || FILE_BUCKET).createSignedUrl(file.storage_path, expiresIn)
  if (error || !data?.signedUrl) throw new Error('No se pudo generar la descarga segura.')
  return data.signedUrl
}

export async function deleteFile(fileId: string) {
  const client = requireSupabase()
  const { data: file, error: fileError } = await client.from('files').select('storage_bucket, storage_path').eq('id', fileId).eq('status', 'uploaded').single()
  if (fileError || !file) throw new Error('Archivo no encontrado o sin permisos.')

  const { error: storageError } = await client.storage.from(file.storage_bucket || FILE_BUCKET).remove([file.storage_path])
  if (storageError) throw new Error('No se pudo eliminar el archivo del almacenamiento.')

  const { error: rowError } = await client.from('files').delete().eq('id', fileId)
  if (rowError) {
    await client.from('files').update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('id', fileId)
    throw new Error('El archivo fue retirado del almacenamiento, pero su metadata requiere limpieza.')
  }
}
