import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type JsonSchema = Record<string, unknown>

export type ToolContext = {
  userId: string
  conversationId: string
  messageId?: string
  toolExecutionId?: string
  supabase: SupabaseClient
  signal?: AbortSignal
}

export type ToolError = {
  code: string
  message: string
}

export type ToolResult = {
  success: boolean
  data?: unknown
  error?: ToolError
}

export type ToolExecution = {
  executionId: string
  toolName: string
  callId: string
  arguments: unknown
  context: ToolContext
  startedAt: string
  finishedAt?: string
  result?: ToolResult
}

export type ToolDefinition = {
  name: string
  description: string
  parameters: JsonSchema
  strict: boolean
  timeoutMs: number
  execute: (argumentsValue: unknown, context: ToolContext) => Promise<unknown>
}
