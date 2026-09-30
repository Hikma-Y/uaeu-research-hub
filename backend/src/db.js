import pg from 'pg'

const { Pool } = pg
const connectionString = process.env.DATABASE_URL

if (!connectionString) throw new Error('DATABASE_URL is required')

export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('neon.tech') || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30_000,
})

export function query(text, params) {
  return pool.query(text, params)
}

export async function transaction(work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
