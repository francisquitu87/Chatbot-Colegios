import { useEffect, useState } from 'react'
import { Download, FileText, Image, Trash2 } from 'lucide-react'
import { createFileDownloadUrl } from '../../lib/api/files'
import { formatFileSize } from '../../lib/files/types'
import type { ChatFile } from '../../lib/files/types'

type FileListProps = { files: ChatFile[]; onDelete: (id: string) => void }

export function FileList({ files, onDelete }: FileListProps) {
  if (!files.length) return null
  return <div className="file-list" aria-label="Archivos adjuntos">{files.map((file) => <FileCard key={file.id} file={file} onDelete={onDelete} />)}</div>
}

function FileCard({ file, onDelete }: { file: ChatFile; onDelete: (id: string) => void }) {
  const [url, setUrl] = useState('')
  const isImage = file.mime_type.startsWith('image/')

  useEffect(() => {
    if (!isImage) return
    let active = true
    void createFileDownloadUrl(file.id).then((signedUrl) => { if (active) setUrl(signedUrl) }).catch(() => undefined)
    return () => { active = false }
  }, [file.id, isImage])

  return (
    <article className="file-card">
      {isImage && url ? <img className="file-card__thumbnail" src={url} alt="" /> : isImage ? <span className="file-card__icon"><Image size={19} /></span> : <span className="file-card__icon"><FileText size={19} /></span>}
      <div className="file-card__info"><strong>{file.original_name}</strong><small>{formatFileSize(file.size_bytes)}</small></div>
      <button type="button" className="file-card__action" onClick={() => void createFileDownloadUrl(file.id).then((signedUrl) => window.open(signedUrl, '_blank', 'noopener,noreferrer'))} aria-label={`Descargar ${file.original_name}`} title="Descargar"><Download size={16} /></button>
      <button type="button" className="file-card__action file-card__action--delete" onClick={() => void onDelete(file.id)} aria-label={`Eliminar ${file.original_name}`} title="Eliminar"><Trash2 size={16} /></button>
    </article>
  )
}
