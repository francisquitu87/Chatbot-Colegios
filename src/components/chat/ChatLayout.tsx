import { useEffect, useState } from 'react'
import { LogOut, MessageCircle, Plus, Settings2, Trash2 } from 'lucide-react'
import { supabase, getSupabaseConfigError } from '../../lib/supabase/client'
import { useChat } from '../../hooks/useChat'
import { useConversations } from '../../hooks/useConversations'
import { useMessages } from '../../hooks/useMessages'
import { useFileUpload } from '../../hooks/useFileUpload'
import { useConversationFiles } from '../../hooks/useConversationFiles'
import { ChatComposer } from './ChatComposer'
import { FileList } from './FileList'
import { MessageList } from './MessageList'

type SessionUser = { email?: string | null }

export function ChatLayout() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [authError, setAuthError] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const conversations = useConversations(Boolean(user))
  const storedMessages = useMessages(conversations.selectedId)
  const chat = useChat(conversations.selectedId, storedMessages.messages)
  const conversationFiles = useConversationFiles(conversations.selectedId)
  const fileUpload = useFileUpload()
  const configError = getSupabaseConfigError()

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleAuth() {
    if (!supabase) return
    setAuthError('')
    setAuthLoading(true)
    const result = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    setAuthLoading(false)

    if (result.error) {
      setAuthError(result.error.message)
    } else if (isSignUp && !result.data.session) {
      setAuthError('Revisa tu correo para confirmar la cuenta.')
    }
  }

  if (configError) return <main className="auth-page"><div className="auth-card"><Brand /><p className="notice">{configError}</p></div></main>
  if (authLoading) return <main className="auth-page"><div className="loader">Cargando...</div></main>
  if (!user) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <Brand />
          <p className="auth-card__intro">Accede a tu espacio de conversación.</p>
          <form onSubmit={(event) => { event.preventDefault(); void handleAuth() }}>
            <label>Correo electrónico<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
            <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={isSignUp ? 'new-password' : 'current-password'} /></label>
            {authError && <p className="form-error" role="alert">{authError}</p>}
            <button className="primary-button" type="submit">{isSignUp ? 'Crear cuenta' : 'Entrar'}</button>
          </form>
          <button className="text-button" type="button" onClick={() => { setIsSignUp(!isSignUp); setAuthError('') }}>
            {isSignUp ? 'Ya tengo una cuenta' : 'Crear una cuenta'}
          </button>
        </div>
      </main>
    )
  }

  async function handleNewConversation() {
    await conversations.create()
  }

  async function handleDeleteConversation(id: string) {
    await conversations.remove(id)
  }

  async function handleUploadFile() {
    const uploaded = await fileUpload.upload(conversations.selectedId)
    if (uploaded) await conversationFiles.refresh()
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <Brand compact />
        <div className="header-actions"><span className="user-email">{user.email}</span><button className="icon-button icon-button--quiet" onClick={() => void supabase?.auth.signOut()} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={17} /></button></div>
      </header>
      <div className="workspace">
        <aside className="conversation-sidebar">
          <button className="new-chat-button" type="button" onClick={() => void handleNewConversation()}><Plus size={17} />Nuevo chat</button>
          <div className="conversation-list" aria-label="Conversaciones">
            {conversations.isLoading && <p className="sidebar-status">Cargando historial...</p>}
            {conversations.error && <p className="sidebar-error">{conversations.error}</p>}
            {conversations.conversations.map((conversation) => (
              <div className={`conversation-row ${conversation.id === conversations.selectedId ? 'conversation-row--active' : ''}`} key={conversation.id}>
                <button type="button" className="conversation-button" onClick={() => conversations.setSelectedId(conversation.id)}>
                  <span>{conversation.title}</span><small>{relativeDate(conversation.updated_at)}</small>
                </button>
                <button type="button" className="conversation-delete" onClick={() => void handleDeleteConversation(conversation.id)} aria-label={`Eliminar ${conversation.title}`} title="Eliminar conversación"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </aside>
        <section className="chat-panel">
          <FileList files={conversationFiles.files} onDelete={(id) => void conversationFiles.remove(id).catch(() => undefined)} />
          {chat.activeTool && <p className="tool-status"><Settings2 size={14} />Consultando información...</p>}
          <MessageList messages={chat.messages} />
          {(chat.error || storedMessages.error || conversationFiles.error) && <p className="chat-error" role="alert">{chat.error?.message ?? storedMessages.error ?? conversationFiles.error}</p>}
          <ChatComposer input={chat.input} isLoading={chat.isLoading || storedMessages.isLoading} onInputChange={chat.setInput} onSubmit={() => { void chat.sendMessage().then(() => conversations.refresh()) }} onStop={chat.stopGeneration} selectedFile={fileUpload.selectedFile} uploadState={fileUpload.state} uploadError={fileUpload.error} onSelectFile={fileUpload.selectFile} onCancelFile={fileUpload.clearFile} onUploadFile={() => void handleUploadFile()} />
          <p className="composer-hint">Las respuestas pueden contener errores. Verifica la información importante.</p>
        </section>
      </div>
    </main>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? 'brand brand--compact' : 'brand'}><span className="brand__mark"><MessageCircle size={compact ? 17 : 22} /></span><span>CSFR <strong>Assistant</strong></span></div>
}

function relativeDate(value: string) {
  const date = new Date(value)
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 7) return `Hace ${days} días`
  return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}
