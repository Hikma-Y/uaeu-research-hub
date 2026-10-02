import 'dotenv/config'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pool } from './db.js'

const here = dirname(fileURLToPath(import.meta.url))
const schema = await readFile(join(here, 'schema.sql'), 'utf8')
await pool.query(schema)
await mkdir(join(here, '..', 'uploads'), { recursive: true })
console.log('Database schema is ready.')
await pool.end()
