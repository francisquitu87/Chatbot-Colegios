import { useCallback, useEffect, useState } from 'react'
import { deleteFile, listFiles } from '../lib/api/files'
import type { ChatFile } from '../lib/files/types'

export function useConversationFiles(conversationId: string | null) {
  const [files, setFiles] = useState<ChatFile[]>([])
  const [isLoading, setIsLoading] = useState(Boolean(conversationId))
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!conversationId) { setFiles([]); return }
    setIsLoading(true)
    try { setFiles(await listFiles(conversationId)); setError('') } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudieron cargar los archivos.') } finally { setIsLoading(false) }
  }, [conversationId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const remove = useCallback(async (id: string) => {
    await deleteFile(id)
    setFiles((current) => current.filter((file) => file.id !== id))
  }, [])

  return { files: conversationId ? files : [], isLoading, error, refresh, remove }
}
