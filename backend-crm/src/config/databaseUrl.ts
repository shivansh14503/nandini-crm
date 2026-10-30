/**
 * Resolves the SQL Server connection string shared by the Prisma CLI (prisma.config.ts) and the runtime
 * client (src/config/prisma.ts). `DATABASE_URL` wins; otherwise it is assembled from the legacy
 * DB_* variables so existing .env files keep working.
 *
 * Kept dependency-free (no env validation, no logger) because prisma.config.ts loads it standalone.
 */

/** Wraps values containing URL delimiters in braces, the escaping both Prisma and @prisma/adapter-mssql read. */
function escapeValue(value: string): string {
    return /[;={}:]/.test(value) ? `{${value}}` : value;
}

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
    if (env.DATABASE_URL) return env.DATABASE_URL;
    if (!env.DB_SERVER) return undefined;

    const encrypt = env.DB_ENCRYPT === 'true';
    // Matches the previous mssql config: trust the cert by default only for unencrypted (local) servers.
    const trustServerCertificate = env.DB_TRUST_SERVER_CERT ? env.DB_TRUST_SERVER_CERT === 'true' : !encrypt;

    const params: Record<string, string | undefined> = {
        database: env.DB_DATABASE || 'CRM_DB',
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        encrypt: String(encrypt),
        trustServerCertificate: String(trustServerCertificate),
        connectionTimeout: env.DB_CONNECTION_TIMEOUT || '30000',
    };
    const query = Object.entries(params)
        .filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '')
        .map(([key, value]) => `${key}=${escapeValue(value)}`)
        .join(';');

    return `sqlserver://${env.DB_SERVER}:${env.DB_PORT || '1433'};${query}`;
}
