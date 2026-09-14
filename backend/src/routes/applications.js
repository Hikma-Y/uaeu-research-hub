import { Router } from 'express'
import { query, transaction } from '../db.js'
import { allowRoles } from '../auth.js'
import { asyncHandler } from '../async-handler.js'

export const applicationsRouter = Router()

applicationsRouter.get('/', asyncHandler(async (req, res) => {
  const condition = req.user.role === 'student' ? 'a.student_id=$1' : req.user.role === 'faculty' ? 'p.owner_id=$1' : 'TRUE'
  const values = req.user.role === 'admin' ? [] : [req.user.sub]
  const result = await query(`SELECT a.*,p.title AS project_title,p.program_type,u.full_name AS student_name,u.email AS student_email,
    sp.major,sp.academic_standing,sp.gpa,sp.skills,sp.research_interests,sp.experience,
    COALESCE((SELECT json_agg(json_build_object('id',d.id,'document_type',d.document_type,'original_name',d.original_name,'mime_type',d.mime_type,'size_bytes',d.size_bytes,'created_at',d.created_at) ORDER BY d.created_at DESC)
      FROM documents d WHERE d.owner_id=a.student_id),'[]'::json) AS documents
    FROM applications a JOIN projects p ON p.id=a.project_id JOIN users u ON u.id=a.student_id
    LEFT JOIN student_profiles sp ON sp.user_id=a.student_id WHERE ${condition} ORDER BY a.updated_at DESC`, values)
  res.json(result.rows)
}))

applicationsRouter.post('/', allowRoles('student'), asyncHandler(async (req, res) => {
  const { project_id, cover_note } = req.body
  const profile = await query('SELECT major,academic_standing FROM student_profiles WHERE user_id=$1', [req.user.sub])
  if (!profile.rows[0]?.major || !profile.rows[0]?.academic_standing) return res.status(400).json({ error: 'Complete your required profile fields before applying.' })
  const documents = await query('SELECT count(*)::int AS total FROM documents WHERE owner_id=$1', [req.user.sub])
  if (!documents.rows[0].total) return res.status(400).json({ error: 'Upload at least one supporting document before applying.' })
  const project = await query(`SELECT p.*,(SELECT count(*) FROM applications a WHERE a.project_id=p.id AND a.status='accepted') accepted FROM projects p WHERE id=$1`, [project_id])
  const item = project.rows[0]
  if (!item || item.status !== 'open' || (item.application_deadline && new Date(item.application_deadline) < new Date()) || Number(item.accepted) >= item.capacity) return res.status(409).json({ error: 'This opportunity is no longer accepting applications.' })
  const result = await query('INSERT INTO applications (project_id,student_id,cover_note) VALUES ($1,$2,$3) ON CONFLICT (project_id,student_id) DO NOTHING RETURNING *', [project_id,req.user.sub,cover_note])
  if (!result.rows[0]) return res.status(409).json({ error: 'You already applied to this opportunity.' })
  res.status(201).json(result.rows[0])
}))

applicationsRouter.patch('/:id/status', allowRoles('faculty','admin'), asyncHandler(async (req, res) => {
  const status = req.body.status
  if (!['under_review','shortlisted','accepted','rejected'].includes(status)) return res.status(400).json({ error: 'Invalid application status.' })
  const updated = await transaction(async (db) => {
    const result = await db.query(`UPDATE applications a SET status=$1,updated_at=now() FROM projects p
      WHERE a.id=$2 AND p.id=a.project_id AND ($3='admin' OR p.owner_id=$4) RETURNING a.*`, [status,req.params.id,req.user.role,req.user.sub])
    if (!result.rows[0]) return null
    await db.query(`INSERT INTO notifications (user_id,title,body,notification_type)
      SELECT student_id,'Application status updated','Your application is now ' || replace($1,'_',' ') || '.','application' FROM applications WHERE id=$2`, [status,req.params.id])
    return result.rows[0]
  })
  if (!updated) return res.status(404).json({ error: 'Application not found or unavailable.' })
  res.json(updated)
}))
