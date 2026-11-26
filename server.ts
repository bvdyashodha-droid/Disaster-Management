import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import type { PoolClient } from 'pg';
import { createServer as createViteServer } from 'vite';
import { checkDatabaseHealth, getPool, isSupabaseConfigured, queryDb, withTransaction } from './server/db.ts';
import {
  generateEmailOtp,
  hashEmailOtp,
  hashPassword,
  maskEmail,
  requireAuth,
  requireRoles,
  signSessionToken,
  verifyEmailOtp,
  verifyPassword,
} from './server/auth.ts';
import type { AuthenticatedRequest } from './server/auth.ts';
import { isSmtpConfigured, sendVerificationCodeEmail } from './server/mailer.ts';
import {
  DATA_TABLE_ORDER,
  isValidTableKey,
  sanitizeOfficerRow,
  TABLE_SCHEMAS,
} from './server/schemaRegistry.ts';
import type {
  DataTableKey,
  MergeConflict,
  MergeResolutionItem,
  OfflineMutation,
  SyncPackage,
  UserRole,
} from './src/types/dmis.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUuid(val: unknown): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

function isValidEmail(val: unknown): val is string {
  return typeof val === 'string' && EMAIL_REGEX.test(val.trim());
}

type OtpPurpose = 'create_admin' | 'bootstrap_admin' | 'password_reset';

async function createAndSendOtpChallenge(params: {
  officerId?: string | null;
  actorId?: string | null;
  targetEmail: string;
  purpose: OtpPurpose;
  username?: string;
}): Promise<string> {
  const code = generateEmailOtp();
  const codeHash = hashEmailOtp(code);
  const challengeId = crypto.randomUUID();
  const cleanEmail = params.targetEmail.trim().toLowerCase();

  await queryDb(
    `INSERT INTO public.email_verification_codes
      (id, officer_id, actor_id, target_email, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '15 minutes')`,
    [challengeId, params.officerId ?? null, params.actorId ?? null, cleanEmail, params.purpose, codeHash]
  );

  await sendVerificationCodeEmail({
    to: cleanEmail,
    code,
    purpose: params.purpose,
    username: params.username,
  });

  return challengeId;
}

async function verifyAndConsumeOtpChallenge(params: {
  challengeId: string;
  code: string;
  purpose: OtpPurpose;
  targetEmail?: string;
  actorId?: string | null;
}): Promise<{ id: string; officer_id: string | null; target_email: string }> {
  if (!isUuid(params.challengeId) || !/^\d{6}$/.test(params.code.trim())) {
    throw new Error('OTP_INVALID');
  }

  const res = await queryDb<{
    id: string;
    officer_id: string | null;
    actor_id: string | null;
    target_email: string;
    code_hash: string;
    attempts: number;
    max_attempts: number;
    expires_at: string;
    used_at: string | null;
  }>(
    `SELECT id, officer_id, actor_id, target_email, code_hash, attempts, max_attempts, expires_at, used_at
     FROM public.email_verification_codes
     WHERE id = $1 AND purpose = $2
     LIMIT 1`,
    [params.challengeId, params.purpose]
  );

  const row = res.rows[0];
  if (!row || row.used_at) {
    throw new Error('OTP_INVALID');
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new Error('OTP_EXPIRED');
  }
  if (row.attempts >= row.max_attempts) {
    throw new Error('OTP_LOCKED');
  }
  if (params.targetEmail && row.target_email.toLowerCase() !== params.targetEmail.trim().toLowerCase()) {
    throw new Error('OTP_INVALID');
  }
  if (params.actorId !== undefined && row.actor_id !== params.actorId) {
    throw new Error('OTP_INVALID');
  }

  // Persist attempt increment immediately outside any rollback transaction
  await queryDb(`UPDATE public.email_verification_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);

  if (!verifyEmailOtp(params.code.trim(), row.code_hash)) {
    throw new Error('OTP_INVALID');
  }

  const consumed = await queryDb<{ id: string }>(
    `UPDATE public.email_verification_codes
     SET used_at = NOW()
     WHERE id = $1 AND used_at IS NULL
     RETURNING id`,
    [row.id]
  );
  if (!consumed.rows[0]) {
    throw new Error('OTP_INVALID');
  }

  return {
    id: row.id,
    officer_id: row.officer_id,
    target_email: row.target_email,
  };
}

const COMPARABLE_IGNORE_FIELDS = new Set(['version', 'created_at', 'updated_at', 'updated_by']);

function valuesDiffer(a: unknown, b: unknown): boolean {
  if (a === b) return false;
  if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) {
    return false;
  }
  return JSON.stringify(a) !== JSON.stringify(b);
}

function getDifferingFields(
  table: DataTableKey,
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): string[] {
  const meta = TABLE_SCHEMAS[table];
  const diffs: string[] = [];
  for (const col of meta.columns) {
    if (col === 'id' || col === 'password_hash' || COMPARABLE_IGNORE_FIELDS.has(col)) continue;
    if (incoming[col] === undefined) continue;
    if (valuesDiffer(existing[col], incoming[col])) {
      diffs.push(col);
    }
  }
  return diffs;
}

async function createSnapshot(
  client: PoolClient,
  table: DataTableKey,
  recordId: string,
  reason: string,
  snapshotData: Record<string, unknown>,
  actorId: string | null,
  deviceId: string
): Promise<void> {
  const safeData = table === 'officers' ? sanitizeOfficerRow(snapshotData) : snapshotData;
  await client.query(
    `INSERT INTO public.record_snapshots (entity_table, record_id, snapshot_reason, snapshot_data, created_by, device_id)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
    [table, recordId, reason, JSON.stringify(safeData), actorId, deviceId]
  );
}

function extractAuditSummary(record: Record<string, unknown> | undefined): string {
  if (!record) return '';
  const candidates = [
    record.disaster_code,
    record.title,
    record.family_ref_no,
    record.head_name,
    record.person_ref_no,
    record.full_name,
    record.assessment_no,
    record.voucher_no,
    record.username,
    record.district_code,
    record.ds_code,
    record.gn_code,
    record.name_en,
  ]
    .filter((v) => typeof v === 'string' && v.trim() !== '')
    .map((v) => String(v).trim());
  return candidates.slice(0, 2).join(' — ');
}

