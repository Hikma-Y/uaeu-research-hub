import { Router } from 'express'
import { query } from '../db.js'
import { allowRoles } from '../auth.js'
import { asyncHandler } from '../async-handler.js'

export const projectsRouter = Router()
const fields = ['title','abstract','program_type','department','research_centre','funding_type','required_skills','qualifications','capacity','start_date','end_date','application_deadline','status']

projectsRouter.get('/', asyncHandler(async (req, res) => {
  const where = []
  const values = []
  const add = (sql, value) => { values.push(value); where.push(sql.replace('?', `$${values.length}`)) }
  if (req.query.program) add('p.program_type=?', req.query.program)
  if (req.query.department) add('p.department=?', req.query.department)
  if (req.query.funding) add('p.funding_type=?', req.query.funding)
  if (req.query.status) add('p.status=?', req.query.status)
  else if (req.user.role === 'student') where.push("p.status='open'")
  if (req.query.q) {
    values.push(req.query.q)
    where.push(`(p.title ILIKE '%' || $${values.length} || '%' OR p.abstract ILIKE '%' || $${values.length} || '%')`)
  }
  const result = await query(`SELECT p.*,u.full_name AS supervisor,
    (SELECT count(*)::int FROM applications a WHERE a.project_id=p.id AND a.status='accepted') AS accepted_count
    FROM projects p JOIN users u ON u.id=p.owner_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.created_at DESC`, values)
  res.json(result.rows)
}))

projectsRouter.get('/:id', asyncHandler(async (req, res) => {
  const project = await query(`SELECT p.*,u.full_name AS supervisor FROM projects p JOIN users u ON u.id=p.owner_id WHERE p.id=$1`, [req.params.id])
  if (!project.rows[0]) return res.status(404).json({ error: 'Project not found.' })
  const milestones = await query('SELECT * FROM milestones WHERE project_id=$1 ORDER BY due_date', [req.params.id])
  const updates = await query(`SELECT pu.*,u.full_name AS author FROM project_updates pu JOIN users u ON u.id=pu.author_id WHERE project_id=$1 ORDER BY created_at DESC`, [req.params.id])
  res.json({ ...project.rows[0], milestones: milestones.rows, updates: updates.rows })
}))

projectsRouter.post('/', allowRoles('faculty','admin'), asyncHandler(async (req, res) => {
  for (const required of ['title','abstract','program_type','department','funding_type','capacity']) {
    if (!req.body[required]) return res.status(400).json({ error: `${required.replaceAll('_',' ')} is required.` })
  }
  const ownerId = req.user.role === 'faculty' ? req.user.sub : (req.body.owner_id || req.user.sub)
  const values = fields.map((field) => req.body[field] ?? null)
  const result = await query(`INSERT INTO projects (${fields.join(',')},owner_id) VALUES (${values.map((_,i)=>`$${i+1}`).join(',')},$${values.length+1}) RETURNING *`, [...values, ownerId])
  res.status(201).json(result.rows[0])
}))

projectsRouter.put('/:id', allowRoles('faculty','admin'), asyncHandler(async (req, res) => {
  const allowed = fields.filter((field) => req.body[field] !== undefined)
  if (!allowed.length) return res.status(400).json({ error: 'No project fields supplied.' })
  const values = allowed.map((field) => req.body[field])
  const ownership = req.user.role === 'faculty' ? ' AND owner_id=$' + (values.length + 2) : ''
  const result = await query(`UPDATE projects SET ${allowed.map((f,i)=>`${f}=$${i+1}`).join(',')},updated_at=now() WHERE id=$${values.length+1}${ownership} RETURNING *`, [...values, req.params.id, ...(req.user.role === 'faculty' ? [req.user.sub] : [])])
  if (!result.rows[0]) return res.status(404).json({ error: 'Project not found or unavailable.' })
  res.json(result.rows[0])
}))

projectsRouter.delete('/:id', allowRoles('faculty','admin'), asyncHandler(async (req, res) => {
  const result = await query("UPDATE projects SET status='archived',updated_at=now() WHERE id=$1 AND ($2='admin' OR owner_id=$3) RETURNING *", [req.params.id, req.user.role, req.user.sub])
  if (!result.rows[0]) return res.status(404).json({ error: 'Project not found or unavailable.' })
  res.json(result.rows[0])
}))

projectsRouter.post('/:id/milestones', allowRoles('faculty','admin'), asyncHandler(async (req, res) => {
  const { title, description, due_date } = req.body
  if (!title || !due_date) return res.status(400).json({ error: 'Milestone title and due date are required.' })
  const result = await query('INSERT INTO milestones (project_id,title,description,due_date) VALUES ($1,$2,$3,$4) RETURNING *', [req.params.id,title,description,due_date])
  res.status(201).json(result.rows[0])
}))

projectsRouter.patch('/:projectId/milestones/:id', allowRoles('faculty','admin'), asyncHandler(async (req, res) => {
  const result = await query('UPDATE milestones SET status=COALESCE($1,status),title=COALESCE($2,title),description=COALESCE($3,description),due_date=COALESCE($4,due_date) WHERE id=$5 AND project_id=$6 RETURNING *', [req.body.status,req.body.title,req.body.description,req.body.due_date,req.params.id,req.params.projectId])
  if (!result.rows[0]) return res.status(404).json({ error: 'Milestone not found.' })
  res.json(result.rows[0])
}))

projectsRouter.post('/:projectId/milestones/:id/deliverables', allowRoles('student'), asyncHandler(async (req, res) => {
  const membership = await query(`SELECT 1 FROM applications WHERE project_id=$1 AND student_id=$2 AND status='accepted'`, [req.params.projectId,req.user.sub])
  if (!membership.rows[0]) return res.status(403).json({ error: 'Only accepted project members can submit deliverables.' })
  const result = await query(`INSERT INTO deliverables (milestone_id,student_id,document_id,note)
    SELECT id,$1,$2,$3 FROM milestones WHERE id=$4 AND project_id=$5 RETURNING *`, [req.user.sub,req.body.document_id||null,req.body.note||null,req.params.id,req.params.projectId])
  if (!result.rows[0]) return res.status(404).json({ error: 'Milestone not found.' })
  await query("UPDATE milestones SET status='submitted' WHERE id=$1", [req.params.id])
  res.status(201).json(result.rows[0])
}))

projectsRouter.patch('/:projectId/deliverables/:id', allowRoles('faculty','admin'), asyncHandler(async (req, res) => {
  const result = await query(`UPDATE deliverables d SET feedback=$1,evaluation=$2,reviewed_at=now() FROM milestones m
    WHERE d.id=$3 AND m.id=d.milestone_id AND m.project_id=$4 RETURNING d.*`, [req.body.feedback||null,req.body.evaluation||null,req.params.id,req.params.projectId])
  if (!result.rows[0]) return res.status(404).json({ error: 'Deliverable not found.' })
  res.json(result.rows[0])
}))

projectsRouter.post('/:id/updates', allowRoles('student','faculty'), asyncHandler(async (req, res) => {
  const { update_type, title, body } = req.body
  if (!update_type || !title) return res.status(400).json({ error: 'Update type and title are required.' })
  const result = await query('INSERT INTO project_updates (project_id,author_id,update_type,title,body) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.params.id,req.user.sub,update_type,title,body])
  res.status(201).json(result.rows[0])
}))
