import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

export const isPostgresConfigured = Boolean(
  process.env.SQL_HOST?.trim() || process.env.DATABASE_URL?.trim()
);

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: Pool | undefined;
}

// Function to create or retrieve the connection pool.
export const createPool = (): Pool | null => {
  if (!isPostgresConfigured) {
    return null;
  }
  if (!global._postgresPool) {
    const hasSqlHost = Boolean(process.env.SQL_HOST?.trim());
    const useSsl =
      process.env.SQL_SSL === 'true' ||
      (!hasSqlHost && Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')));
    const poolConfig = hasSqlHost
      ? {
          host: process.env.SQL_HOST,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          database: process.env.SQL_DB_NAME,
          ssl: process.env.SQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
          max: 10,
          connectionTimeoutMillis: 15000,
        }
      : {
          connectionString: process.env.DATABASE_URL,
          ssl: useSsl ? { rejectUnauthorized: false } : undefined,
          max: 10,
          connectionTimeoutMillis: 15000,
        };

    global._postgresPool = new Pool(poolConfig);

    // Prevent unhandled pool-level errors from crashing the application
    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

function createMockChain(): any {
  const emptyPromise = Promise.resolve([]);
  const proxy: any = new Proxy(() => proxy, {
    get(_, prop) {
      if (prop === 'then') return emptyPromise.then.bind(emptyPromise);
      if (prop === 'catch') return emptyPromise.catch.bind(emptyPromise);
      if (prop === 'finally') return emptyPromise.finally.bind(emptyPromise);
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

export const db: NodePgDatabase<typeof schema> = pool
  ? drizzle(pool, { schema })
  : (new Proxy({}, {
      get(_, prop) {
        if (prop === 'transaction') {
          return async (cb: (tx: any) => Promise<any>) => cb(db);
        }
        return () => createMockChain();
      },
    }) as unknown as NodePgDatabase<typeof schema>);