async function writeAuditLog(
  client: PoolClient,
  actorId: string | null,
  actorUsername: string,
  action: string,
  table: string,
  recordId: string | null,
  deviceId: string,
  details: Record<string, unknown>
): Promise<void> {
  await client.query(
    `INSERT INTO public.audit_logs (actor_id, actor_username, action, entity_table, record_id, device_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [actorId, actorUsername, action, table, recordId, deviceId, JSON.stringify(details)]
  );
}

function normalizeRecordInput(
  table: DataTableKey,
  raw: Record<string, unknown>,
  actorId: string | null
): Record<string, unknown> {
  const meta = TABLE_SCHEMAS[table];
  const out: Record<string, unknown> = {};
  for (const col of meta.columns) {
    if (col === 'created_at' || col === 'updated_at') continue;
    if (raw[col] !== undefined) {
      if (meta.jsonColumns.includes(col)) {
        out[col] =
          typeof raw[col] === 'object' && raw[col] !== null
            ? raw[col]
            : col === 'photos'
              ? []
              : {};
      } else {
        out[col] = raw[col];
      }
    }
  }
  if (!isUuid(out.id)) {
    out.id = crypto.randomUUID();
  }
  if (typeof out.device_id !== 'string' || !out.device_id.trim()) {
    out.device_id = 'server';
  }
  if (actorId) {
    out.updated_by = actorId;
  }
  return out;
}

async function upsertRow(
  client: PoolClient,
  table: DataTableKey,
  data: Record<string, unknown>,
  options: { preserveSnapshotReason?: string; actorId: string | null; deviceId: string }
): Promise<Record<string, unknown>> {
  const meta = TABLE_SCHEMAS[table];
  const existingRes = await client.query<Record<string, unknown>>(
    `SELECT * FROM public.${table} WHERE id = $1`,
    [data.id]
  );
  const existing = existingRes.rows[0];

  if (existing && options.preserveSnapshotReason) {
    await createSnapshot(
      client,
      table,
      String(data.id),
      options.preserveSnapshotReason,
      existing,
      options.actorId,
      options.deviceId
    );
  }

  const colsToWrite = meta.columns.filter((c) => {
    if (c === 'created_at' || c === 'updated_at') return false;
    return data[c] !== undefined;
  });

  if (!colsToWrite.includes('id')) {
    colsToWrite.unshift('id');
  }

  const placeholders = colsToWrite.map((c, idx) =>
    meta.jsonColumns.includes(c) ? `$${idx + 1}::jsonb` : `$${idx + 1}`
  );
  const values = colsToWrite.map((c) =>
    meta.jsonColumns.includes(c) ? JSON.stringify(data[c] ?? {}) : data[c]
  );

  const updateSet = colsToWrite
    .filter((c) => c !== 'id' && c !== 'version')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .concat([`version = public.${table}.version + 1`, `updated_at = NOW()`]);

  const sql = `
    INSERT INTO public.${table} (${colsToWrite.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (id) DO UPDATE SET ${updateSet.join(', ')}
    RETURNING *
  `;
  const result = await client.query<Record<string, unknown>>(sql, values);
  const saved = result.rows[0];
  return table === 'officers' ? sanitizeOfficerRow(saved) : saved;
}

const ADMIN_ONLY_TABLES: DataTableKey[] = [
  'relief_assistance',
  'districts',
  'divisional_secretariats',
  'gn_divisions',
  'officers',
];

function isAdminRole(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin';
}

function canWriteTable(role: UserRole, table: DataTableKey): boolean {
  if (isAdminRole(role)) return true;
  if (ADMIN_ONLY_TABLES.includes(table)) return false;
  if (role === 'auditor_viewer') return false;
  if (role === 'district_officer') {
    return ['disasters', 'affected_families', 'affected_persons', 'house_damages'].includes(table);
  }
  if (role === 'ds_officer' || role === 'gn_officer') {
    return ['affected_families', 'affected_persons', 'house_damages'].includes(table);
  }
  return false;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '25mb' }));

  // Health & Readiness (safe non-secret summary)
  app.get('/api/health', async (_req, res) => {
    const health = await checkDatabaseHealth();
    res.json({
      ok: true,
      ...health,
      bootstrapPasscodeRequired: Boolean(process.env.ADMIN_BOOTSTRAP_PASSCODE?.trim()),
      smtpConfigured: isSmtpConfigured(),
    });
  });

  // One-time Super Admin Bootstrap when Supabase officers table is empty
  app.post('/api/auth/bootstrap', async (req, res) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({ error: 'Supabase PostgreSQL is not configured yet.' });
      return;
    }

    const envPasscode = process.env.ADMIN_BOOTSTRAP_PASSCODE?.trim();
    const {
      username,
      full_name,
      email,
      password,
      designation,
      phone,
      bootstrap_passcode,
      verification_challenge_id,
      verification_code,
    } = req.body ?? {};

    if (envPasscode && bootstrap_passcode !== envPasscode) {
      res.status(403).json({ error: 'Invalid admin bootstrap passcode.' });
      return;
    }

    if (
      typeof username !== 'string' ||
      username.trim().length < 3 ||
      typeof password !== 'string' ||
      password.length < 8 ||
      typeof full_name !== 'string' ||
      !full_name.trim() ||
      !isValidEmail(email)
    ) {
      res.status(400).json({
        error: 'Valid username (3+ chars), full name, official email address, and password (8+ chars) are required.',
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();

    try {
      const countCheck = await queryDb<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public.officers WHERE is_deleted = FALSE`
      );
      if (Number(countCheck.rows[0]?.count ?? '0') > 0) {
        res.status(409).json({ error: 'Initial administrator is already configured. Please sign in.' });
        return;
      }

      let emailVerified = false;
      if (isSmtpConfigured()) {
        if (typeof verification_challenge_id !== 'string' || typeof verification_code !== 'string') {
          const challengeId = await createAndSendOtpChallenge({
            targetEmail: cleanEmail,
            purpose: 'bootstrap_admin',
            username: cleanUsername,
          });
          res.status(202).json({
            verificationRequired: true,
            challengeId,
            email: cleanEmail,
          });
          return;
        }

        await verifyAndConsumeOtpChallenge({
          challengeId: verification_challenge_id,
          code: verification_code,
          purpose: 'bootstrap_admin',
          targetEmail: cleanEmail,
        });
        emailVerified = true;
      }

      const created = await withTransaction(async (client) => {
        const countRes = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM public.officers WHERE is_deleted = FALSE`
        );
        if (Number(countRes.rows[0]?.count ?? '0') > 0) {
          throw new Error('BOOTSTRAP_LOCKED');
        }

        const id = crypto.randomUUID();
        const passwordHash = hashPassword(password);
        const inserted = await client.query<Record<string, unknown>>(
          `INSERT INTO public.officers (id, username, email, email_verified, password_hash, full_name, role, designation, phone, is_active, device_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'super_admin', $7, $8, TRUE, 'web-bootstrap')
           RETURNING *`,
          [
            id,
            cleanUsername,
            cleanEmail,
            emailVerified,
            passwordHash,
            full_name.trim(),
            typeof designation === 'string' && designation.trim() ? designation.trim() : 'System Administrator',
            typeof phone === 'string' ? phone.trim() : '',
          ]
        );
        await writeAuditLog(client, id, cleanUsername, 'ADMIN_BOOTSTRAP', 'officers', id, 'web-bootstrap', {
          role: 'super_admin',
          email_verified: emailVerified,
        });
        return sanitizeOfficerRow(inserted.rows[0]);
      });

      const token = signSessionToken({
        id: String(created.id),
        username: String(created.username),
        full_name: String(created.full_name),
        role: 'super_admin',
        designation: String(created.designation ?? ''),
      });

      res.status(201).json({ token, user: { ...created, auth_mode: 'supabase_server' } });
    } catch (error) {
      if (error instanceof Error && error.message === 'BOOTSTRAP_LOCKED') {
        res.status(409).json({ error: 'Initial administrator is already configured. Please sign in.' });
        return;
      }
      if (error instanceof Error && error.message === 'OTP_EXPIRED') {
        res.status(400).json({ error: 'Verification code expired. Please request a new code.' });
        return;
      }
      if (error instanceof Error && error.message === 'OTP_LOCKED') {
        res.status(429).json({ error: 'Too many invalid attempts. Please request a new verification code.' });
        return;
      }
      if (error instanceof Error && error.message === 'OTP_INVALID') {
        res.status(400).json({ error: 'Invalid 6-digit verification code.' });
        return;
      }
      console.error('Bootstrap error:', error);
      res.status(500).json({ error: 'Failed to create initial administrator account.' });
    }
  });

  // Forgot Password: Role-differentiated (Admins & Super Admins verify via email code; others contact Admin)
  app.post('/api/auth/forgot-password/request', async (req, res) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({ error: 'Supabase PostgreSQL is not configured yet.' });
      return;
    }

    const { username } = req.body ?? {};
    if (typeof username !== 'string' || !username.trim()) {
      res.status(400).json({ error: 'Username is required.' });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();

    try {
      const result = await queryDb<Record<string, unknown>>(
        `SELECT id, username, email, role, full_name, is_active
         FROM public.officers
         WHERE username = $1 AND is_deleted = FALSE
         LIMIT 1`,
        [cleanUsername]
      );
      const officer = result.rows[0];

      if (!officer || !officer.is_active || !isAdminRole(officer.role as UserRole)) {
        if (officer && officer.is_active) {
          await queryDb(
            `INSERT INTO public.audit_logs (actor_id, actor_username, action, entity_table, record_id, device_id, details)
             VALUES ($1, $2, 'PASSWORD_RESET_CONTACT_ADMIN', 'officers', $3, 'web-auth', $4::jsonb)`,
            [
              String(officer.id),
              String(officer.username),
              String(officer.id),
              JSON.stringify({ role: officer.role, note: 'Field/viewer user directed to contact Admin' }),
            ]
          );
        }
        res.json({
          flow: 'contact_admin',
          message:
            'Self-service password reset is restricted to Administrators and Super Administrators. Please contact your Administrator or Super Administrator to reset your password.',
        });
        return;
      }

      if (!isValidEmail(officer.email)) {
        res.status(400).json({
          error:
            'This Administrator account does not have a valid email address configured. Contact another Super Administrator.',
        });
        return;
      }

      if (!isSmtpConfigured()) {
        res.status(503).json({
          error:
            'Email delivery (SMTP) is not configured on the server. Configure SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM in server Secrets.',
        });
        return;
      }

      const recentRes = await queryDb<{ id: string }>(
        `SELECT id FROM public.email_verification_codes
         WHERE officer_id = $1 AND purpose = 'password_reset' AND created_at > NOW() - INTERVAL '60 seconds'
         LIMIT 1`,
        [String(officer.id)]
      );
      if (recentRes.rows[0]) {
        res.status(429).json({ error: 'Please wait 60 seconds before requesting another verification code.' });
        return;
      }

      const challengeId = await createAndSendOtpChallenge({
        officerId: String(officer.id),
        targetEmail: String(officer.email),
        purpose: 'password_reset',
        username: String(officer.username),
      });

      await queryDb(
        `INSERT INTO public.audit_logs (actor_id, actor_username, action, entity_table, record_id, device_id, details)
         VALUES ($1, $2, 'ADMIN_PASSWORD_RESET_CODE_SENT', 'officers', $3, 'web-auth', $4::jsonb)`,
        [
          String(officer.id),
          String(officer.username),
          String(officer.id),
          JSON.stringify({ masked_email: maskEmail(String(officer.email)) }),
        ]
      );

      res.json({
        flow: 'email_code',
        challengeId,
        maskedEmail: maskEmail(String(officer.email)),
      });
    } catch (error) {
      console.error('Forgot password request error:', error);
      res.status(500).json({ error: 'Failed to process password reset request.' });
    }
  });

  app.post('/api/auth/forgot-password/verify', async (req, res) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({ error: 'Supabase PostgreSQL is not configured yet.' });
      return;
    }

    const { challengeId, code, newPassword } = req.body ?? {};
    if (
      typeof challengeId !== 'string' ||
      typeof code !== 'string' ||
      typeof newPassword !== 'string' ||
      newPassword.length < 8
    ) {
      res.status(400).json({ error: 'Valid verification code and a new password (8+ characters) are required.' });
      return;
    }

    try {
      const verified = await verifyAndConsumeOtpChallenge({
        challengeId,
        code,
        purpose: 'password_reset',
      });

      if (!verified.officer_id) {
        res.status(400).json({ error: 'Invalid password reset challenge.' });
        return;
      }

      const newHash = hashPassword(newPassword);
      await withTransaction(async (client) => {
        const updated = await client.query<{ id: string; username: string; role: UserRole }>(
          `UPDATE public.officers
           SET password_hash = $1, email_verified = TRUE, updated_at = NOW()
           WHERE id = $2 AND is_deleted = FALSE AND is_active = TRUE
           RETURNING id, username, role`,
          [newHash, verified.officer_id]
        );
        const officer = updated.rows[0];
        if (!officer || !isAdminRole(officer.role)) {
          throw new Error('OFFICER_INVALID');
        }
        await writeAuditLog(
          client,
          officer.id,
          officer.username,
          'ADMIN_PASSWORD_RESET_COMPLETED',
          'officers',
          officer.id,
          'web-auth',
          { role: officer.role }
        );
      });

      res.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'OTP_EXPIRED') {
        res.status(400).json({ error: 'Verification code expired. Please request a new code.' });
        return;
      }
      if (error instanceof Error && error.message === 'OTP_LOCKED') {
        res.status(429).json({ error: 'Too many invalid attempts. Please request a new verification code.' });
        return;
      }
      if (error instanceof Error && error.message === 'OTP_INVALID') {
        res.status(400).json({ error: 'Invalid 6-digit verification code.' });
        return;
      }
      console.error('Password reset verify error:', error);
      res.status(500).json({ error: 'Failed to reset password.' });
    }
  });

  // Sign in against Supabase officers table
  app.post('/api/auth/login', async (req, res) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({ error: 'Supabase PostgreSQL is not configured yet.' });
      return;
    }

    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    try {
      const result = await queryDb<Record<string, unknown>>(
        `SELECT * FROM public.officers WHERE username = $1 AND is_deleted = FALSE LIMIT 1`,
        [username.trim().toLowerCase()]
      );
      const officer = result.rows[0];
      if (!officer || !officer.is_active || !verifyPassword(password, String(officer.password_hash ?? ''))) {
        res.status(401).json({ error: 'Invalid credentials or inactive officer account.' });
        return;
      }

      const safeUser = sanitizeOfficerRow(officer);
      const token = signSessionToken({
        id: String(officer.id),
        username: String(officer.username),
        full_name: String(officer.full_name),
        role: officer.role as UserRole,
        designation: String(officer.designation ?? ''),
        district_id: (officer.district_id as string | null) ?? null,
        ds_id: (officer.ds_id as string | null) ?? null,
        gn_id: (officer.gn_id as string | null) ?? null,
      });

      res.json({ token, user: { ...safeUser, auth_mode: 'supabase_server' } });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Authentication failed.' });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: { ...req.officer, auth_mode: 'supabase_server' } });
  });

  // List / Search / Filter / Sort / Paginate records
  app.get('/api/records/:table', requireAuth, async (req: AuthenticatedRequest, res) => {
    const tableParam = String(req.params.table);
    if (!isValidTableKey(tableParam)) {
      res.status(400).json({ error: 'Invalid module table requested.' });
      return;
    }
    if (ADMIN_ONLY_TABLES.includes(tableParam) && !isAdminRole(req.officer!.role)) {
      res.status(403).json({ error: 'Admin or Super Admin access is required for this module.' });
      return;
    }

    const meta = TABLE_SCHEMAS[tableParam];
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const sortByRaw = typeof req.query.sortBy === 'string' ? req.query.sortBy : meta.defaultSort;
    const sortBy = meta.columns.includes(sortByRaw) ? sortByRaw : meta.defaultSort;
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(250, Math.max(1, Number(req.query.pageSize ?? 50) || 50));
    const includeDeleted = req.query.includeDeleted === 'true';

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (!includeDeleted) {
      whereClauses.push('is_deleted = FALSE');
    }

    for (const col of meta.filterableColumns) {
      const val = req.query[col];
      if (typeof val === 'string' && val.trim() !== '') {
        params.push(val.trim());
        whereClauses.push(`${col}::text = $${params.length}`);
      }
    }

    if (search && meta.searchableColumns.length > 0) {
      params.push(`%${search}%`);
      const idx = params.length;
      const searchExpr = meta.searchableColumns.map((c) => `COALESCE(${c}::text, '') ILIKE $${idx}`).join(' OR ');
      whereClauses.push(`(${searchExpr})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const selectCols =
      tableParam === 'officers'
        ? meta.columns.filter((c) => c !== 'password_hash').join(', ')
        : meta.columns.join(', ');

    try {
      const countRes = await queryDb<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM public.${tableParam} ${whereSql}`,
        params
      );
      const total = Number(countRes.rows[0]?.total ?? '0');

      const offset = (page - 1) * pageSize;
      const listParams = [...params, pageSize, offset];
      const rowsRes = await queryDb<Record<string, unknown>>(
        `SELECT ${selectCols}
         FROM public.${tableParam}
         ${whereSql}
         ORDER BY ${sortBy} ${sortDir} NULLS LAST
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      );

      res.json({
        rows: rowsRes.rows,
        total,
        page,
        pageSize,
      });
    } catch (error) {
      console.error(`Fetch ${tableParam} failed:`, error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load records.' });
    }
  });

  // Create or Upsert record
  app.post('/api/records/:table', requireAuth, async (req: AuthenticatedRequest, res) => {
    const tableParam = String(req.params.table);
    if (!isValidTableKey(tableParam)) {
      res.status(400).json({ error: 'Invalid table.' });
      return;
    }
    if (!canWriteTable(req.officer!.role, tableParam)) {
      res.status(403).json({ error: 'You do not have permission to modify this module.' });
      return;
    }

    const payload = { ...(req.body ?? {}) } as Record<string, unknown>;
    const verificationChallengeId =
      typeof payload.verification_challenge_id === 'string' ? payload.verification_challenge_id : '';
    const verificationCode =
      typeof payload.verification_code === 'string' ? payload.verification_code : '';

    if (tableParam === 'officers') {
      if (typeof payload.password === 'string' && payload.password.length >= 8) {
        payload.password_hash = hashPassword(payload.password);
      } else if (!payload.id) {
        res.status(400).json({ error: 'Password of at least 8 characters is required for new officers.' });
        return;
      }
      if (typeof payload.username === 'string') {
        payload.username = payload.username.trim().toLowerCase();
      }
      if (typeof payload.email === 'string') {
        payload.email = payload.email.trim().toLowerCase();
      }
    }

    const normalized = normalizeRecordInput(tableParam, payload, req.officer!.id);
    const deviceId = String(normalized.device_id ?? 'web-client');

    try {
      // Require email + 6-digit email verification code when creating an Admin / Super Admin
      if (tableParam === 'officers' && isAdminRole(normalized.role as UserRole)) {
        if (!isValidEmail(normalized.email)) {
          res.status(400).json({
            error: 'A valid official email address is required for Admin and Super Admin accounts.',
          });
          return;
        }

        const existingAdminRes = await queryDb<{ id: string; email: string; email_verified: boolean; role: UserRole }>(
          `SELECT id, email, email_verified, role FROM public.officers WHERE id = $1 LIMIT 1`,
          [normalized.id]
        );
        const existingAdmin = existingAdminRes.rows[0];
        const needsEmailVerification =
          !existingAdmin ||
          !isAdminRole(existingAdmin.role) ||
          !existingAdmin.email_verified ||
          existingAdmin.email.toLowerCase() !== String(normalized.email).toLowerCase();

        if (needsEmailVerification) {
          // Ensure username is not duplicate before emailing a verification code
          const uname = String(normalized.username ?? '').trim();
          if (uname) {
            const dup = await queryDb<{ id: string }>(
              `SELECT id FROM public.officers WHERE username = $1 AND id <> $2 AND is_deleted = FALSE LIMIT 1`,
              [uname, normalized.id]
            );
            if (dup.rows[0]) {
              res.status(409).json({ error: 'Duplicate record detected for unique field: username' });
              return;
            }
          }

          if (!verificationChallengeId || !verificationCode) {
            if (!isSmtpConfigured()) {
              res.status(503).json({
                error:
                  'Email delivery (SMTP) is not configured on the server. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM in server Secrets to verify Admin/Super Admin emails.',
              });
              return;
            }
            const challengeId = await createAndSendOtpChallenge({
              actorId: req.officer!.id,
              targetEmail: String(normalized.email),
              purpose: 'create_admin',
              username: uname,
            });
            await queryDb(
              `INSERT INTO public.audit_logs (actor_id, actor_username, action, entity_table, record_id, device_id, details)
               VALUES ($1, $2, 'ADMIN_EMAIL_VERIFICATION_SENT', 'officers', $3, $4, $5::jsonb)`,
              [
                req.officer!.id,
                req.officer!.username,
                String(normalized.id),
                deviceId,
                JSON.stringify({ target_email: normalized.email, target_role: normalized.role }),
              ]
            );
            res.status(202).json({
              verificationRequired: true,
              challengeId,
              email: String(normalized.email),
            });
            return;
          }

          await verifyAndConsumeOtpChallenge({
            challengeId: verificationChallengeId,
            code: verificationCode,
            purpose: 'create_admin',
            targetEmail: String(normalized.email),
            actorId: req.officer!.id,
          });
          normalized.email_verified = true;
        }
      }

      const saved = await withTransaction(async (client) => {
        const meta = TABLE_SCHEMAS[tableParam];
        // Duplicate natural key detection
        for (const natCol of meta.naturalKeyColumns) {
          const val = normalized[natCol];
          if (typeof val === 'string' && val.trim()) {
            const dup = await client.query<{ id: string }>(
              `SELECT id FROM public.${tableParam} WHERE ${natCol} = $1 AND id <> $2 AND is_deleted = FALSE LIMIT 1`,
              [val.trim(), normalized.id]
            );
            if (dup.rows[0]) {
              throw new Error(`DUPLICATE_KEY:${natCol}`);
            }
          }
        }

        const existingCheck = await client.query<{ id: string }>(
          `SELECT id FROM public.${tableParam} WHERE id = $1 LIMIT 1`,
          [normalized.id]
        );
        const isExisting = Boolean(existingCheck.rows[0]);

        const row = await upsertRow(client, tableParam, normalized, {
          preserveSnapshotReason: 'pre_upsert_backup',
          actorId: req.officer!.id,
          deviceId,
        });
        await writeAuditLog(
          client,
          req.officer!.id,
          req.officer!.username,
          isExisting ? 'UPDATE' : 'CREATE',
          tableParam,
          String(row.id),
          deviceId,
          {
            actor_name: req.officer!.full_name,
            actor_role: req.officer!.role,
            summary: extractAuditSummary(row),
            version: row.version,
          }
        );
        return row;
      });
      res.status(201).json({ record: saved });
    } catch (error) {
      if (error instanceof Error && error.message === 'OTP_EXPIRED') {
        res.status(400).json({ error: 'Verification code expired. Please request a new code.' });
        return;
      }
      if (error instanceof Error && error.message === 'OTP_LOCKED') {
        res.status(429).json({ error: 'Too many invalid verification attempts. Request a new code.' });
        return;
      }
      if (error instanceof Error && error.message === 'OTP_INVALID') {
        res.status(400).json({ error: 'Invalid 6-digit email verification code.' });
        return;
      }
      if (error instanceof Error && error.message.startsWith('DUPLICATE_KEY:')) {
        const field = error.message.split(':')[1];
        res.status(409).json({ error: `Duplicate record detected for unique field: ${field}` });
        return;
      }
      console.error(`Create ${tableParam} failed:`, error);
      res.status(500).json({ error: 'Failed to save record.' });
    }
  });

  // Update record with optimistic version conflict check + original snapshot preservation
  app.put('/api/records/:table/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const tableParam = String(req.params.table);
    const id = String(req.params.id);
    if (!isValidTableKey(tableParam) || !isUuid(id)) {
      res.status(400).json({ error: 'Invalid table or record ID.' });
      return;
    }
    if (!canWriteTable(req.officer!.role, tableParam)) {
      res.status(403).json({ error: 'You do not have permission to modify this module.' });
      return;
    }

    const payload = { ...(req.body ?? {}), id } as Record<string, unknown>;
    const expectedVersion = typeof payload.expected_version === 'number' ? payload.expected_version : null;
    const verificationChallengeId =
      typeof payload.verification_challenge_id === 'string' ? payload.verification_challenge_id : '';
    const verificationCode =
      typeof payload.verification_code === 'string' ? payload.verification_code : '';

    if (tableParam === 'officers') {
      if (typeof payload.password === 'string' && payload.password.length >= 8) {
        payload.password_hash = hashPassword(payload.password);
      } else {
        delete payload.password_hash;
      }
      if (typeof payload.username === 'string') {
        payload.username = payload.username.trim().toLowerCase();
      }
      if (typeof payload.email === 'string') {
        payload.email = payload.email.trim().toLowerCase();
      }
    }

    const normalized = normalizeRecordInput(tableParam, payload, req.officer!.id);
    const deviceId = String(normalized.device_id ?? 'web-client');

    try {
      if (tableParam === 'officers' && isAdminRole(normalized.role as UserRole)) {
        if (!isValidEmail(normalized.email)) {
          res.status(400).json({
            error: 'A valid official email address is required for Admin and Super Admin accounts.',
          });
          return;
        }
        const existingAdminRes = await queryDb<{ id: string; email: string; email_verified: boolean; role: UserRole }>(
          `SELECT id, email, email_verified, role FROM public.officers WHERE id = $1 LIMIT 1`,
          [id]
        );
        const existingAdmin = existingAdminRes.rows[0];
        if (!existingAdmin) {
          res.status(404).json({ error: 'Record not found.' });
          return;
        }
        const needsEmailVerification =
          !isAdminRole(existingAdmin.role) ||
          !existingAdmin.email_verified ||
          existingAdmin.email.toLowerCase() !== String(normalized.email).toLowerCase();

        if (needsEmailVerification) {
          if (!verificationChallengeId || !verificationCode) {
            if (!isSmtpConfigured()) {
              res.status(503).json({
                error:
                  'Email delivery (SMTP) is not configured on the server. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM in server Secrets.',
              });
              return;
            }
            const challengeId = await createAndSendOtpChallenge({
              officerId: id,
              actorId: req.officer!.id,
              targetEmail: String(normalized.email),
              purpose: 'create_admin',
              username: String(normalized.username ?? ''),
            });
            res.status(202).json({
              verificationRequired: true,
              challengeId,
              email: String(normalized.email),
            });
            return;
          }

          await verifyAndConsumeOtpChallenge({
            challengeId: verificationChallengeId,
            code: verificationCode,
            purpose: 'create_admin',
            targetEmail: String(normalized.email),
            actorId: req.officer!.id,
          });
          normalized.email_verified = true;
        }
      }

      const updated = await withTransaction(async (client) => {
        const existingRes = await client.query<Record<string, unknown>>(
          `SELECT * FROM public.${tableParam} WHERE id = $1 LIMIT 1`,
          [id]
        );
        const existing = existingRes.rows[0];
        if (!existing) {
          throw new Error('NOT_FOUND');
        }
        if (expectedVersion !== null && Number(existing.version) !== expectedVersion) {
          throw new Error('VERSION_CONFLICT');
        }

        const changedFields = getDifferingFields(tableParam, existing, normalized);
        const row = await upsertRow(client, tableParam, normalized, {
          preserveSnapshotReason: 'pre_update_backup',
          actorId: req.officer!.id,
          deviceId,
        });
        await writeAuditLog(
          client,
          req.officer!.id,
          req.officer!.username,
          'UPDATE',
          tableParam,
          id,
          deviceId,
          {
            actor_name: req.officer!.full_name,
            actor_role: req.officer!.role,
            summary: extractAuditSummary(row),
            changed_fields: changedFields,
            from_version: existing.version,
            to_version: row.version,
          }
        );
        return row;
      });
      res.json({ record: updated });
    } catch (error) {
      if (error instanceof Error && error.message === 'OTP_EXPIRED') {
        res.status(400).json({ error: 'Verification code expired. Please request a new code.' });
        return;
      }
      if (error instanceof Error && error.message === 'OTP_LOCKED') {
        res.status(429).json({ error: 'Too many invalid verification attempts. Request a new code.' });
        return;
      }
      if (error instanceof Error && error.message === 'OTP_INVALID') {
        res.status(400).json({ error: 'Invalid 6-digit email verification code.' });
        return;
      }
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        res.status(404).json({ error: 'Record not found.' });
        return;
      }
      if (error instanceof Error && error.message === 'VERSION_CONFLICT') {
        res.status(409).json({
          error: 'Record was modified on another device. Sync and resolve the conflict before overwriting.',
        });
        return;
      }
      console.error(`Update ${tableParam} failed:`, error);
      res.status(500).json({ error: 'Failed to update record.' });
    }
  });

  // Soft delete with snapshot preservation
  app.delete('/api/records/:table/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const tableParam = String(req.params.table);
    const id = String(req.params.id);
    if (!isValidTableKey(tableParam) || !isUuid(id)) {
      res.status(400).json({ error: 'Invalid table or record ID.' });
      return;
    }
    if (!['super_admin', 'admin', 'district_officer'].includes(req.officer!.role) || !canWriteTable(req.officer!.role, tableParam)) {
      res.status(403).json({ error: 'You do not have permission to archive/delete records in this module.' });
      return;
    }

    try {
      await withTransaction(async (client) => {
        const existingRes = await client.query<Record<string, unknown>>(
          `SELECT * FROM public.${tableParam} WHERE id = $1 LIMIT 1`,
          [id]
        );
        const existing = existingRes.rows[0];
        if (!existing) {
          throw new Error('NOT_FOUND');
        }
        await createSnapshot(
          client,
          tableParam,
          id,
          'pre_soft_delete_archive',
          existing,
          req.officer!.id,
          'web-client'
        );
        await client.query(
          `UPDATE public.${tableParam} SET is_deleted = TRUE, updated_by = $2, updated_at = NOW() WHERE id = $1`,
          [id, req.officer!.id]
        );
        await writeAuditLog(
          client,
          req.officer!.id,
          req.officer!.username,
          'DELETE',
          tableParam,
          id,
          'web-client',
          {
            actor_name: req.officer!.full_name,
            actor_role: req.officer!.role,
            summary: extractAuditSummary(existing),
            soft_deleted: true,
          }
        );
      });
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        res.status(404).json({ error: 'Record not found.' });
        return;
      }
      console.error(`Delete ${tableParam} failed:`, error);
      res.status(500).json({ error: 'Failed to archive record.' });
    }
  });

  // List preserved snapshots
  app.get('/api/snapshots', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const admin = isAdminRole(req.officer!.role);
      const result = admin
        ? await queryDb(
            `SELECT id, entity_table, record_id, snapshot_reason, snapshot_data, device_id, created_at
             FROM public.record_snapshots
             ORDER BY created_at DESC
             LIMIT 100`
          )
        : await queryDb(
            `SELECT id, entity_table, record_id, snapshot_reason, snapshot_data, device_id, created_at
             FROM public.record_snapshots
             WHERE NOT (entity_table = ANY($1))
             ORDER BY created_at DESC
             LIMIT 100`,
            [ADMIN_ONLY_TABLES]
          );
      res.json({ snapshots: result.rows });
    } catch (error) {
      console.error('Snapshots fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch preserved snapshots.' });
    }
  });

  // Restore a specific preserved snapshot (Admin / Super Admin only)
  app.post('/api/snapshots/:id/restore', requireAuth, requireRoles(['super_admin', 'admin']), async (req: AuthenticatedRequest, res) => {
    const snapshotId = String(req.params.id);
    if (!isUuid(snapshotId)) {
      res.status(400).json({ error: 'Invalid snapshot ID.' });
      return;
    }
    try {
      const restored = await withTransaction(async (client) => {
        const snapRes = await client.query<{
          entity_table: string;
          record_id: string;
          snapshot_data: Record<string, unknown>;
        }>(`SELECT entity_table, record_id, snapshot_data FROM public.record_snapshots WHERE id = $1`, [
          snapshotId,
        ]);
        const snap = snapRes.rows[0];
        if (!snap || !isValidTableKey(snap.entity_table)) {
          throw new Error('NOT_FOUND');
        }
        if (!canWriteTable(req.officer!.role, snap.entity_table)) {
          throw new Error('FORBIDDEN');
        }
        const normalized = normalizeRecordInput(
          snap.entity_table,
          { ...snap.snapshot_data, id: snap.record_id, is_deleted: false },
          req.officer!.id
        );
        const restoredRow = await upsertRow(client, snap.entity_table, normalized, {
          preserveSnapshotReason: 'pre_snapshot_restore',
          actorId: req.officer!.id,
          deviceId: 'snapshot-restore',
        });
        await writeAuditLog(
          client,
          req.officer!.id,
          req.officer!.username,
          'RESTORE',
          snap.entity_table,
          snap.record_id,
          'snapshot-restore',
          {
            actor_name: req.officer!.full_name,
            actor_role: req.officer!.role,
            snapshot_id: snapshotId,
            summary: extractAuditSummary(restoredRow),
          }
        );
        return restoredRow;
      });
      res.json({ record: restored });
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        res.status(404).json({ error: 'Snapshot not found.' });
        return;
      }
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        res.status(403).json({ error: 'Admin or Super Admin access is required to restore this snapshot.' });
        return;
      }
      res.status(500).json({ error: 'Failed to restore snapshot.' });
    }
  });

  // Sync Pull: Download dataset for offline IndexedDB cache
  app.get('/api/sync/pull', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const admin = isAdminRole(req.officer!.role);
      const dataset: Record<string, Record<string, unknown>[]> = {};
      for (const table of DATA_TABLE_ORDER) {
        if (!admin && (table === 'officers' || table === 'relief_assistance')) {
          dataset[table] = [];
          continue;
        }
        const cols =
          table === 'officers'
            ? TABLE_SCHEMAS[table].columns.filter((c) => c !== 'password_hash').join(', ')
            : TABLE_SCHEMAS[table].columns.join(', ');
        const rowsRes = await queryDb<Record<string, unknown>>(
          `SELECT ${cols} FROM public.${table} ORDER BY updated_at DESC`
        );
        dataset[table] = rowsRes.rows;
      }
      res.json({
        pulled_at: new Date().toISOString(),
        tables: dataset,
      });
    } catch (error) {
      console.error('Sync pull error:', error);
      res.status(500).json({ error: 'Failed to pull database snapshot for offline sync.' });
    }
  });

  // Sync Push: Push offline mutations with duplicate & version conflict detection (Admin / Super Admin only)
  app.post('/api/sync/push', requireAuth, requireRoles(['super_admin', 'admin']), async (req: AuthenticatedRequest, res) => {
    const mutations = Array.isArray(req.body?.mutations) ? (req.body.mutations as OfflineMutation[]) : [];
    const appliedIds: string[] = [];
    const conflicts: MergeConflict[] = [];

    try {
      await withTransaction(async (client) => {
        for (const mut of mutations) {
          if (!isValidTableKey(mut.table) || !isUuid(mut.record_id)) continue;
          if (!canWriteTable(req.officer!.role, mut.table)) continue;

          const existingRes = await client.query<Record<string, unknown>>(
            `SELECT * FROM public.${mut.table} WHERE id = $1 LIMIT 1`,
            [mut.record_id]
          );
          const existing = existingRes.rows[0];

          if (mut.action === 'soft_delete') {
            if (existing && ['super_admin', 'admin', 'district_officer'].includes(req.officer!.role)) {
              await createSnapshot(
                client,
                mut.table,
                mut.record_id,
                'pre_offline_delete_sync',
                existing,
                req.officer!.id,
                mut.device_id
              );
              await client.query(
                `UPDATE public.${mut.table} SET is_deleted = TRUE, updated_by = $2, updated_at = NOW() WHERE id = $1`,
                [mut.record_id, req.officer!.id]
              );
              await writeAuditLog(
                client,
                req.officer!.id,
                req.officer!.username,
                'DELETE',
                mut.table,
                mut.record_id,
                mut.device_id || 'offline-device',
                {
                  actor_name: req.officer!.full_name,
                  actor_role: req.officer!.role,
                  summary: extractAuditSummary(existing),
                  via: 'offline_sync',
                }
              );
            }
            appliedIds.push(mut.mutation_id);
            continue;
          }

          const incoming = normalizeRecordInput(mut.table, { ...mut.payload, id: mut.record_id }, req.officer!.id);
          const incomingVersion = typeof mut.payload.version === 'number' ? mut.payload.version : 1;

          if (existing) {
            const diffs = getDifferingFields(mut.table, existing, incoming);
            if (diffs.length === 0) {
              appliedIds.push(mut.mutation_id);
              continue;
            }
            if (Number(existing.version) > incomingVersion) {
              conflicts.push({
                conflict_id: mut.mutation_id,
                table: mut.table,
                record_id: mut.record_id,
                conflict_type: 'version_divergence',
                existing_record: mut.table === 'officers' ? sanitizeOfficerRow(existing) : existing,
                incoming_record: incoming,
                differing_fields: diffs,
              });
              continue;
            }
          } else {
            // Check duplicate natural key on new offline record
            const meta = TABLE_SCHEMAS[mut.table];
            let naturalMatch: Record<string, unknown> | undefined;
            let matchedCol = '';
            for (const natCol of meta.naturalKeyColumns) {
              const val = incoming[natCol];
              if (typeof val === 'string' && val.trim()) {
                const dup = await client.query<Record<string, unknown>>(
                  `SELECT * FROM public.${mut.table} WHERE ${natCol} = $1 AND is_deleted = FALSE LIMIT 1`,
                  [val.trim()]
                );
                if (dup.rows[0]) {
                  naturalMatch = dup.rows[0];
                  matchedCol = natCol;
                  break;
                }
              }
            }
            if (naturalMatch) {
              conflicts.push({
                conflict_id: mut.mutation_id,
                table: mut.table,
                record_id: mut.record_id,
                conflict_type: 'duplicate_natural_key',
                natural_key_label: `${matchedCol}: ${String(incoming[matchedCol])}`,
                existing_record: mut.table === 'officers' ? sanitizeOfficerRow(naturalMatch) : naturalMatch,
                incoming_record: incoming,
                differing_fields: getDifferingFields(mut.table, naturalMatch, incoming),
              });
              continue;
            }
          }

          const savedRow = await upsertRow(client, mut.table, incoming, {
            preserveSnapshotReason: 'pre_offline_sync_update',
            actorId: req.officer!.id,
            deviceId: mut.device_id || 'offline-device',
          });
          await writeAuditLog(
            client,
            req.officer!.id,
            req.officer!.username,
            existing ? 'UPDATE' : 'CREATE',
            mut.table,
            String(savedRow.id),
            mut.device_id || 'offline-device',
            {
              actor_name: req.officer!.full_name,
              actor_role: req.officer!.role,
              summary: extractAuditSummary(savedRow),
              via: 'offline_sync',
              version: savedRow.version,
            }
          );
          appliedIds.push(mut.mutation_id);
        }
      });

      res.json({ appliedIds, conflicts });
    } catch (error) {
      console.error('Sync push error:', error);
      res.status(500).json({ error: 'Failed to synchronize offline mutations.' });
    }
  });

  // Analyze multi-phone merge package against Supabase PostgreSQL (Admin / Super Admin only)
  app.post('/api/merge/analyze', requireAuth, requireRoles(['super_admin', 'admin']), async (req: AuthenticatedRequest, res) => {
    const pkg = req.body as SyncPackage;
    if (!pkg || !pkg.tables) {
      res.status(400).json({ error: 'Valid DMIS sync package is required.' });
      return;
    }

    const newRecords: { table: DataTableKey; record: Record<string, unknown> }[] = [];
    const conflicts: MergeConflict[] = [];
    let unchangedCount = 0;

    try {
      for (const table of DATA_TABLE_ORDER) {
        if (table === 'officers') continue; // Officers managed strictly by admin
        if (!canWriteTable(req.officer!.role, table)) continue;
        const incomingRows = Array.isArray(pkg.tables[table])
          ? (pkg.tables[table] as unknown as Record<string, unknown>[])
          : [];
        if (incomingRows.length === 0) continue;

        const existingRes = await queryDb<Record<string, unknown>>(`SELECT * FROM public.${table}`);
        const byId = new Map<string, Record<string, unknown>>();
        const byNatKey = new Map<string, Record<string, unknown>>();
        const meta = TABLE_SCHEMAS[table];

        for (const row of existingRes.rows) {
          byId.set(String(row.id), row);
          for (const natCol of meta.naturalKeyColumns) {
            const val = row[natCol];
            if (typeof val === 'string' && val.trim() && !row.is_deleted) {
              byNatKey.set(`${natCol}:${val.trim().toLowerCase()}`, row);
            }
          }
        }

        for (const inc of incomingRows) {
          const id = String(inc.id ?? '');
          const byIdRow = byId.get(id);
          if (byIdRow) {
            const diffs = getDifferingFields(table, byIdRow, inc);
            if (diffs.length === 0) {
              unchangedCount++;
            } else {
              conflicts.push({
                conflict_id: `${table}:${id}`,
                table,
                record_id: id,
                conflict_type: 'version_divergence',
                existing_record: byIdRow,
                incoming_record: inc,
                differing_fields: diffs,
              });
            }
            continue;
          }

          let dupRow: Record<string, unknown> | undefined;
          let dupLabel = '';
          for (const natCol of meta.naturalKeyColumns) {
            const val = inc[natCol];
            if (typeof val === 'string' && val.trim()) {
              const found = byNatKey.get(`${natCol}:${val.trim().toLowerCase()}`);
              if (found) {
                dupRow = found;
                dupLabel = `${natCol}: ${val.trim()}`;
                break;
              }
            }
          }

          if (dupRow) {
            conflicts.push({
              conflict_id: `${table}:${id || crypto.randomUUID()}`,
              table,
              record_id: String(dupRow.id),
              conflict_type: 'duplicate_natural_key',
              natural_key_label: dupLabel,
              existing_record: dupRow,
              incoming_record: inc,
              differing_fields: getDifferingFields(table, dupRow, inc),
            });
          } else {
            newRecords.push({ table, record: inc });
          }
        }
      }

      res.json({
        newCount: newRecords.length,
        unchangedCount,
        conflicts,
        newRecords,
      });
    } catch (error) {
      console.error('Merge analyze error:', error);
      res.status(500).json({ error: 'Failed to analyze merge package.' });
    }
  });

  // Apply approved merge changes + resolutions atomically with snapshot preservation (Admin / Super Admin only)
  app.post(
    '/api/merge/apply',
    requireAuth,
    requireRoles(['super_admin', 'admin']),
    async (req: AuthenticatedRequest, res) => {
      const { newRecords = [], resolutions = [], conflicts = [], sourceDeviceId = 'phone-merge' } = req.body ?? {};
      const resMap = new Map<string, MergeResolutionItem>();
      for (const r of resolutions as MergeResolutionItem[]) {
        resMap.set(r.conflict_id, r);
      }

      try {
        const stats = await withTransaction(async (client) => {
          let inserted = 0;
          let updated = 0;
          let preserved = 0;

          for (const item of newRecords as { table: DataTableKey; record: Record<string, unknown> }[]) {
            if (!isValidTableKey(item.table) || item.table === 'officers') continue;
            if (!canWriteTable(req.officer!.role, item.table)) continue;
            const normalized = normalizeRecordInput(item.table, item.record, req.officer!.id);
            await upsertRow(client, item.table, normalized, {
              actorId: req.officer!.id,
              deviceId: sourceDeviceId,
            });
            inserted++;
          }

          for (const conflict of conflicts as MergeConflict[]) {
            if (!isValidTableKey(conflict.table) || conflict.table === 'officers') continue;
            if (!canWriteTable(req.officer!.role, conflict.table)) continue;
            const decision = resMap.get(conflict.conflict_id);
            if (!decision || decision.strategy === 'keep_existing') {
              preserved++;
              continue;
            }

            if (decision.strategy === 'keep_both') {
              const cloned: Record<string, unknown> = {
                ...conflict.incoming_record,
                id: crypto.randomUUID(),
              };
              const meta = TABLE_SCHEMAS[conflict.table];
              for (const natCol of meta.naturalKeyColumns) {
                if (typeof cloned[natCol] === 'string' && cloned[natCol]) {
                  cloned[natCol] = `${String(cloned[natCol])}-M${Date.now().toString().slice(-4)}`;
                }
              }
              const normalized = normalizeRecordInput(conflict.table, cloned, req.officer!.id);
              await upsertRow(client, conflict.table, normalized, {
                actorId: req.officer!.id,
                deviceId: sourceDeviceId,
              });
              inserted++;
              continue;
            }

            const chosen =
              decision.strategy === 'field_merge' && decision.merged_record
                ? decision.merged_record
                : conflict.incoming_record;
            const normalized = normalizeRecordInput(
              conflict.table,
              { ...chosen, id: conflict.existing_record.id },
              req.officer!.id
            );
            await upsertRow(client, conflict.table, normalized, {
              preserveSnapshotReason: `pre_phone_merge_${sourceDeviceId}`,
              actorId: req.officer!.id,
              deviceId: sourceDeviceId,
            });
            updated++;
          }

          await writeAuditLog(
            client,
            req.officer!.id,
            req.officer!.username,
            'PHONE_MERGE_APPLY',
            'all',
            null,
            sourceDeviceId,
            { inserted, updated, preserved }
          );

          return { inserted, updated, preserved };
        });

        res.json({ ok: true, stats });
      } catch (error) {
        console.error('Merge apply error:', error);
        res.status(500).json({ error: 'Failed to apply merge changes.' });
      }
    }
  );

  // Full Database Backup Export (Admin / Super Admin only)
  app.get('/api/backup/export', requireAuth, requireRoles(['super_admin', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const tables: Record<string, Record<string, unknown>[]> = {};
      for (const table of DATA_TABLE_ORDER) {
        const cols =
          table === 'officers' && !isAdminRole(req.officer!.role)
            ? TABLE_SCHEMAS[table].columns.filter((c) => c !== 'password_hash').join(', ')
            : TABLE_SCHEMAS[table].columns.join(', ');
        const rowsRes = await queryDb<Record<string, unknown>>(`SELECT ${cols} FROM public.${table}`);
        tables[table] = rowsRes.rows;
      }
      const payload = {
        format: 'dmis-full-backup',
        schema_version: 1,
        exported_at: new Date().toISOString(),
        exported_by: req.officer!.username,
        tables,
      };
      res.json(payload);
    } catch (error) {
      console.error('Backup export error:', error);
      res.status(500).json({ error: 'Failed to export database backup.' });
    }
  });

  // Full Database Restore with pre-restore snapshot safety net
  app.post('/api/backup/restore', requireAuth, requireRoles(['super_admin', 'admin']), async (req: AuthenticatedRequest, res) => {
    const backup = req.body;
    if (!backup || backup.format !== 'dmis-full-backup' || !backup.tables) {
      res.status(400).json({ error: 'Invalid DMIS backup file format.' });
      return;
    }

    try {
      const summary = await withTransaction(async (client) => {
        const restoredCounts: Record<string, number> = {};
        for (const table of DATA_TABLE_ORDER) {
          const rows = Array.isArray(backup.tables[table]) ? (backup.tables[table] as Record<string, unknown>[]) : [];
          restoredCounts[table] = 0;

          for (const row of rows) {
            if (table === 'officers' && !row.password_hash) {
              continue; // Preserve existing officer credentials if backup didn't include hashes
            }
            const normalized = normalizeRecordInput(table, row, req.officer!.id);
            await upsertRow(client, table, normalized, {
              preserveSnapshotReason: 'pre_full_backup_restore',
              actorId: req.officer!.id,
              deviceId: 'backup-restore',
            });
            restoredCounts[table]++;
          }
        }
        await writeAuditLog(
          client,
          req.officer!.id,
          req.officer!.username,
          'FULL_BACKUP_RESTORE',
          'all',
          null,
          'backup-restore',
          restoredCounts
        );
        return restoredCounts;
      });

      res.json({ ok: true, restoredCounts: summary });
    } catch (error) {
      console.error('Backup restore error:', error);
      res.status(500).json({ error: 'Failed to restore backup.' });
    }
  });

  // Security Audit Logs (Admin & Super Admin only)
  app.get('/api/audit-logs', requireAuth, requireRoles(['super_admin', 'admin']), async (req, res) => {
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
    const entityTable = typeof req.query.entity_table === 'string' ? req.query.entity_table.trim() : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() : '';
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo.trim() : '';
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(250, Math.max(1, Number(req.query.pageSize ?? 25) || 25));

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (action) {
      params.push(action);
      whereClauses.push(`action = $${params.length}`);
    }
    if (entityTable) {
      params.push(entityTable);
      whereClauses.push(`entity_table = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      whereClauses.push(`created_at::date >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      whereClauses.push(`created_at::date <= $${params.length}::date`);
    }
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      whereClauses.push(
        `(actor_username ILIKE $${idx} OR entity_table ILIKE $${idx} OR COALESCE(record_id::text, '') ILIKE $${idx} OR device_id ILIKE $${idx} OR COALESCE(details::text, '') ILIKE $${idx})`
      );
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    try {
      const countRes = await queryDb<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM public.audit_logs ${whereSql}`,
        params
      );
      const total = Number(countRes.rows[0]?.total ?? '0');
      const offset = (page - 1) * pageSize;
      const listParams = [...params, pageSize, offset];

      const rowsRes = await queryDb<Record<string, unknown>>(
        `SELECT id, actor_id, actor_username, action, entity_table, record_id, device_id, details, created_at
         FROM public.audit_logs
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams
      );

      res.json({
        logs: rowsRes.rows,
        total,
        page,
        pageSize,
      });
    } catch (error) {
      console.error('Audit log fetch error:', error);
      res.status(500).json({ error: 'Failed to load audit logs.' });
    }
  });

  // Vite dev middleware or production static assets
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT ?? 3000) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`DMIS server listening on http://0.0.0.0:${port}`);
    if (!isSupabaseConfigured()) {
      console.log('SUPABASE_DATABASE_URL is not set; running API in offline-first readiness mode.');
    } else {
      void getPool();
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start DMIS server:', err);
  process.exit(1);
});
