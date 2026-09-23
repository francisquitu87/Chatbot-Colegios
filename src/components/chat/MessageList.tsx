import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../../lib/chat/types'
import { MessageItem } from './MessageItem'

type MessageListProps = {
  messages: ChatMessage[]
}

export function MessageList({ messages }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state__eyebrow">CSFR / AI</span>
        <h1>¿Qué quieres resolver?</h1>
        <p>Escribe una pregunta para iniciar una conversación.</p>
      </div>
    )
  }

  return (
    <div className="message-list" aria-live="polite">
      {messages.map((message) => <MessageItem key={message.id} message={message} />)}
      <div ref={endRef} />
    </div>
  )
}
