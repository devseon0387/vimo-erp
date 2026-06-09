import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Baseon 본 PG 연결. 런타임은 PgBouncer transaction 풀러(6543) → prepare:false 필수.
// DATABASE_URL(풀러) 우선, 없으면 MIGRATION_DATABASE_URL(직접 5432, 로컬/마이그레이션용).
const url = process.env.DATABASE_URL || process.env.MIGRATION_DATABASE_URL
if (!url) throw new Error('DATABASE_URL 미설정 (Baseon 본 PG)')

const client = postgres(url, { prepare: false })
export const db = drizzle(client, { schema })
export { schema }
