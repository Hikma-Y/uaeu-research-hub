import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Download, FileText, Forward, LogOut, Paperclip, Pencil, Reply, Search, Send, Trash2, UsersRound } from 'lucide-react'
import { supabase } from './lib/supabase'

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024
const MAX_ATTACHMENT_LABEL = '25 MB'

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

function formatConversationTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return date.toDateString() === new Date().toDateString()
    ? formatTime(value)
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function messagePreview(message) {
  if (message?.body) return message.body
  if (message?.attachment_name) return `Attachment: ${message.attachment_name}`
  return 'New message'
}

function orderConversations(items) {
  return [...items].sort((first, second) => {
    const firstTime = first.lastMessage?.created_at || ''
    const secondTime = second.lastMessage?.created_at || ''
    if (firstTime !== secondTime) return secondTime.localeCompare(firstTime)
    return (first.full_name || '').localeCompare(second.full_name || '')
  })
}

function sameMessages(current, next) {
  return current.length === next.length && current.every((message, index) =>
    message.id === next[index]?.id && message.read_at === next[index]?.read_at
  )
}

function sameConversations(current, next) {
  return current.length === next.length && current.every((person, index) =>
    person.id === next[index]?.id &&
    person.unreadCount === next[index]?.unreadCount &&
    person.lastMessage?.id === next[index]?.lastMessage?.id
  )
}

