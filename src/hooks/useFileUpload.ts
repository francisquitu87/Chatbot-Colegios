import { useCallback, useState } from 'react'
import { uploadFile } from '../lib/api/files'
import { validateFile } from '../lib/files/types'
import type { UploadState } from '../lib/files/types'

export function useFileUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState('')

  const selectFile = useCallback((file: File | null) => {
    if (!file) return
    const validationError = validateFile(file)
    setError(validationError ?? '')
    setState(validationError ? 'error' : 'idle')
    setSelectedFile(validationError ? null : file)
  }, [])

  const clearFile = useCallback(() => {
    setSelectedFile(null)
    setState('idle')
    setError('')
  }, [])

  const upload = useCallback(async (conversationId: string | null) => {
    if (!selectedFile) return null
    setState('uploading')
    setError('')
    try {
      const uploaded = await uploadFile(selectedFile, conversationId)
      setSelectedFile(null)
      setState('success')
      return uploaded
    } catch (caught) {
      setState('error')
      setError(caught instanceof Error ? caught.message : 'No se pudo subir el archivo.')
      return null
    }
  }, [selectedFile])

  return { selectedFile, state, error, selectFile, clearFile, upload }
}
