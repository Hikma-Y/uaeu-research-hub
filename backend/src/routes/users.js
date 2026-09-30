import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query, transaction } from '../db.js'
import { allowRoles } from '../auth.js'
import { asyncHandler } from '../async-handler.js'

export const usersRouter = Router()
usersRouter.use(allowRoles('admin'))

usersRouter.get('/', asyncHandler(async (req, res) => {
  const values = []
  const where = []
  if (req.query.role) { values.push(req.query.role);where.push(`role=$${values.length}`) }
  if (req.query.q) { values.push(req.query.q);where.push(`(full_name ILIKE '%'||$${values.length}||'%' OR email ILIKE '%'||$${values.length}||'%')`) }
  const result = await query(`SELECT id,email,full_name,role,created_at FROM users ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY full_name`, values)
  res.json(result.rows)
}))

usersRouter.post('/', asyncHandler(async (req, res) => {
  const email = String(req.body.email||'').trim().toLowerCase()
  const fullName = String(req.body.full_name||'').trim()
  const role = String(req.body.role||'').toLowerCase()
  const password = String(req.body.password||'')
  if (!email.endsWith('@uaeu.ac.ae')) return res.status(400).json({ error: 'A UAEU email address is required.' })
  if (!fullName || !['student','faculty','admin'].includes(role)) return res.status(400).json({ error: 'Name and a valid role are required.' })
  if (password.length < 8) return res.status(400).json({ error: 'The temporary password must contain at least 8 characters.' })
  const passwordHash = await bcrypt.hash(password,12)
  const user = await transaction(async (db) => {
    const created = await db.query('INSERT INTO users (email,password_hash,full_name,role) VALUES ($1,$2,$3,$4) RETURNING id,email,full_name,role,created_at', [email,passwordHash,fullName,role])
    if (role==='student') await db.query('INSERT INTO student_profiles (user_id) VALUES ($1)', [created.rows[0].id])
    if (role==='faculty') await db.query('INSERT INTO faculty_profiles (user_id) VALUES ($1)', [created.rows[0].id])
    return created.rows[0]
  })
  res.status(201).json(user)
}))

usersRouter.patch('/:id', asyncHandler(async (req, res) => {
  const result = await query('UPDATE users SET full_name=COALESCE($1,full_name) WHERE id=$2 RETURNING id,email,full_name,role,created_at', [req.body.full_name||null,req.params.id])
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' })
  res.json(result.rows[0])
}))
