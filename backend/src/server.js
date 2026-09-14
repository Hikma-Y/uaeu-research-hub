import 'dotenv/config'
import { createServer } from 'node:http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import { Server } from 'socket.io'
import { authenticate } from './auth.js'
import { query } from './db.js'
import { authRouter } from './routes/auth.js'
import { projectsRouter } from './routes/projects.js'
import { applicationsRouter } from './routes/applications.js'
import { profilesRouter } from './routes/profiles.js'
import { contentRouter } from './routes/content.js'
import { messagingRouter, saveMessage } from './routes/messaging.js'
import { usersRouter } from './routes/users.js'

for (const variable of ['DATABASE_URL','JWT_SECRET']) {
  if (!process.env[variable]) throw new Error(`${variable} is required`)
}

const app = express()
const server = createServer(app)
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((value) => value.trim())
const io = new Server(server, { cors: { origin: allowedOrigins, credentials: true } })

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.get('/api/health', async (_req, res, next) => {
  try { await query('SELECT 1'); res.json({ status: 'ok' }) } catch (error) { next(error) }
})
app.use('/api/auth', authRouter)
app.use('/api/projects', authenticate, projectsRouter)
app.use('/api/applications', authenticate, applicationsRouter)
app.use('/api/profiles', authenticate, profilesRouter)
app.use('/api/users', authenticate, usersRouter)
app.use('/api', authenticate, contentRouter)
app.use('/api', authenticate, messagingRouter)

app.use((error, _req, res, _next) => {
  console.error(error)
  if (error.code === '23505') return res.status(409).json({ error: 'That record already exists.' })
  if (error.code === '23503' || error.code === '23514' || error.code === '22P02') return res.status(400).json({ error: 'The submitted data is invalid.' })
  if (error.name === 'MulterError' && error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Files must not exceed 10 MB.' })
  res.status(error.status || 500).json({ error: error.status ? error.message : 'An unexpected server error occurred.' })
})

io.use((socket, next) => {
  try {
    socket.user = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET)
    next()
  } catch { next(new Error('Authentication required.')) }
})

io.on('connection', (socket) => {
  socket.on('chat:join', async (chatId, acknowledge = () => {}) => {
    try {
      const member = await query('SELECT 1 FROM chat_members WHERE chat_id=$1 AND user_id=$2', [chatId,socket.user.sub])
      if (!member.rows[0]) throw Object.assign(new Error('Chat access denied.'), { status: 403 })
      socket.join(`chat:${chatId}`)
      acknowledge({ ok: true })
    } catch (error) { acknowledge({ ok: false, error: error.message }) }
  })
  socket.on('message:send', async (payload, acknowledge = () => {}) => {
    try {
      const message = await saveMessage({ chatId: payload.chatId, senderId: socket.user.sub, body: payload.body, documentId: payload.documentId })
      io.to(`chat:${payload.chatId}`).emit('message:new', message)
      acknowledge({ ok: true, message })
    } catch (error) { acknowledge({ ok: false, error: error.message }) }
  })
})

const port = Number(process.env.PORT || 5000)
server.listen(port, () => console.log(`UAEU Research Hub API listening on port ${port}`))
