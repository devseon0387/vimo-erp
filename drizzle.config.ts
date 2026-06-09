import { defineConfig } from 'drizzle-kit'

// 자체호스팅 PostgreSQL(Baseon 본 PG) 이전용 Drizzle 설정.
// introspect(pull)로 본 PG의 staged 스키마(30테이블)에서 Drizzle 스키마를 생성한다.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db',
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL!,
  },
  // 시스템/마이그레이션 테이블 제외
  tablesFilter: ['!__drizzle_migrations'],
})
