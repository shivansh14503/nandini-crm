import sql, { type config as SqlConfig } from 'mssql';
import { ENV } from './env.js';

type ConnectionPool = InstanceType<typeof sql.ConnectionPool>;

const sqlConfig: SqlConfig = {
    user: ENV.DB.USER,
    password: ENV.DB.PASSWORD,
    database: ENV.DB.DATABASE,
    server: ENV.DB.SERVER,
    port: ENV.DB.PORT,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
    },
    options: {
        encrypt: false, // FALSE for local SQL Server
        trustServerCertificate: true, // TRUE so local self-signed certs don't crash
    },
};

export const poolPromise: Promise<ConnectionPool> = new sql.ConnectionPool(sqlConfig)
    .connect()
    .then((pool: ConnectionPool) => {
        console.log('✅ Connected to Local MSSQL Database');
        return pool;
    })
    .catch((err: Error) => {
        console.error('❌ Database Connection Failed:', err.message);
        process.exit(1);
    });

export { sql };
export default poolPromise;
