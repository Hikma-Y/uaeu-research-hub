import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { authenticate, signToken } from '../auth.js'
import { asyncHandler } from '../async-handler.js'

export const authRouter = Router()

authRouter.post('/login', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  const result = await query('SELECT id,email,password_hash,full_name,role FROM users WHERE email=$1', [email])
  const user = result.rows[0]
  if (!user || !await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password.' })
  const { password_hash, ...safeUser } = user
  res.json({ token: signToken(safeUser), user: safeUser })
}))

authRouter.get('/me', authenticate, asyncHandler(async (req, res) => {
  const result = await query('SELECT id,email,full_name,role FROM users WHERE id=$1', [req.user.sub])
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' })
  res.json(result.rows[0])
}))
