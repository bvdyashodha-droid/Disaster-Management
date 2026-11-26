import { Pool } from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

declare global {
  var _dmisSupabasePool: Pool | undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_DATABASE_URL && process.env.SUPABASE_DATABASE_URL.trim().length > 0);
}

export function getPool(): Pool {
  if (!isSupabaseConfigured()) {
    throw new Error('SUPABASE_DATABASE_URL is not configured on the server.');
  }

  if (!global._dmisSupabasePool) {
    const useSsl = process.env.SUPABASE_SSL !== 'false';
    global._dmisSupabasePool = new Pool({
      connectionString: process.env.SUPABASE_DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: 10,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
    });

    global._dmisSupabasePool.on('error', (err) => {
      console.error('Idle Supabase PostgreSQL client error:', err.message);
    });
  }

  return global._dmisSupabasePool;
}

export async function queryDb<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  const pool = getPool();
  try {
    return await pool.query<T>(text, params);
  } catch (error) {
    console.error('Database query error:', error instanceof Error ? error.message : 'Unknown error');
    throw new Error('Database operation failed. Please verify your Supabase connection and migrations.', {
      cause: error,
    });
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseHealth(): Promise<{
  supabaseConfigured: boolean;
  connected: boolean;
  schemaReady: boolean;
  hasOfficers: boolean;
  errorMessage?: string;
}> {
  if (!isSupabaseConfigured()) {
    return {
      supabaseConfigured: false,
      connected: false,
      schemaReady: false,
      hasOfficers: false,
    };
  }

  try {
    const pool = getPool();
    const tableCheck = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'officers'
      ) AS exists`
    );
    const schemaReady = Boolean(tableCheck.rows[0]?.exists);
    if (!schemaReady) {
      return {
        supabaseConfigured: true,
        connected: true,
        schemaReady: false,
        hasOfficers: false,
      };
    }

    const officerCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM public.officers WHERE is_deleted = FALSE`
    );
    const hasOfficers = Number(officerCount.rows[0]?.count ?? '0') > 0;
    return {
      supabaseConfigured: true,
      connected: true,
      schemaReady: true,
      hasOfficers,
    };
  } catch (error) {
    return {
      supabaseConfigured: true,
      connected: false,
      schemaReady: false,
      hasOfficers: false,
      errorMessage: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}
