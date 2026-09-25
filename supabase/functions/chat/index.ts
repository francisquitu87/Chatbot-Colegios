import OpenAI from 'npm:openai@6'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { executeTool } from '../_shared/tools/executor.ts'
import { MAX_TOOL_ROUNDS, toolRegistry } from '../_shared/tools/index.ts'
import type { ToolContext, ToolExecution } from '../_shared/tools/types.ts'

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
])

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin')
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  }

  if (origin && allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}
const maxMessageLength = 8_000
const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini'

type ChatRequest = { conversationId?: unknown; message?: unknown }

type StoredMessage = {
  role: 'user' | 'assistant'
  content: { type?: string; text?: string }
}

type AppEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_start'; toolName: string; callId: string }
  | { type: 'tool_end'; toolName: string; callId: string; success: boolean }
  | { type: 'file_generated'; file: { id: string; filename: string; mime_type: string; format: 'pdf' | 'xlsx'; size_bytes: number; version: number; parent_generated_file_id?: string } }
  | { type: 'done'; responseId?: string }
  | { type: 'error'; error: { code: string; message: string } }

type FunctionCallItem = {
  type: 'function_call'
  call_id: string
  name: string
  arguments: string
  id?: string
}

type FunctionCallArgumentsDelta = { type: 'response.function_call_arguments.delta'; call_id: string; delta: string }
type FunctionCallArgumentsDone = { type: 'response.function_call_arguments.done'; call_id: string; arguments: string }

function isGeneratedFileResult(value: unknown): value is { generated_file_id: string; filename: string; version: number; parent_generated_file_id?: string; mime_type: string; format: 'pdf' | 'xlsx'; size_bytes: number } {
  return typeof value === 'object' && value !== null && typeof (value as { generated_file_id?: unknown }).generated_file_id === 'string' && typeof (value as { filename?: unknown }).filename === 'string' && typeof (value as { version?: unknown }).version === 'number' && typeof (value as { mime_type?: unknown }).mime_type === 'string' && ((value as { format?: unknown }).format === 'pdf' || (value as { format?: unknown }).format === 'xlsx') && typeof (value as { size_bytes?: unknown }).size_bytes === 'number'
}

function isArtifactTool(toolName: string) {
  return toolName === 'generate_pdf' || toolName === 'revise_generated_document' || toolName === 'generate_excel'
}

const assistantInstructions = `You are CSFR Assistant. Generated files are represented by the application UI. Never generate Markdown download links for generated files, never invent URLs, and never use localhost or 127.0.0.1 as file links. After creating a PDF or XLSX, briefly confirm the operation and let the file card handle downloading. Preserve unrequested document content when revising. Use revise_generated_document only for revisions of existing generated PDFs. Use generate_excel only for explicit initial Excel generation, using only data provided by the user or conversation and never inventing factual spreadsheet data.`

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers })
}

function streamEvent(event: AppEvent) {
  return `data: ${JSON.stringify(event)}\n\n`
}

