import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { createGeneratedFileDownloadUrl } from '../../lib/api/generatedFiles'
import type { GeneratedFile } from '../../lib/chat/types'

type GeneratedFileCardProps = { file: GeneratedFile }

export function GeneratedFileCard({ file }: GeneratedFileCardProps) {
  async function handleDownload() {
    try {
      const signedUrl = await createGeneratedFileDownloadUrl(file.id)
      window.open(signedUrl, '_blank', 'noopener,noreferrer')
    } catch {
      return
    }
  }

  return (
    <div className="generated-file-card" data-generated-file-id={file.id}>
      <span className="generated-file-card__icon">{file.format === 'xlsx' || file.mime_type.includes('spreadsheet') ? <FileSpreadsheet size={17} /> : <FileText size={17} />}</span>
      <div className="generated-file-card__info">
        <strong>{file.filename}</strong>
        <small>v{file.version} · {formatBytes(file.size_bytes)}</small>
      </div>
      <button type="button" className="file-card__action" onClick={() => void handleDownload()} aria-label={`Descargar ${file.filename}`} title="Descargar"><Download size={16} /></button>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
