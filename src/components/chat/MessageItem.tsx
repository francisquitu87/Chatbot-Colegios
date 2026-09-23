import type { ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../../lib/chat/types'
import { GeneratedFileCard } from './GeneratedFileCard'

type MessageItemProps = {
  message: ChatMessage
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user'

  return (
    <article className={`message message--${message.role}`}>
      <div className="message__label">{isUser ? 'Tú' : 'Asistente'}</div>
      <div className="message__content">
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: SafeAssistantLink }}>{message.content || ' '}</ReactMarkdown>
        )}
        {message.generatedFiles?.map((file) => <GeneratedFileCard file={file} key={file.id} />)}
        {message.status === 'streaming' && <span className="message__cursor" aria-label="Generando" />}
        {message.status === 'cancelled' && <small className="message__status">Generación detenida</small>}
        {message.status === 'error' && <small className="message__status">No se pudo completar</small>}
      </div>
    </article>
  )
}

function SafeAssistantLink({ href, children, ...props }: ComponentProps<'a'>) {
  const label = typeof children === 'string' ? children : ''
  const isLocalUrl = href?.startsWith('http://localhost:') || href?.startsWith('http://127.0.0.1:') || href?.startsWith('https://localhost:') || href?.startsWith('https://127.0.0.1:')
  const looksLikeDownload = /descarg|download|pdf|archivo|documento/i.test(`${label} ${href ?? ''}`)
  if (isLocalUrl && looksLikeDownload) return <span>{children}</span>
  return <a href={href} {...props} target="_blank" rel="noreferrer">{children}</a>
}
