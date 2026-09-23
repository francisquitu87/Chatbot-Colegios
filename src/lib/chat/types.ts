export type MessageRole = 'user' | 'assistant'

export type GeneratedFile = {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
  version: number
  parent_generated_file_id?: string
}

export type ChatMessage = {
  id: string
  role: MessageRole
  content: string
  generatedFiles?: GeneratedFile[]
  status?: 'streaming' | 'complete' | 'error' | 'cancelled'
}

export type ChatError = {
  code: string
  message: string
}

export type StreamEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_start'; toolName: string; callId: string }
  | { type: 'tool_end'; toolName: string; callId: string; success: boolean }
  | { type: 'file_generated'; file: GeneratedFile }
  | { type: 'tool_call'; toolName: string; callId: string; arguments?: unknown }
  | { type: 'tool_result'; toolName: string; callId: string; result?: unknown }
  | { type: 'file'; fileId: string; filename: string; mimeType: string; url?: string }
  | { type: 'image'; fileId: string; mimeType: string; url?: string }
  | { type: 'done'; responseId?: string }
  | { type: 'error'; error: ChatError }
