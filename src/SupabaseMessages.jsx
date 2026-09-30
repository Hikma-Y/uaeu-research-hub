import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, Paperclip, Search, Send, UsersRound } from 'lucide-react'
import { supabase } from './lib/supabase'

function initials(name) {
  return (name || 'User')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatTime(value) {
  if (!value) return ''

  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function SupabaseMessages({ profile, eyebrow = 'Inbox' }) {
  const [people, setPeople] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [attachment, setAttachment] = useState(null)

  const selected = people.find((person) => person.id === selectedId)

  const visiblePeople = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return people

    return people.filter((person) =>
      `${person.full_name || ''} ${person.role || ''} ${person.department || ''}`
        .toLowerCase()
        .includes(query)
    )
  }, [people, search])

  useEffect(() => {
    async function loadPeople() {
      if (!profile?.id) return

      setLoading(true)
      setError('')

      const { data, error: loadError } = await supabase
        .from('message_directory')
        .select('*')
        .neq('id', profile.id)
        .order('full_name')

      if (loadError) {
        console.error('Message directory load error:', loadError.message)
        setError('Could not load the messaging directory.')
        setLoading(false)
        return
      }

      const directory = data || []
      setPeople(directory)
      setSelectedId((current) => current || directory[0]?.id || null)
      setLoading(false)
    }

    loadPeople()
  }, [profile?.id])

  useEffect(() => {
    async function loadMessages() {
      if (!profile?.id || !selectedId) {
        setMessages([])
        return
      }

      const { data, error: loadError } = await supabase
        .from('direct_messages')
        .select('*')
        .or(
          `and(sender_id.eq.${profile.id},recipient_id.eq.${selectedId}),and(sender_id.eq.${selectedId},recipient_id.eq.${profile.id})`
        )
        .order('created_at')

      if (loadError) {
        console.error('Messages load error:', loadError.message)
        setError('Could not load this conversation.')
        return
      }

      setMessages(data || [])
    }

    loadMessages()
    const refreshId = window.setInterval(loadMessages, 5000)

    return () => window.clearInterval(refreshId)
  }, [profile?.id, selectedId])

  async function sendMessage(event) {
    event.preventDefault()

    const body = draft.trim()
    if ((!body && !attachment) || !profile?.id || !selectedId || sending) return

    if (attachment && attachment.size > 10 * 1024 * 1024) {
      setError('Attachments must be 10 MB or smaller.')
      return
    }

    setSending(true)
    setError('')

    const messageId = crypto.randomUUID()
    let attachmentPath = null

    if (attachment) {
      const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      attachmentPath = `${profile.id}/${messageId}/${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('message-attachments')
        .upload(attachmentPath, attachment, {
          contentType: attachment.type || 'application/octet-stream',
        })

      if (uploadError) {
        console.error('Message attachment upload error:', uploadError.message)
        setError('Could not upload the attachment.')
        setSending(false)
        return
      }
    }

    const { data, error: sendError } = await supabase
      .from('direct_messages')
      .insert({
        id: messageId,
        sender_id: profile.id,
        recipient_id: selectedId,
        body: body || null,
        attachment_path: attachmentPath,
        attachment_name: attachment?.name || null,
        attachment_type: attachment?.type || null,
        attachment_size: attachment?.size || null,
      })
      .select()
      .single()

    if (sendError) {
      console.error('Message send error:', sendError.message)
      if (attachmentPath) {
        await supabase.storage
          .from('message-attachments')
          .remove([attachmentPath])
      }
      setError('Could not send the message.')
      setSending(false)
      return
    }

    setMessages((current) => [...current, data])
    setDraft('')
    setAttachment(null)
    setSending(false)
  }

  async function openAttachment(message) {
    const { data, error: linkError } = await supabase.storage
      .from('message-attachments')
      .createSignedUrl(message.attachment_path, 60 * 10)

    if (linkError || !data?.signedUrl) {
      console.error('Message attachment link error:', linkError?.message)
      setError('Could not open the attachment.')
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="dashboard-section messaging-layout">
      <aside className="content-card conversation-list">
        <div className="section-heading">
          <div>
            <span>{eyebrow}</span>
            <h2>Messages</h2>
          </div>
        </div>

        <label className="dashboard-search">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a person"
          />
        </label>

        {loading ? (
          <p className="messaging-note">Loading people...</p>
        ) : !visiblePeople.length ? (
          <p className="messaging-note">No other users found.</p>
        ) : (
          visiblePeople.map((person) => (
            <button
              className={
                person.id === selectedId
                  ? 'conversation is-active'
                  : 'conversation'
              }
              key={person.id}
              type="button"
              onClick={() => setSelectedId(person.id)}
            >
              <span className="conversation-avatar">
                {initials(person.full_name)}
              </span>
              <span>
                <strong>{person.full_name || 'University user'}</strong>
                <small>{person.role || 'User'}{person.department ? ` · ${person.department}` : ''}</small>
              </span>
            </button>
          ))
        )}
      </aside>

      <section className="content-card chat-panel">
        <header>
          <span className="conversation-avatar">
            {selected ? initials(selected.full_name) : <UsersRound size={18} />}
          </span>
          <div>
            <strong>{selected?.full_name || 'Choose a person'}</strong>
            <small>{selected ? `${selected.role || 'User'}${selected.department ? ` · ${selected.department}` : ''}` : 'Private one-to-one conversation'}</small>
          </div>
        </header>

        <div className="chat-messages">
          {error ? (
            <p role="alert" className="messaging-note">{error}</p>
          ) : !selected ? (
            <p className="messaging-note">Select someone to start a conversation.</p>
          ) : !messages.length ? (
            <p className="messaging-note">No messages yet. Say hello.</p>
          ) : (
            messages.map((message) => (
              <div
                className={
                  message.sender_id === profile?.id
                    ? 'message-bubble message-bubble--me'
                    : 'message-bubble'
                }
                key={message.id}
              >
                {message.body && <p>{message.body}</p>}
                {message.attachment_path && (
                  <button
                    className="message-attachment"
                    type="button"
                    onClick={() => openAttachment(message)}
                  >
                    <FileText size={16} />
                    <span>{message.attachment_name || 'Attachment'}</span>
                    <Download size={15} />
                  </button>
                )}
                <time>{formatTime(message.created_at)}</time>
              </div>
            ))
          )}
        </div>

        <form className="message-composer" onSubmit={sendMessage}>
          <label
            className="message-attachment-button"
            title="Attach a document (maximum 10 MB)"
          >
            <Paperclip size={18} />
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
              onChange={(event) => setAttachment(event.target.files?.[0] || null)}
              disabled={!selected || sending}
            />
          </label>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={attachment ? attachment.name : selected ? 'Write a message...' : 'Choose a person first'}
            disabled={!selected || sending}
          />
          <button
            className="send-button"
            type="submit"
            aria-label="Send message"
            disabled={!selected || sending}
          >
            <Send size={18} />
          </button>
        </form>
      </section>
    </div>
  )
}
