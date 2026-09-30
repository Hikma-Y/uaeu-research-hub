import { Router } from 'express'
import multer from 'multer'
import { mkdir, unlink } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { query } from '../db.js'
import { asyncHandler } from '../async-handler.js'

const uploadPath = join(process.cwd(), 'uploads')
await mkdir(uploadPath, { recursive: true })
const allowedTypes = new Set(['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg'])
const upload = multer({
  storage: multer.diskStorage({ destination: uploadPath, filename: (_req,file,done) => done(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`) }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req,file,done) => allowedTypes.has(file.mimetype) ? done(null,true) : done(new Error('Unsupported document format.')),
})

export const profilesRouter = Router()

profilesRouter.get('/me', asyncHandler(async (req, res) => {
  const profileTable = req.user.role === 'student' ? 'student_profiles' : req.user.role === 'faculty' ? 'faculty_profiles' : null
  const result = profileTable
    ? await query(`SELECT u.id,u.email,u.full_name,u.role,p.* FROM users u LEFT JOIN ${profileTable} p ON p.user_id=u.id WHERE u.id=$1`, [req.user.sub])
    : await query('SELECT id,email,full_name,role FROM users WHERE id=$1', [req.user.sub])
  res.json(result.rows[0])
}))

profilesRouter.put('/me', asyncHandler(async (req, res) => {
  if (req.user.role === 'admin') return res.status(400).json({ error: 'Administrator accounts do not use research profiles.' })
  const table = req.user.role === 'student' ? 'student_profiles' : 'faculty_profiles'
  const scalar = req.user.role === 'student'
    ? ['major','academic_standing','gpa','experience']
    : ['office_number','google_scholar_url','supervision_status','supervision_capacity']
  const arrays = req.user.role === 'student'
    ? ['skills','research_interests']
    : ['expertise','research_interests','publications']
  const current = (await query(`SELECT * FROM ${table} WHERE user_id=$1`, [req.user.sub])).rows[0] || {}
  const data = Object.fromEntries([
    ...scalar.map((key) => [key, req.body[key] ?? current[key] ?? null]),
    ...arrays.map((key) => [key, req.body[key] ?? current[key] ?? []]),
  ])
  const result = await query(`INSERT INTO ${table} (user_id,${[...scalar,...arrays].join(',')}) VALUES ($1,${[...scalar,...arrays].map((_,i)=>`$${i+2}`).join(',')})
    ON CONFLICT (user_id) DO UPDATE SET ${[...scalar,...arrays].map((key)=>`${key}=COALESCE(EXCLUDED.${key},${table}.${key})`).join(',')},updated_at=now() RETURNING *`, [req.user.sub,...Object.values(data)])
  res.json(result.rows[0])
}))

profilesRouter.get('/me/documents', asyncHandler(async (req, res) => {
  const result = await query('SELECT id,document_type,original_name,mime_type,size_bytes,created_at FROM documents WHERE owner_id=$1 ORDER BY created_at DESC', [req.user.sub])
  res.json(result.rows)
}))

profilesRouter.post('/me/documents', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a document to upload.' })
  const result = await query(`INSERT INTO documents (owner_id,document_type,original_name,stored_name,mime_type,size_bytes)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,document_type,original_name,mime_type,size_bytes,created_at`, [req.user.sub,req.body.document_type || 'supporting',req.file.originalname,req.file.filename,req.file.mimetype,req.file.size])
  res.status(201).json(result.rows[0])
}))

profilesRouter.get('/documents/:id', asyncHandler(async (req, res) => {
  const result = await query(`SELECT d.* FROM documents d WHERE d.id=$1 AND (d.owner_id=$2 OR $3='admin' OR EXISTS (
    SELECT 1 FROM applications a JOIN projects p ON p.id=a.project_id WHERE a.student_id=d.owner_id AND p.owner_id=$2
  ) OR EXISTS (SELECT 1 FROM messages m JOIN chat_members cm ON cm.chat_id=m.chat_id WHERE m.document_id=d.id AND cm.user_id=$2))`, [req.params.id,req.user.sub,req.user.role])
  const document = result.rows[0]
  if (!document) return res.status(404).json({ error: 'Document not found.' })
  res.type(document.mime_type).download(join(uploadPath, document.stored_name), document.original_name)
}))

profilesRouter.delete('/me/documents/:id', asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM documents WHERE id=$1 AND owner_id=$2 RETURNING id,stored_name', [req.params.id,req.user.sub])
  if (!result.rows[0]) return res.status(404).json({ error: 'Document not found.' })
  await unlink(join(uploadPath, result.rows[0].stored_name)).catch(() => {})
  res.status(204).end()
}))
