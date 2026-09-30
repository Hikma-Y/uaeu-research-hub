import { useEffect, useMemo, useState } from 'react'
import { Paperclip, Search, Send } from 'lucide-react'
import { io } from 'socket.io-client'
import { getToken, hubApi } from './api.js'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'

export default function ConnectedMessages({ currentUserId }) {
  const [chats,setChats] = useState([])
  const [chatId,setChatId] = useState(null)
  const [messages,setMessages] = useState([])
  const [draft,setDraft] = useState('')
  const socket = useMemo(()=>io(SOCKET_URL,{auth:{token:getToken()},autoConnect:false}),[])
  const selected = chats.find((chat)=>chat.id===chatId)
  const recipient = selected?.members.find((member)=>member.id!==currentUserId)

  useEffect(()=>{hubApi.chats().then((items)=>{setChats(items);setChatId(items[0]?.id||null)})},[])
  useEffect(()=>{
    if(!chatId)return
    hubApi.messages(chatId).then(setMessages)
    socket.connect(); socket.emit('chat:join',chatId)
    const receive=(message)=>{if(message.chat_id===chatId)setMessages((items)=>items.some((item)=>item.id===message.id)?items:[...items,message])}
    socket.on('message:new',receive)
    return()=>{socket.off('message:new',receive);socket.disconnect()}
  },[chatId,socket])

  function send(event){event.preventDefault();const body=draft.trim();if(!body||!chatId)return;socket.emit('message:send',{chatId,body},(result)=>{if(!result.ok)return;setDraft('')})}
  return <div className="dashboard-section messaging-layout"><aside className="content-card conversation-list"><div className="section-heading"><div><span>Inbox</span><h2>Messages</h2></div></div><label className="dashboard-search"><Search size={18}/><input placeholder="Search conversations"/></label>{chats.map((chat)=>{const other=chat.members.find((member)=>member.id!==currentUserId);return <button key={chat.id} className={chat.id===chatId?'conversation is-active':'conversation'} type="button" onClick={()=>setChatId(chat.id)}><span className="conversation-avatar">{(other?.name||chat.name||'Chat').split(' ').map((part)=>part[0]).slice(0,2).join('')}</span><span><strong>{chat.name||other?.name||'Research team'}</strong><small>{chat.last_message||'Start the conversation'}</small></span></button>})}</aside><section className="content-card chat-panel"><header><span className="conversation-avatar">{(recipient?.name||selected?.name||'Chat').split(' ').map((part)=>part[0]).slice(0,2).join('')}</span><div><strong>{selected?.name||recipient?.name||'Select a conversation'}</strong><small>Saved research conversation</small></div></header><div className="chat-messages">{messages.map((message)=><div key={message.id} className={message.sender_id===currentUserId?'message-bubble message-bubble--me':'message-bubble'}><p>{message.body||`Shared ${message.attachment_name}`}</p><time>{new Date(message.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></div>)}</div><form className="message-composer" onSubmit={send}><button type="button" aria-label="Attach file" title="Upload a document in your profile before sharing"><Paperclip size={20}/></button><input value={draft} onChange={(event)=>setDraft(event.target.value)} placeholder="Write a message…" disabled={!chatId}/><button className="send-button" type="submit" aria-label="Send message" disabled={!chatId}><Send size={18}/></button></form></section></div>
}
