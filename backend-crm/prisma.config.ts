import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { resolveDatabaseUrl } from './src/config/databaseUrl.ts';

// `generate` and `validate` don't connect, so a placeholder keeps them working before a database is configured;
// `migrate` / `db push` fail fast against it with a clear connection error.
const PLACEHOLDER_URL = 'sqlserver://localhost:1433;database=CRM_DB;user=sa;password=placeholder;trustServerCertificate=true';

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
        seed: 'tsx prisma/seed.ts',
    },
    datasource: {
        url: resolveDatabaseUrl() ?? PLACEHOLDER_URL,
    },
});
