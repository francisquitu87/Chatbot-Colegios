import { useCallback, useEffect, useState } from 'react'
import { createConversation, deleteConversation, listConversations } from '../lib/api/conversations'
import type { Database } from '../lib/supabase/database.types'

type Conversation = Database['public']['Tables']['conversations']['Row']

export function useConversations(enabled: boolean) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!enabled) return
    setIsLoading(true)
    try {
      const next = await listConversations()
      setConversations(next)
      setSelectedId((current) => current ?? next[0]?.id ?? null)
      setError('')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo cargar el historial.') } finally { setIsLoading(false) }
  }, [enabled])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const create = useCallback(async () => {
    const conversation = await createConversation()
    setConversations((current) => [conversation, ...current])
    setSelectedId(conversation.id)
    return conversation
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteConversation(id)
    setConversations((current) => current.filter((conversation) => conversation.id !== id))
    setSelectedId((current) => current === id ? null : current)
  }, [])

  return { conversations, selectedId, setSelectedId, isLoading, error, refresh, create, remove }
}
