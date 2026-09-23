import { ArrowUp, Paperclip, Square } from 'lucide-react'
import { FilePreview } from './FilePreview'
import type { UploadState } from '../../lib/files/types'

type ChatComposerProps = {
  input: string
  isLoading: boolean
  onInputChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  selectedFile: File | null
  uploadState: UploadState
  uploadError: string
  onSelectFile: (file: File | null) => void
  onCancelFile: () => void
  onUploadFile: () => void
}

export function ChatComposer({ input, isLoading, onInputChange, onSubmit, onStop, selectedFile, uploadState, uploadError, onSelectFile, onCancelFile, onUploadFile }: ChatComposerProps) {
  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {selectedFile && <FilePreview file={selectedFile} state={uploadState} error={uploadError} onCancel={onCancelFile} onUpload={onUploadFile} />}
      {uploadError && !selectedFile && <p className="file-inline-error" role="alert">{uploadError}</p>}
      <label className="attach-button" title="Adjuntar archivo">
        <Paperclip size={18} />
        <input type="file" hidden accept=".pdf,.xlsx,.xls,.csv,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={(event) => { onSelectFile(event.target.files?.[0] ?? null); event.currentTarget.value = '' }} />
      </label>
      <textarea
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        placeholder="Escribe un mensaje..."
        aria-label="Mensaje"
        rows={1}
        disabled={isLoading}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            onSubmit()
          }
        }}
      />
      {isLoading ? (
        <button type="button" className="icon-button icon-button--stop" onClick={onStop} aria-label="Detener generación" title="Detener generación">
          <Square size={16} fill="currentColor" />
        </button>
      ) : (
        <button type="submit" className="icon-button" disabled={!input.trim()} aria-label="Enviar mensaje" title="Enviar mensaje">
          <ArrowUp size={18} />
        </button>
      )}
    </form>
  )
}