function errorEvent(code: string, message: string) {
  return streamEvent({ type: 'error', error: { code, message } })
}

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request)
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: { code: 'method_not_allowed', message: 'Usa POST para conversar.' } }, 405, corsHeaders)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: { code: 'unauthenticated', message: 'Se requiere autenticación.' } }, 401, corsHeaders)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: { code: 'server_configuration_error', message: 'La autenticación del servidor no está configurada.' } }, 500, corsHeaders)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return jsonResponse({ error: { code: 'unauthenticated', message: 'La sesión no es válida.' } }, 401, corsHeaders)
  }

  let body: ChatRequest
  try {
    body = await request.json() as ChatRequest
  } catch {
    return jsonResponse({ error: { code: 'invalid_json', message: 'El cuerpo debe ser JSON válido.' } }, 400, corsHeaders)
  }

  if (typeof body.message !== 'string' || !body.message.trim()) {
    return jsonResponse({ error: { code: 'invalid_message', message: 'El mensaje no puede estar vacío.' } }, 400, corsHeaders)
  }
  if (typeof body.conversationId !== 'string' || !body.conversationId.trim()) {
    return jsonResponse({ error: { code: 'invalid_conversation', message: 'Se requiere una conversación válida.' } }, 400, corsHeaders)
  }
  if (body.message.length > maxMessageLength) {
    return jsonResponse({ error: { code: 'message_too_long', message: `El mensaje supera el límite de ${maxMessageLength} caracteres.` } }, 413, corsHeaders)
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: { code: 'server_configuration_error', message: 'OPENAI_API_KEY no está configurada.' } }, 500, corsHeaders)
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', body.conversationId)
    .eq('user_id', userData.user.id)
    .single()
  if (conversationError || !conversation) {
    return jsonResponse({ error: { code: 'conversation_not_found', message: 'La conversación no existe o no te pertenece.' } }, 404, corsHeaders)
  }

  const { error: userMessageError } = await supabase.from('messages').insert({
    conversation_id: conversation.id,
    user_id: userData.user.id,
    role: 'user',
    content: { type: 'text', text: body.message.trim() },
    status: 'completed',
  })
  if (userMessageError) {
    return jsonResponse({ error: { code: 'message_persist_failed', message: 'No se pudo guardar el mensaje.' } }, 500, corsHeaders)
  }

  const { data: storedMessages, error: historyError } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversation.id)
    .in('role', ['user', 'assistant'])
    .eq('status', 'completed')
    .order('created_at', { ascending: true })
  if (historyError) {
    return jsonResponse({ error: { code: 'history_load_failed', message: 'No se pudo cargar el historial.' } }, 500, corsHeaders)
  }

  const { data: generatedArtifacts } = await supabase
    .from('generated_files')
    .select('id, filename, mime_type, version, created_at, source_definition')
    .eq('conversation_id', conversation.id)
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const assistantInsert = await supabase.from('messages').insert({
    conversation_id: conversation.id,
    user_id: userData.user.id,
    role: 'assistant',
    content: { type: 'text', text: '' },
    status: 'pending',
  }).select('id').single()
  if (assistantInsert.error || !assistantInsert.data) {
    return jsonResponse({ error: { code: 'message_persist_failed', message: 'No se pudo preparar la respuesta.' } }, 500, corsHeaders)
  }

  let assistantText = ''
  try {
    const openai = new OpenAI({ apiKey })
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const artifactContext = (generatedArtifacts ?? []).map((artifact) => ({
            id: artifact.id,
            filename: artifact.filename,
            type: artifact.mime_type,
            version: artifact.version,
            created_at: artifact.created_at,
            editable: artifact.source_definition !== null,
            blocks: artifact.source_definition && typeof artifact.source_definition === 'object' && 'document' in artifact.source_definition && typeof artifact.source_definition.document === 'object' && artifact.source_definition.document !== null && 'blocks' in artifact.source_definition.document && Array.isArray(artifact.source_definition.document.blocks)
              ? artifact.source_definition.document.blocks.map((block) => ({ id: block.id, heading: block.heading }))
              : [],
            historical_blocks: (generatedArtifacts ?? []).flatMap((candidate) => candidate.source_definition && typeof candidate.source_definition === 'object' && 'document' in candidate.source_definition && typeof candidate.source_definition.document === 'object' && candidate.source_definition.document !== null && 'blocks' in candidate.source_definition.document && Array.isArray(candidate.source_definition.document.blocks)
              ? candidate.source_definition.document.blocks.map((block) => ({ id: block.id, heading: block.heading, artifact_id: candidate.id, version: candidate.version }))
              : []).filter((block, index, blocks) => blocks.findIndex((candidate) => candidate.id === block.id) === index),
          }))
          const inputItems: unknown[] = [
            { role: 'developer', content: `${assistantInstructions}\n\nGenerated artifacts in this conversation:\n${JSON.stringify(artifactContext)}` },
            ...(storedMessages as StoredMessage[]).map((storedMessage) => ({
            role: storedMessage.role,
            content: storedMessage.content.text ?? '',
            })),
          ]
          const context: ToolContext = { userId: userData.user.id, conversationId: conversation.id, messageId: assistantInsert.data.id, supabase, signal: request.signal }
          let responseId: string | undefined
          let artifactExecution: ToolExecution | null = null

          for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
            const response = await openai.responses.create({
              model,
              input: inputItems,
              tools: toolRegistry.definitions(),
              tool_choice: 'auto',
              parallel_tool_calls: true,
              stream: true,
            }, { signal: request.signal })

            let outputItems: unknown[] = []
            const streamedArguments = new Map<string, string>()
            for await (const event of response) {
              if (event.type === 'response.output_text.delta') {
                assistantText += event.delta
                controller.enqueue(encoder.encode(streamEvent({ type: 'text_delta', content: event.delta })))
              } else if (event.type === 'response.function_call_arguments.delta') {
                const argumentEvent = event as FunctionCallArgumentsDelta
                streamedArguments.set(argumentEvent.call_id, `${streamedArguments.get(argumentEvent.call_id) ?? ''}${argumentEvent.delta}`)
              } else if (event.type === 'response.function_call_arguments.done') {
                const argumentEvent = event as FunctionCallArgumentsDone
                streamedArguments.set(argumentEvent.call_id, argumentEvent.arguments)
              } else if (event.type === 'response.completed') {
                responseId = event.response.id
                outputItems = event.response.output as unknown[]
              }
            }

            const functionCalls = outputItems
              .filter((item): item is FunctionCallItem => typeof item === 'object' && item !== null && (item as { type?: string }).type === 'function_call')
              .map((call) => ({ ...call, arguments: streamedArguments.get(call.call_id) ?? call.arguments }))
            if (functionCalls.length === 0) {
              await supabase.from('messages').update({
                content: { type: 'text', text: assistantText },
                status: 'completed',
                openai_response_id: responseId,
              }).eq('id', assistantInsert.data.id).eq('user_id', userData.user.id)
              controller.enqueue(encoder.encode(streamEvent({ type: 'done', responseId })))
              controller.close()
              return
            }

            inputItems.push(...outputItems)
            const outputs: Array<{ type: 'function_call_output'; call_id: string; output: string }> = []
            for (const call of functionCalls) {
              controller.enqueue(encoder.encode(streamEvent({ type: 'tool_start', toolName: call.name, callId: call.call_id })))
              const reusedArtifact = isArtifactTool(call.name) && artifactExecution?.result?.success === true
              const execution = reusedArtifact ? { ...artifactExecution!, callId: call.call_id } : await executeTool(toolRegistry, call.name, call.arguments, context, call.call_id)
              controller.enqueue(encoder.encode(streamEvent({ type: 'tool_end', toolName: call.name, callId: call.call_id, success: execution.result?.success === true })))
              await supabase.from('messages').insert({
                conversation_id: conversation.id,
                user_id: userData.user.id,
                role: 'tool',
                content: {
                  type: 'tool_result',
                  toolName: call.name,
                  callId: call.call_id,
                  success: execution.result?.success === true,
                  errorCode: execution.result?.error?.code,
                  generatedFileId: isGeneratedFileResult(execution.result?.data) ? execution.result.data.generated_file_id : undefined,
                },
                status: 'completed',
              })
              if (!reusedArtifact && execution.result?.success && isGeneratedFileResult(execution.result.data)) {
                artifactExecution = execution
                controller.enqueue(encoder.encode(streamEvent({
                  type: 'file_generated',
                  file: { id: execution.result.data.generated_file_id, filename: execution.result.data.filename, mime_type: execution.result.data.mime_type, format: execution.result.data.format, size_bytes: execution.result.data.size_bytes, version: execution.result.data.version, ...(execution.result.data.parent_generated_file_id ? { parent_generated_file_id: execution.result.data.parent_generated_file_id } : {}) },
                })))
              }
              outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(execution.result) })
            }
            inputItems.push(...outputs)
          }

          await supabase.from('messages').update({ status: 'failed', content: { type: 'text', text: assistantText } }).eq('id', assistantInsert.data.id).eq('user_id', userData.user.id)
          controller.enqueue(encoder.encode(errorEvent('tool_loop_limit', 'The tool execution limit was reached.')))
          controller.close()
        } catch {
          const status = request.signal.aborted ? 'cancelled' : 'failed'
          await supabase.from('messages').update({ status, content: { type: 'text', text: assistantText } }).eq('id', assistantInsert.data.id).eq('user_id', userData.user.id)
          if (!request.signal.aborted) controller.enqueue(encoder.encode(errorEvent('generation_failed', 'La generación de respuesta falló.')))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: { ...corsHeaders, ...baseCorsHeaders, 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Content-Type': 'text/event-stream' },
    })
  } catch {
    const status = request.signal.aborted ? 'cancelled' : 'failed'
    await supabase.from('messages').update({ status, content: { type: 'text', text: assistantText } }).eq('id', assistantInsert.data.id).eq('user_id', userData.user.id)
    return jsonResponse({ error: { code: 'openai_request_failed', message: 'No se pudo generar la respuesta.' } }, 502, corsHeaders)
  }
})
