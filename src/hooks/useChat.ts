import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase/client'
import type { ChatError, ChatMessage, GeneratedFile, StreamEvent } from '../lib/chat/types'

const functionUrl = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`
  : null

function createId() {
  return crypto.randomUUID()
}

function parseStreamBuffer(buffer: string) {
  const events: StreamEvent[] = []
  const chunks = buffer.split('\n\n')

  for (const chunk of chunks.slice(0, -1)) {
    const data = chunk
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('')

    if (!data) continue
    events.push(JSON.parse(data) as StreamEvent)
  }

  return { events, remainder: chunks.at(-1) ?? '' }
}

export function useChat(conversationId: string | null, loadedMessages: ChatMessage[]) {
  const [messages, setMessages] = useState<ChatMessage[]>(loadedMessages)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<ChatError | null>(null)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMessages(deduplicateGeneratedFiles(loadedMessages))
      setError(null)
      setActiveTool(null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [conversationId, loadedMessages])

  const updateAssistant = useCallback((id: string, content: string, status?: ChatMessage['status'], generatedFiles?: GeneratedFile[]) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, content, ...(generatedFiles ? { generatedFiles } : {}), ...(status ? { status } : {}) } : message,
      ),
    )
  }, [])

  const upsertGeneratedFile = useCallback((files: GeneratedFile[], file: GeneratedFile) => {
    const index = files.findIndex((candidate) => candidate.id === file.id)
    if (index < 0) return [...files, file]
    const next = [...files]
    next[index] = file
    return next
  }, [])

  const handleEvent = useCallback(
    (event: StreamEvent, assistantId: string, content: { value: string; generatedFiles: GeneratedFile[] }) => {
      if (event.type === 'text_delta') {
        content.value += event.content
        updateAssistant(assistantId, content.value, 'streaming', content.generatedFiles)
      } else if (event.type === 'tool_start') {
        setActiveTool(event.toolName)
      } else if (event.type === 'tool_end') {
        setActiveTool(null)
      } else if (event.type === 'file_generated') {
        content.generatedFiles = upsertGeneratedFile(content.generatedFiles, event.file)
        updateAssistant(assistantId, content.value, 'streaming', content.generatedFiles)
      } else if (event.type === 'done') {
        setActiveTool(null)
        updateAssistant(assistantId, content.value, 'complete', content.generatedFiles)
      } else if (event.type === 'error') {
        setActiveTool(null)
        setError(event.error)
        updateAssistant(assistantId, content.value, 'error', content.generatedFiles)
      }
    },
    [updateAssistant, upsertGeneratedFile],
  )

  const sendMessage = useCallback(
    async (messageText = input) => {
      const message = messageText.trim()
      if (!message || isLoading) return
      if (!supabase || !functionUrl) {
        setError({ code: 'configuration_error', message: 'Supabase no está configurado en el frontend.' })
        return
      }
      if (!conversationId) {
        setError({ code: 'conversation_required', message: 'Crea o selecciona una conversación.' })
        return
      }

      setError(null)
      setInput('')
      setIsLoading(true)
      const assistantId = createId()
      const content = { value: '', generatedFiles: [] as GeneratedFile[] }

      setMessages((current) => [
        ...current,
        { id: createId(), role: 'user', content: message, status: 'complete' },
        { id: assistantId, role: 'assistant', content: '', status: 'streaming' },
      ])

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError || !sessionData.session) {
          throw { code: 'unauthenticated', message: 'Inicia sesión para conversar con el asistente.' }
        }

        const response = await fetch(functionUrl, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${sessionData.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ conversationId, message }),
        })

        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => null)) as { error?: ChatError } | null
          throw body?.error ?? { code: 'chat_request_failed', message: 'No se pudo iniciar la conversación.' }
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parsed = parseStreamBuffer(buffer)
          buffer = parsed.remainder
          parsed.events.forEach((event) => handleEvent(event, assistantId, content))
        }

        buffer += decoder.decode()
        const finalBuffer = parseStreamBuffer(`${buffer}\n\n`)
        finalBuffer.events.forEach((event) => handleEvent(event, assistantId, content))
      } catch (caughtError) {
        if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
          updateAssistant(assistantId, content.value, 'cancelled')
        } else {
          const chatError = isChatError(caughtError)
            ? caughtError
            : {
                code: 'request_failed',
                message: caughtError instanceof Error ? caughtError.message : String(caughtError),
              }
          setError(chatError)
          updateAssistant(assistantId, content.value, 'error')
        }
      } finally {
        abortRef.current = null
        setIsLoading(false)
      }
    },
    [conversationId, handleEvent, input, isLoading, updateAssistant],
  )

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { messages, input, setInput, sendMessage, stopGeneration, isLoading, error, activeTool }
}

function isChatError(value: unknown): value is ChatError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof value.code === 'string' &&
    typeof value.message === 'string'
  )
}

function deduplicateGeneratedFiles(messages: ChatMessage[]) {
  const seen = new Set<string>()
  return messages.map((message) => {
    if (!message.generatedFiles?.length) return message
    const generatedFiles = message.generatedFiles.filter((file) => {
      if (seen.has(file.id)) return false
      seen.add(file.id)
      return true
    })
    return { ...message, generatedFiles }
  })
}
