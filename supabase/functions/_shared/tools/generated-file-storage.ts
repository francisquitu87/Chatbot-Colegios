import type { ToolContext } from './types.ts'

export const GENERATED_BUCKET = 'generated-files'
export const MAX_GENERATED_FILE_BYTES = 5 * 1024 * 1024

export function sanitizeGeneratedFilename(value: string, extension: string) {
  const filename = value.normalize('NFKC').replace(/[\\/]/g, '-').replace(/\.\.+/g, '.').replace(/[^a-zA-Z0-9._ -]/g, '-').replace(/\s+/g, ' ').trim()
  const safeName = filename || 'generated-document'
  return safeName.toLowerCase().endsWith(extension) ? safeName : `${safeName}${extension}`
}

export async function persistGeneratedBinary(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
  metadata: Record<string, unknown>,
  context: ToolContext,
) {
  if (bytes.length === 0) throw new Error('GENERATED_FILE_EMPTY')
  if (bytes.length > MAX_GENERATED_FILE_BYTES) throw new Error('GENERATED_FILE_TOO_LARGE')
  if (context.signal?.aborted) throw new Error('TOOL_CANCELLED')

  const fileId = crypto.randomUUID()
  const storagePath = `${context.userId}/${fileId}/${filename}`
  const { error: uploadError } = await context.supabase.storage.from(GENERATED_BUCKET).upload(storagePath, bytes, { contentType: mimeType, upsert: false })
  if (uploadError) throw new Error('GENERATED_FILE_UPLOAD_FAILED')

  const { error: rowError } = await context.supabase.from('generated_files').insert({
    id: fileId,
    user_id: context.userId,
    conversation_id: context.conversationId,
    message_id: context.messageId ?? null,
    tool_execution_id: context.toolExecutionId ?? null,
    storage_bucket: GENERATED_BUCKET,
    storage_path: storagePath,
    filename,
    mime_type: mimeType,
    size_bytes: bytes.length,
    metadata,
  })
  if (rowError) {
    await context.supabase.storage.from(GENERATED_BUCKET).remove([storagePath])
    throw new Error('GENERATED_FILE_METADATA_FAILED')
  }
  return { generated_file_id: fileId, filename, mime_type: mimeType, size_bytes: bytes.length }
}
