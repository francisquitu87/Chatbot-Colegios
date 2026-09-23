import { createClient } from 'npm:@supabase/supabase-js@2'

const bucket = 'chat-files'
const maxFileSize = 6 * 1024 * 1024
const allowedTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin')
  const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  ])
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  }
  if (origin && allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers })
}

function sanitizeFilename(filename: string) {
  if (!filename || filename !== filename.trim() || /[\\/]/.test(filename) || filename === '.' || filename === '..') return null
  const withoutControlChars = [...filename.normalize('NFKC')].filter((character) => {
    const code = character.charCodeAt(0)
    return code > 31 && code !== 127
  }).join('')
  const normalized = withoutControlChars.replace(/[^a-zA-Z0-9._ -]/g, '_')
  const sanitized = normalized.replace(/\s+/g, ' ').trim()
  return sanitized || null
}

function extensionFor(filename: string) {
  const match = filename.toLowerCase().match(/\.[a-z0-9]+$/)
  return match?.[0] ?? null
}

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request)
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: { code: 'method_not_allowed', message: 'Usa POST para subir archivos.' } }, 405, corsHeaders)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: { code: 'unauthenticated', message: 'Se requiere autenticación.' } }, 401, corsHeaders)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) return jsonResponse({ error: { code: 'server_configuration_error', message: 'La autenticación del servidor no está configurada.' } }, 500, corsHeaders)

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return jsonResponse({ error: { code: 'unauthenticated', message: 'La sesión no es válida.' } }, 401, corsHeaders)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonResponse({ error: { code: 'invalid_form', message: 'El upload debe ser multipart/form-data.' } }, 400, corsHeaders)
  }

  const fileValue = form.get('file')
  const conversationValue = form.get('conversationId')
  const file = fileValue instanceof File ? fileValue : null
  const conversationId = typeof conversationValue === 'string' && conversationValue.trim() ? conversationValue.trim() : null
  if (!file) return jsonResponse({ error: { code: 'file_required', message: 'Selecciona un archivo.' } }, 400, corsHeaders)
  if (file.size <= 0 || file.size > maxFileSize) return jsonResponse({ error: { code: 'file_too_large', message: 'El archivo debe pesar entre 1 byte y 6 MB.' } }, 413, corsHeaders)

  const sanitizedName = sanitizeFilename(file.name)
  const extension = sanitizedName ? extensionFor(sanitizedName) : null
  if (!sanitizedName || !extension || !allowedTypes[extension] || file.type !== allowedTypes[extension]) {
    return jsonResponse({ error: { code: 'file_type_not_allowed', message: 'El tipo o nombre del archivo no está permitido.' } }, 415, corsHeaders)
  }

  if (conversationId) {
    const { data: conversation, error } = await supabase.from('conversations').select('id').eq('id', conversationId).eq('user_id', userData.user.id).maybeSingle()
    if (error || !conversation) return jsonResponse({ error: { code: 'conversation_not_found', message: 'La conversación no existe o no te pertenece.' } }, 404, corsHeaders)
  }

  const fileId = crypto.randomUUID()
  const storagePath = `${userData.user.id}/${fileId}/${sanitizedName}`
  const upload = await supabase.storage.from(bucket).upload(storagePath, file, { contentType: file.type, cacheControl: '3600', upsert: false })
  if (upload.error) return jsonResponse({ error: { code: 'storage_upload_failed', message: 'No se pudo guardar el archivo.' } }, 500, corsHeaders)

  const insert = await supabase.from('files').insert({
    id: fileId,
    user_id: userData.user.id,
    conversation_id: conversationId,
    storage_bucket: bucket,
    storage_path: storagePath,
    original_name: file.name,
    sanitized_name: sanitizedName,
    mime_type: file.type,
    size_bytes: file.size,
    extension,
    status: 'uploaded',
    metadata: { original_name: file.name, mime_type: file.type, size_bytes: file.size, extension },
  }).select().single()

  if (insert.error || !insert.data) {
    await supabase.storage.from(bucket).remove([storagePath])
    return jsonResponse({ error: { code: 'metadata_persist_failed', message: 'No se pudo guardar la metadata del archivo.' } }, 500, corsHeaders)
  }

  return jsonResponse({ file: insert.data }, 201, corsHeaders)
})
