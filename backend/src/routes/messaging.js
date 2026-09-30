import { Router } from 'express'
import { query, transaction } from '../db.js'
import { asyncHandler } from '../async-handler.js'

export const messagingRouter = Router()

messagingRouter.get('/chats', asyncHandler(async (req, res) => {
  const result = await query(`SELECT c.*,json_agg(json_build_object('id',u.id,'name',u.full_name,'role',u.role)) AS members,
    (SELECT body FROM messages WHERE chat_id=c.id ORDER BY created_at DESC LIMIT 1) AS last_message
    FROM chats c JOIN chat_members mine ON mine.chat_id=c.id AND mine.user_id=$1
    JOIN chat_members cm ON cm.chat_id=c.id JOIN users u ON u.id=cm.user_id
    GROUP BY c.id ORDER BY c.created_at DESC`, [req.user.sub])
  res.json(result.rows)
}))

messagingRouter.post('/chats', asyncHandler(async (req, res) => {
  const memberIds = [...new Set([req.user.sub,...(req.body.member_ids || []).map(Number)])]
  if (memberIds.length < 2) return res.status(400).json({ error: 'Select at least one recipient.' })
  const chat = await transaction(async (db) => {
    const created = await db.query('INSERT INTO chats (name,chat_type,project_id) VALUES ($1,$2,$3) RETURNING *', [req.body.name || null,req.body.chat_type || 'direct',req.body.project_id || null])
    for (const id of memberIds) await db.query('INSERT INTO chat_members (chat_id,user_id) VALUES ($1,$2)', [created.rows[0].id,id])
    return created.rows[0]
  })
  res.status(201).json(chat)
}))

messagingRouter.get('/chats/:id/messages', asyncHandler(async (req, res) => {
  const member = await query('SELECT 1 FROM chat_members WHERE chat_id=$1 AND user_id=$2', [req.params.id,req.user.sub])
  if (!member.rows[0]) return res.status(403).json({ error: 'You are not a member of this chat.' })
  const result = await query(`SELECT m.*,u.full_name AS sender_name,d.original_name AS attachment_name FROM messages m
    JOIN users u ON u.id=m.sender_id LEFT JOIN documents d ON d.id=m.document_id WHERE m.chat_id=$1 ORDER BY m.created_at`, [req.params.id])
  res.json(result.rows)
}))

export async function saveMessage({ chatId, senderId, body, documentId }) {
  const member = await query('SELECT 1 FROM chat_members WHERE chat_id=$1 AND user_id=$2', [chatId,senderId])
  if (!member.rows[0]) throw Object.assign(new Error('You are not a member of this chat.'), { status: 403 })
  const result = await query(`INSERT INTO messages (chat_id,sender_id,body,document_id) VALUES ($1,$2,$3,$4)
    RETURNING *, (SELECT full_name FROM users WHERE id=$2) AS sender_name`, [chatId,senderId,body || null,documentId || null])
  return result.rows[0]
}
