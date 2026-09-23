import { useCallback, useEffect, useState } from 'react'
import { listMessages } from '../lib/api/messages'
import type { ChatMessage } from '../lib/chat/types'

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(Boolean(conversationId))
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!conversationId) return
    setIsLoading(true)
    try { setMessages(await listMessages(conversationId)); setError('') } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudieron cargar los mensajes.') } finally { setIsLoading(false) }
  }, [conversationId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  return { messages: conversationId ? messages : [], setMessages, isLoading, error, refresh }
}
