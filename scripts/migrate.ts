import './load-env.js'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { normalizePostgresUrl } from '../src/db/connection.js'

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!connectionString) throw new Error('Pull Neon environment variables before migrating')

const pool = new Pool({ connectionString: normalizePostgresUrl(connectionString), max: 1 })
const db = drizzle(pool)

await migrate(db, { migrationsFolder: './drizzle' })
await pool.end()
console.log('Database migrations are current.')
