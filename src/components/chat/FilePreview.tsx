import { X } from 'lucide-react'
import { formatFileSize } from '../../lib/files/types'
import type { UploadState } from '../../lib/files/types'

type FilePreviewProps = { file: File; state: UploadState; error: string; onCancel: () => void; onUpload: () => void }

export function FilePreview({ file, state, error, onCancel, onUpload }: FilePreviewProps) {
  return <div className="file-preview">
    <div><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small>{error && <span className="file-preview__error">{error}</span>}</div>
    <div className="file-preview__actions">
      <button type="button" className="text-button" onClick={onCancel} disabled={state === 'uploading'}>Cancelar</button>
      <button type="button" className="primary-button primary-button--small" onClick={onUpload} disabled={state === 'uploading'}>{state === 'uploading' ? 'Subiendo...' : 'Subir'}</button>
      <button type="button" className="icon-button icon-button--quiet" onClick={onCancel} aria-label="Cerrar vista previa" title="Cerrar"><X size={16} /></button>
    </div>
  </div>
}