export default function SupabaseMessages({ profile, eyebrow = 'Inbox', initialContactId = null }) {
  const [people, setPeople] = useState([])
  const [groups, setGroups] = useState([])
  const [selectedId, setSelectedId] = useState(initialContactId)
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [forwardingMessage, setForwardingMessage] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [actionMenu, setActionMenu] = useState(null)
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupMemberIds, setGroupMemberIds] = useState([])
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [showGroupMembers, setShowGroupMembers] = useState(false)
  const [groupMembers, setGroupMembers] = useState([])
  const [memberSearch, setMemberSearch] = useState('')
  const [membersRevision, setMembersRevision] = useState(0)
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [groupActionPending, setGroupActionPending] = useState(false)
  const [showContactEmail, setShowContactEmail] = useState(false)
  const messageListRef = useRef(null)

  const selected = people.find((person) => person.id === selectedId)
  const selectedGroup = groups.find((group) => group.id === selectedGroupId)
  const canCreateGroups = ['student', 'faculty'].includes(profile?.role)
  const canShowSelectedEmail = Boolean(
    selected?.email && ['student', 'faculty'].includes(selected?.role)
  )
  const groupCandidates = people.filter((person) =>
    profile?.role === 'student'
      ? person.role === 'student'
      : ['student', 'faculty'].includes(person.role)
  )

  const visiblePeople = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return people.filter((person) => person.lastMessage || person.id === selectedId)

    return people.filter((person) =>
      `${person.full_name || ''} ${person.email || ''} ${person.university_id || ''} ${person.id} ${person.role || ''} ${person.department || ''}`
        .toLowerCase()
        .includes(query)
    )
  }, [people, search, selectedId])

  useEffect(() => {
    async function loadPeople() {
      if (!profile?.id) return

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
      const { data: inbox, error: inboxError } = await supabase
        .from('direct_messages')
        .select('id, sender_id, recipient_id, body, attachment_name, created_at, read_at')
        .or(`sender_id.eq.${profile.id},recipient_id.eq.${profile.id}`)
        .order('created_at', { ascending: false })

      if (inboxError) console.error('Message inbox load error:', inboxError.message)

      const conversationData = new Map()
      for (const message of inbox || []) {
        const otherId = message.sender_id === profile.id
          ? message.recipient_id
          : message.sender_id
        const current = conversationData.get(otherId) || { unreadCount: 0 }
        if (!current.lastMessage) current.lastMessage = message
        if (message.recipient_id === profile.id && !message.read_at) current.unreadCount += 1
        conversationData.set(otherId, current)
      }

      const conversations = orderConversations(directory.map((person) => ({
        ...person,
        ...(conversationData.get(person.id) || { unreadCount: 0 }),
      })))
      setPeople((current) =>
        sameConversations(current, conversations) ? current : conversations
      )
      setSelectedId((current) =>
        current || conversations.find((person) => person.lastMessage)?.id || null
      )
      setLoading(false)
    }

    loadPeople()
    const refreshId = window.setInterval(loadPeople, 12000)
    return () => window.clearInterval(refreshId)
  }, [profile?.id])

  useEffect(() => {
    let cancelled = false
    async function loadGroupMembers() {
      setGroupMembers([])
      setMembersLoaded(false)
      if (!selectedGroupId) {
        setGroupMembers([])
        setShowGroupMembers(false)
        return
      }
      setMembersLoading(true)
      const { data: memberships, error: membershipError } = await supabase
        .from('project_message_group_members')
        .select('profile_id')
        .eq('group_id', selectedGroupId)
      const memberIds = (memberships || []).map((item) => item.profile_id)
      const { data: directory, error: directoryError } = !membershipError && memberIds.length
        ? await supabase.from('message_directory').select('*').in('id', memberIds)
        : { data: [] }
      if (cancelled) return
      setMembersLoading(false)
      if (membershipError || directoryError) {
        setError('Could not load group members.')
        return
      }
      setGroupMembers(directory || [])
      setMembersLoaded(true)
    }

    loadGroupMembers()
    return () => { cancelled = true }
  }, [selectedGroupId, membersRevision])

  useEffect(() => {
    setMemberSearch('')
    setShowGroupMembers(false)
  }, [selectedGroupId])

  useEffect(() => {
    async function loadGroups() {
      if (!profile?.id) return
      const { data: memberships, error: membershipError } = await supabase
        .from('project_message_group_members')
        .select('group_id, last_seen_at')
        .eq('profile_id', profile.id)
      if (membershipError || !memberships?.length) {
        setGroups([])
        return
      }
      const { data: groupData } = await supabase
        .from('project_message_groups')
        .select('id, name, opportunity_id, created_by, created_at')
        .in('id', memberships.map((item) => item.group_id))
        .order('created_at', { ascending: false })
      const groupIds = (groupData || []).map((group) => group.id)
      const { data: groupMessages } = groupIds.length
        ? await supabase
          .from('project_group_messages')
          .select('group_id, sender_id, created_at')
          .in('group_id', groupIds)
        : { data: [] }
      const seenByGroup = new Map(memberships.map((item) => [item.group_id, item.last_seen_at]))
      const messagesByGroup = new Map()
      for (const message of groupMessages || []) {
        const current = messagesByGroup.get(message.group_id) || []
        current.push(message)
        messagesByGroup.set(message.group_id, current)
      }
      setGroups((groupData || []).map((group) => ({
        ...group,
        last_seen_at: seenByGroup.get(group.id) || null,
        has_unread_messages: !seenByGroup.get(group.id) || (messagesByGroup.get(group.id) || []).some((message) => {
          const lastSeen = seenByGroup.get(group.id)
          return message.sender_id !== profile.id && (!lastSeen || message.created_at > lastSeen)
        }),
      })))
    }

    loadGroups()
    const refreshId = window.setInterval(loadGroups, 12000)
    return () => window.clearInterval(refreshId)
  }, [profile?.id])

  useEffect(() => {
    async function loadMessages() {
      if (!profile?.id || (!selectedId && !selectedGroupId)) {
        setMessages([])
        return
      }

      const query = selectedGroupId
        ? supabase.from('project_group_messages').select('*').eq('group_id', selectedGroupId).order('created_at')
        : supabase.from('direct_messages').select('*').or(
          `and(sender_id.eq.${profile.id},recipient_id.eq.${selectedId}),and(sender_id.eq.${selectedId},recipient_id.eq.${profile.id})`
        ).order('created_at')
      const { data, error: loadError } = await query

      if (loadError) {
        console.error('Messages load error:', loadError.message)
        setError('Could not load this conversation.')
        return
      }

      const nextMessages = data || []
      setMessages((current) =>
        sameMessages(current, nextMessages) ? current : nextMessages
      )

      if (selectedGroupId) {
        const { error: seenError } = await supabase.rpc('mark_project_group_seen', {
          p_group_id: selectedGroupId,
        })
        if (seenError) console.error('Group read status error:', seenError.message)
        else setGroups((current) => current.map((group) =>
          group.id === selectedGroupId
            ? { ...group, last_seen_at: new Date().toISOString(), has_unread_messages: false }
            : group
        ))
      }

      const hasUnreadIncoming = !selectedGroupId &&
        nextMessages.some(
          (message) => message.sender_id === selectedId && !message.read_at
        )
      if (hasUnreadIncoming) {
        const { error: readError } = await supabase.rpc('mark_direct_messages_read', {
          p_sender_id: selectedId,
        })
        if (readError) console.error('Message read status error:', readError.message)
        else setPeople((current) => current.map((person) =>
          person.id === selectedId ? { ...person, unreadCount: 0 } : person
        ))
      }
    }

    loadMessages()
    const refreshId = window.setInterval(loadMessages, 12000)

    return () => window.clearInterval(refreshId)
  }, [profile?.id, selectedId, selectedGroupId])

  useEffect(() => {
    setShowContactEmail(false)
  }, [selectedId, selectedGroupId])

  useEffect(() => {
    const messageList = messageListRef.current
    if (messageList) {
      messageList.scrollTo({
        top: messageList.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [messages, selectedId])

  async function sendMessage(event) {
    event.preventDefault()

    const body = draft.trim()
    const forwardedAttachment = forwardingMessage?.attachment_path
    if ((!body && !attachment && !forwardedAttachment) || !profile?.id || (!selectedId && !selectedGroupId) || sending) return

    if (attachment && attachment.size > MAX_ATTACHMENT_SIZE) {
      setError(`Attachments must be ${MAX_ATTACHMENT_LABEL} or smaller.`)
      return
    }

    setSending(true)
    setError('')

    if (selectedGroupId) {
      if (!body) {
        setError('Group messages must include text.')
        setSending(false)
        return
      }
      const { data, error: groupError } = await supabase
        .from('project_group_messages')
        .insert({ group_id: selectedGroupId, sender_id: profile.id, body })
        .select()
        .single()
      if (groupError) setError(groupError.message || 'Could not send the group message.')
      else {
        setMessages((current) => [...current, data])
        setDraft('')
      }
      setSending(false)
      return
    }

    if (editingMessage) {
      const { data, error: editError } = await supabase
        .from('direct_messages')
        .update({ body, edited_at: new Date().toISOString() })
        .eq('id', editingMessage.id)
        .select()
        .single()

      if (editError) {
        console.error('Message edit error:', editError.message)
        setError('Could not edit the message.')
      } else {
        setMessages((current) => current.map((message) =>
          message.id === data.id ? data : message
        ))
        setDraft('')
        setEditingMessage(null)
      }
      setSending(false)
      return
    }

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
        attachment_path: attachmentPath || forwardingMessage?.attachment_path || null,
        attachment_name: attachment?.name || forwardingMessage?.attachment_name || null,
        attachment_type: attachment?.type || forwardingMessage?.attachment_type || null,
        attachment_size: attachment?.size || forwardingMessage?.attachment_size || null,
        reply_to_id: replyTo?.id || null,
        forwarded_from_id: forwardingMessage?.id || null,
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
    setPeople((current) => orderConversations(current.map((person) =>
      person.id === selectedId
        ? { ...person, lastMessage: data, unreadCount: 0 }
        : person
    )))
    setDraft('')
    setAttachment(null)
    setReplyTo(null)
    setForwardingMessage(null)
    setSending(false)
  }

  async function createGroup(event) {
    event.preventDefault()
    if (!canCreateGroups || !groupName.trim() || creatingGroup) return
    setCreatingGroup(true)
    setError('')
    const { data: groupId, error: groupError } = await supabase.rpc('create_message_group', {
      p_name: groupName.trim(),
      p_member_ids: groupMemberIds,
    })
    setCreatingGroup(false)
    if (groupError) {
      setError(groupError.message || 'Could not create the group.')
      return
    }
    const group = { id: groupId, name: groupName.trim(), created_by: profile.id, last_seen_at: new Date().toISOString() }
    setGroups((current) => [group, ...current])
    setSelectedGroupId(groupId)
    setSelectedId(null)
    setGroupName('')
    setGroupMemberIds([])
    setShowGroupForm(false)
  }

  async function updateGroupMember(member, remove = false) {
    if (!selectedGroup || groupActionPending || membersLoading) return
    if (remove && !window.confirm(`Remove ${member.full_name || 'this user'} from the group?`)) return
    setGroupActionPending(true)
    setError('')
    try {
      const { error: updateError } = await supabase.rpc(
        remove ? 'remove_message_group_member' : 'add_message_group_members',
        remove ? { p_group_id: selectedGroup.id, p_member_id: member.id }
          : { p_group_id: selectedGroup.id, p_member_ids: [member.id] }
      )
      if (updateError) setError(updateError.message || 'Could not update group members.')
      else setMembersRevision((current) => current + 1)
    } catch {
      setError('Could not update group members. Please try again.')
    } finally {
      setGroupActionPending(false)
    }
  }

  function matchesMemberSearch(person) {
    return `${person.full_name || ''} ${person.university_id || ''} ${person.id}`.toLowerCase().includes(memberSearch.trim().toLowerCase())
  }

  const availableMembers = groupCandidates.filter((person) =>
    !groupMembers.some((member) => member.id === person.id) && matchesMemberSearch(person)
  )

  function closeSelectedGroup(groupId) {
    setGroups((current) => current.filter((group) => group.id !== groupId))
    setSelectedGroupId(null)
    setMessages([])
    setGroupMembers([])
    setShowGroupMembers(false)
  }

  async function leaveGroup() {
    if (!selectedGroup || groupActionPending) return
    if (!window.confirm(`Leave “${selectedGroup.name}”? You will no longer be able to view its messages.`)) return

    setGroupActionPending(true)
    setError('')
    const { error: leaveError } = await supabase.rpc('leave_message_group', {
      p_group_id: selectedGroup.id,
    })
    setGroupActionPending(false)

    if (leaveError) {
      setError(leaveError.message || 'Could not leave the group.')
      return
    }

    closeSelectedGroup(selectedGroup.id)
  }

  async function deleteGroup() {
    if (!selectedGroup || groupActionPending) return
    if (!window.confirm(`Delete “${selectedGroup.name}” for everyone? All group messages will be permanently removed.`)) return

    setGroupActionPending(true)
    setError('')
    const { error: deleteError } = await supabase.rpc('delete_message_group', {
      p_group_id: selectedGroup.id,
    })
    setGroupActionPending(false)

    if (deleteError) {
      setError(deleteError.message || 'Could not delete the group.')
      return
    }

    closeSelectedGroup(selectedGroup.id)
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

  async function deleteMessage(message) {
    if (!window.confirm('Delete this message for everyone? This cannot be undone.')) return

    setError('')
    const { error: deleteError } = await supabase
      .from('direct_messages')
      .delete()
      .eq('id', message.id)

    if (deleteError) {
      console.error('Message delete error:', deleteError.message)
      setError('Could not delete the message.')
      return
    }

    const remainingMessages = messages.filter((item) => item.id !== message.id)
    setMessages(remainingMessages)
    setPeople((current) => orderConversations(current.map((person) =>
      person.id === selectedId && person.lastMessage?.id === message.id
        ? { ...person, lastMessage: remainingMessages.at(-1) || null }
        : person
    )))
  }

  async function copyMessage(message) {
    const value = message.body || message.attachment_name || ''
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch (copyError) {
      console.error('Message copy error:', copyError)
      setError('Could not copy the message.')
    }
    setActionMenu(null)
  }

  function startReply(message) {
    setReplyTo(message)
    setForwardingMessage(null)
    setEditingMessage(null)
    setActionMenu(null)
  }

  function startForward(message) {
    setForwardingMessage(message)
    setReplyTo(null)
    setEditingMessage(null)
    setDraft(message.body || '')
    setActionMenu(null)
  }

  function revealActionMenu(messageId, event) {
    const bubble = event.currentTarget
    const messageList = bubble.closest('.chat-messages')
    const bubbleBounds = bubble.getBoundingClientRect()
    const listBounds = messageList?.getBoundingClientRect()
    const spaceAbove = listBounds ? bubbleBounds.top - listBounds.top : 0

    setActionMenu({
      id: messageId,
      placement: spaceAbove < 150 ? 'below' : 'above',
    })
  }

  function startEdit(message) {
    if (!message.body) {
      setError('Only messages with text can be edited.')
      return
    }
    setEditingMessage(message)
    setReplyTo(null)
    setForwardingMessage(null)
    setDraft(message.body)
    setActionMenu(null)
  }

  return (
    <div className="dashboard-section messaging-layout">
      <aside className="content-card conversation-list">
        <div className="section-heading">
          <div className="chat-panel__identity">
            <span>{eyebrow}</span>
            <h2>Messages</h2>
          </div>
          {canCreateGroups && <button className="message-create-group" type="button" onClick={() => setShowGroupForm((current) => !current)}>Create group</button>}
        </div>

        {showGroupForm && (
          <form className="message-group-form" onSubmit={createGroup}>
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name" maxLength="80" required />
            <small>{profile?.role === 'student' ? 'You can invite students only.' : 'You can invite students and faculty.'}</small>
            <div>
              {groupCandidates.map((person) => (
                <label key={person.id}>
                  <input type="checkbox" checked={groupMemberIds.includes(person.id)} onChange={() => setGroupMemberIds((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])} />
                  {person.full_name || 'University user'}
                </label>
              ))}
            </div>
            <button type="submit" disabled={creatingGroup}>{creatingGroup ? 'Creating…' : 'Create group'}</button>
          </form>
        )}

        <label className="dashboard-search">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email or ID"
            aria-label="Search people by name, email or ID"
          />
        </label>

        {groups.length > 0 && (
          <div className="conversation-groups">
            <small>Project groups</small>
            {groups.map((group) => (
              <button
                className={group.id === selectedGroupId ? 'conversation is-active' : 'conversation'}
                key={group.id}
                type="button"
                onClick={() => {
                  setSelectedGroupId(group.id)
                  setSelectedId(null)
                }}
              >
                <span className="conversation-avatar conversation-avatar--group"><UsersRound size={22} aria-label="Group chat" /></span>
                <span className="conversation-copy"><strong><span>{group.name}</span>{group.has_unread_messages && <i className="conversation-name-unread-dot" aria-label="Unread group messages" />}</strong><small>Project group chat</small></span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="messaging-note">Loading people...</p>
        ) : !visiblePeople.length ? (
          <p className="messaging-note">
            {search.trim() ? 'No users found.' : 'No conversations yet. Search for a person to start one.'}
          </p>
        ) : (
          visiblePeople.map((person) => (
            (() => {
              const hasUnseenMessage = person.unreadCount > 0

              return (
            <button
              className={
                person.id === selectedId
                  ? 'conversation is-active'
                  : 'conversation'
              }
              key={person.id}
              type="button"
              onClick={() => {
                setSelectedGroupId(null)
                setSelectedId(person.id)
              }}
            >
              <span className="conversation-avatar-wrap">
                <span className="conversation-avatar">
                  {initials(person.full_name)}
                </span>
              </span>
              <span className="conversation-copy">
                <strong>
                  <span>{person.full_name || 'University user'}</span>
                  {hasUnseenMessage && <i className="conversation-name-unread-dot" aria-label="Unread messages" />}
                </strong>
                <small className="conversation-preview">{person.lastMessage ? messagePreview(person.lastMessage) : 'No messages yet'}</small>
                <small>{person.role || 'User'}{person.department ? ` · ${person.department}` : ''}</small>
              </span>
              <span className="conversation-meta">
                <time>{formatConversationTime(person.lastMessage?.created_at)}</time>
                {hasUnseenMessage && <b>{person.unreadCount > 9 ? '9+' : Math.max(person.unreadCount, 1)}</b>}
              </span>
            </button>
              )
            })()
          ))
        )}
      </aside>

      <section className="content-card chat-panel">
        <header>
          <span className={selectedGroup ? 'conversation-avatar conversation-avatar--group' : 'conversation-avatar'}>
            {selectedGroup ? <UsersRound size={22} aria-label="Group chat" /> : selected ? initials(selected.full_name) : <UsersRound size={18} />}
          </span>
          <div>
            {selectedGroup ? (
              <button className="group-header-name" type="button" onClick={() => setShowGroupMembers((current) => !current)}>
                {selectedGroup.name}
              </button>
            ) : canShowSelectedEmail ? (
              <button className="contact-header-name" type="button" onClick={() => setShowContactEmail((current) => !current)}>
                {selected.full_name}
              </button>
            ) : <strong>{selected?.full_name || 'Choose a person'}</strong>}
            {selected && <small className="chat-presence"><i className="online-dot" /> Available to message</small>}
            {showContactEmail && canShowSelectedEmail && <small className="chat-contact-email">{selected.email}</small>}
            <small>{selectedGroup ? 'Group conversation' : selected ? `${selected.role || 'User'}${selected.department ? ` · ${selected.department}` : ''}` : 'Private one-to-one conversation'}</small>
          </div>
          {selectedGroup && (
            <div className="group-header-actions">
              <button type="button" aria-expanded={showGroupMembers} onClick={() => setShowGroupMembers((current) => !current)}><UsersRound size={15} /> Members</button>
              <button type="button" onClick={leaveGroup} disabled={groupActionPending}>
                <LogOut size={15} />
                Leave group
              </button>
              {selectedGroup.created_by === profile?.id && (
                <button className="group-header-actions__delete" type="button" onClick={deleteGroup} disabled={groupActionPending}>
                  <Trash2 size={15} />
                  Delete group
                </button>
              )}
            </div>
          )}
        </header>

        {selectedGroup && showGroupMembers && (
          <div className="group-members-panel">
            <strong>Group members · {groupMembers.length}</strong>
            <label className="dashboard-search group-member-search">
              <Search size={16} />
              <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search by name or ID" aria-label="Search members and users by name or ID" />
            </label>
            {membersLoading && <small>Loading members...</small>}
            {groupMembers.filter(matchesMemberSearch).map((member) => (
              <div className="group-member-row" key={member.id}>
                <span className="conversation-avatar">{initials(member.full_name)}</span>
                <span className="group-member-copy"><b>{member.full_name || 'University user'}</b><small>{member.role || 'User'} · {member.university_id || member.id}</small></span>
                {selectedGroup.created_by === profile?.id && member.id !== profile.id && <button type="button" disabled={groupActionPending || membersLoading} onClick={() => updateGroupMember(member, true)} aria-label={`Remove ${member.full_name || member.id}`}>Remove</button>}
              </div>
            ))}
            {!membersLoading && !groupMembers.filter(matchesMemberSearch).length && <small>No matching members.</small>}
            {canCreateGroups && membersLoaded && !membersLoading && <>
              <strong>Add users</strong>
              <small>{profile.role === 'student' ? 'You can add students only.' : 'You can add students and faculty.'}</small>
              {availableMembers.map((person) => <div className="group-member-row" key={person.id}>
                <span className="conversation-avatar">{initials(person.full_name)}</span>
                <span className="group-member-copy"><b>{person.full_name || 'University user'}</b><small>{person.role} · {person.university_id || person.id}</small></span>
                <button type="button" disabled={groupActionPending} onClick={() => updateGroupMember(person)} aria-label={`Add ${person.full_name || person.id}`}>Add</button>
              </div>)}
              {!availableMembers.length && <small>No matching users to add.</small>}
            </>}
          </div>
        )}

        <div className="chat-messages" ref={messageListRef}>
          {error ? (
            <p role="alert" className="messaging-note">{error}</p>
          ) : !selected && !selectedGroup ? (
            <p className="messaging-note">Select someone to start a conversation.</p>
          ) : !messages.length ? (
            <p className="messaging-note">No messages yet. Say hello.</p>
          ) : (
            messages.map((message) => {
              const referencedMessage = messages.find((item) => item.id === message.reply_to_id)
              const isOwnMessage = message.sender_id === profile?.id
              return (
              <div
                className={
                  isOwnMessage
                    ? 'message-bubble message-bubble--me'
                    : 'message-bubble'
                }
                key={message.id}
                onContextMenu={(event) => {
                  event.preventDefault()
                  revealActionMenu(message.id, event)
                }}
                onMouseEnter={(event) => revealActionMenu(message.id, event)}
                onMouseLeave={() => setActionMenu((current) => current?.id === message.id ? null : current)}
              >
                {referencedMessage && (
                  <div className="message-reply-reference">
                    <strong>{referencedMessage.sender_id === profile?.id ? 'You' : selected?.full_name || 'Message'}</strong>
                    <span>{messagePreview(referencedMessage)}</span>
                  </div>
                )}
                {message.forwarded_from_id && <small className="message-forwarded">Forwarded</small>}
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
                <footer>
                  <time>{formatTime(message.created_at)}{message.edited_at ? ' · Edited' : ''}</time>
                </footer>
                {!selectedGroupId && <div className={actionMenu?.id === message.id ? `message-action-menu is-open is-${actionMenu.placement}` : 'message-action-menu'}>
                  <button type="button" onClick={() => startReply(message)}><Reply size={14} /> Reply</button>
                  <button type="button" onClick={() => startForward(message)}><Forward size={14} /> Forward</button>
                  <button type="button" onClick={() => copyMessage(message)}><Copy size={14} /> Copy</button>
                  {isOwnMessage && <button type="button" onClick={() => startEdit(message)}><Pencil size={14} /> Edit</button>}
                  {isOwnMessage && <button className="message-action-menu__delete" type="button" onClick={() => deleteMessage(message)}><Trash2 size={14} /> Delete</button>}
                </div>}
              </div>
              )
            })
          )}
        </div>

        {(replyTo || forwardingMessage || editingMessage) && (
          <div className="message-composer-context">
            <span>
              {editingMessage
                ? 'Editing message'
                : replyTo
                  ? `Replying to ${replyTo.sender_id === profile?.id ? 'yourself' : selected?.full_name || 'message'}`
                  : 'Forwarding message — choose a conversation, then send'}
            </span>
            <button
              type="button"
              onClick={() => {
                setReplyTo(null)
                setForwardingMessage(null)
                setEditingMessage(null)
                setDraft('')
              }}
            >
              Cancel
            </button>
          </div>
        )}
        <form className="message-composer" onSubmit={sendMessage}>
          <label
            className="message-attachment-button"
            title={`Attach a document (maximum ${MAX_ATTACHMENT_LABEL})`}
          >
            <Paperclip size={18} />
            <input
              type="file"
              onChange={(event) => setAttachment(event.target.files?.[0] || null)}
              disabled={!selected || sending || Boolean(selectedGroup)}
            />
          </label>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={attachment ? attachment.name : selected || selectedGroup ? 'Write a message...' : 'Choose a person first'}
            disabled={(!selected && !selectedGroup) || sending}
          />
          <button
            className="send-button"
            type="submit"
            aria-label="Send message"
            disabled={(!selected && !selectedGroup) || sending}
          >
            <Send size={18} />
          </button>
        </form>
      </section>
    </div>
  )
}
