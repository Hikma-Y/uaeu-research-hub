import { Router } from 'express'
import { query } from '../db.js'
import { allowRoles } from '../auth.js'
import { asyncHandler } from '../async-handler.js'

export const contentRouter = Router()

contentRouter.get('/announcements', asyncHandler(async (_req, res) => {
  const result = await query(`SELECT a.*,u.full_name AS author FROM announcements a JOIN users u ON u.id=a.author_id ORDER BY a.created_at DESC`)
  res.json(result.rows)
}))
contentRouter.post('/announcements', allowRoles('admin'), asyncHandler(async (req, res) => {
  const { title, body, announcement_type, event_date } = req.body
  if (!title || !body || !announcement_type) return res.status(400).json({ error: 'Title, message, and update type are required.' })
  const result = await query('INSERT INTO announcements (author_id,title,body,announcement_type,event_date) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.user.sub,title,body,announcement_type,event_date || null])
  await query(`INSERT INTO notifications (user_id,title,body,notification_type) SELECT id,$1,$2,'announcement' FROM users WHERE id<>$3`, [title,body,req.user.sub])
  res.status(201).json(result.rows[0])
}))

contentRouter.get('/ideas', asyncHandler(async (req, res) => {
  const condition = req.user.role === 'student' ? 'WHERE ri.student_id=$1 OR ri.status IN (\'submitted\',\'adopted\')' : ''
  const result = await query(`SELECT ri.*,u.full_name AS student_name FROM research_ideas ri JOIN users u ON u.id=ri.student_id ${condition} ORDER BY ri.created_at DESC`, req.user.role === 'student' ? [req.user.sub] : [])
  res.json(result.rows)
}))
contentRouter.post('/ideas', allowRoles('student'), asyncHandler(async (req, res) => {
  const { title, category, description } = req.body
  if (!title || !category || !description) return res.status(400).json({ error: 'Title, category, and description are required.' })
  const result = await query('INSERT INTO research_ideas (student_id,title,category,description) VALUES ($1,$2,$3,$4) RETURNING *', [req.user.sub,title,category,description])
  res.status(201).json(result.rows[0])
}))
contentRouter.patch('/ideas/:id', allowRoles('faculty','admin'), asyncHandler(async (req, res) => {
  const result = await query('UPDATE research_ideas SET status=COALESCE($1,status),faculty_notes=COALESCE($2,faculty_notes) WHERE id=$3 RETURNING *', [req.body.status,req.body.faculty_notes,req.params.id])
  if (!result.rows[0]) return res.status(404).json({ error: 'Research idea not found.' })
  res.json(result.rows[0])
}))

contentRouter.get('/notifications', asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.sub])
  res.json(result.rows)
}))
contentRouter.patch('/notifications/:id/read', asyncHandler(async (req, res) => {
  const result = await query('UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2 RETURNING *', [req.params.id,req.user.sub])
  if (!result.rows[0]) return res.status(404).json({ error: 'Notification not found.' })
  res.json(result.rows[0])
}))

contentRouter.get('/analytics', allowRoles('admin'), asyncHandler(async (_req, res) => {
  const [projects, applications, outcomes] = await Promise.all([
    query(`SELECT status,program_type,department,count(*)::int AS total FROM projects GROUP BY GROUPING SETS ((status),(program_type),(department))`),
    query(`SELECT status,count(*)::int AS total FROM applications GROUP BY status`),
    query(`SELECT update_type,count(*)::int AS total FROM project_updates GROUP BY update_type`),
  ])
  res.json({ projects: projects.rows, applications: applications.rows, outcomes: outcomes.rows })
}))
