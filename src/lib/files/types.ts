export const FILE_BUCKET = 'chat-files'
export const MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024

export const ALLOWED_FILE_TYPES = {
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
} as const

export type FileExtension = keyof typeof ALLOWED_FILE_TYPES
export type FileStatus = 'uploading' | 'uploaded' | 'failed' | 'deleted' | 'processing' | 'ready' | 'error'
export type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export type ChatFile = {
  id: string
  user_id: string
  conversation_id: string | null
  storage_bucket: string
  storage_path: string
  original_name: string
  sanitized_name: string
  mime_type: string
  size_bytes: number
  extension: string
  status: FileStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export function getExtension(filename: string): FileExtension | null {
  const match = filename.toLowerCase().match(/\.[a-z0-9]+$/)
  const extension = match?.[0] as FileExtension | undefined
  return extension && extension in ALLOWED_FILE_TYPES ? extension : null
}

export function validateFile(file: File) {
  const extension = getExtension(file.name)
  if (!extension) return 'Tipo de archivo no permitido.'
  if (file.size <= 0) return 'El archivo está vacío.'
  if (file.size > MAX_FILE_SIZE_BYTES) return 'El archivo supera el límite de 6 MB.'
  if (file.type && file.type !== ALLOWED_FILE_TYPES[extension]) return 'El tipo MIME no coincide con la extensión.'
  if (/[\\/]|\.\.?$/.test(file.name) || file.name.trim() !== file.name) return 'El nombre del archivo no es válido.'
  return null
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
