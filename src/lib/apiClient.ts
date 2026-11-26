import type {
  AuditLogEntry,
  AuthUser,
  DataTableKey,
  DmisDataset,
  MergeConflict,
  MergeResolutionItem,
  OfflineMutation,
  RecordSnapshot,
  SyncPackage,
} from '../types/dmis';

let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export interface HealthStatus {
  ok: boolean;
  supabaseConfigured: boolean;
  connected: boolean;
  schemaReady: boolean;
  hasOfficers: boolean;
  bootstrapPasscodeRequired: boolean;
  smtpConfigured?: boolean;
  errorMessage?: string;
}

export interface SaveRecordResponse {
  record?: Record<string, unknown>;
  verificationRequired?: boolean;
  challengeId?: string;
  email?: string;
}

export interface BootstrapResponse {
  token?: string;
  user?: AuthUser;
  verificationRequired?: boolean;
  challengeId?: string;
  email?: string;
}

export type ForgotPasswordRequestResponse =
  | { flow: 'contact_admin'; message: string }
  | { flow: 'email_code'; challengeId: string; maskedEmail: string };

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text };
    }
  }

  if (!res.ok) {
    const errMsg =
      typeof json === 'object' && json !== null && 'error' in json
        ? String((json as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(errMsg);
  }

  return json as T;
}

export const apiClient = {
  getHealth: () => apiRequest<HealthStatus>('/api/health'),

  bootstrapAdmin: (payload: {
    username: string;
    full_name: string;
    email: string;
    password: string;
    designation: string;
    phone: string;
    bootstrap_passcode?: string;
    verification_challenge_id?: string;
    verification_code?: string;
  }) => apiRequest<BootstrapResponse>('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(payload) }),

  login: (username: string, password: string) =>
    apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  requestForgotPassword: (username: string) =>
    apiRequest<ForgotPasswordRequestResponse>('/api/auth/forgot-password/request', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  verifyForgotPasswordReset: (payload: { challengeId: string; code: string; newPassword: string }) =>
    apiRequest<{ ok: boolean }>('/api/auth/forgot-password/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  upsertRecord: (table: DataTableKey, record: Record<string, unknown>) =>
    apiRequest<SaveRecordResponse>(`/api/records/${table}`, {
      method: 'POST',
      body: JSON.stringify(record),
    }),

  updateRecord: (table: DataTableKey, id: string, record: Record<string, unknown>) =>
    apiRequest<SaveRecordResponse>(`/api/records/${table}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(record),
    }),

  softDeleteRecord: (table: DataTableKey, id: string) =>
    apiRequest<{ ok: boolean }>(`/api/records/${table}/${id}`, { method: 'DELETE' }),

  pullAll: () => apiRequest<{ pulled_at: string; tables: DmisDataset }>('/api/sync/pull'),

  pushMutations: (mutations: OfflineMutation[]) =>
    apiRequest<{ appliedIds: string[]; conflicts: MergeConflict[] }>('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ mutations }),
    }),

  analyzeMerge: (pkg: SyncPackage) =>
    apiRequest<{
      newCount: number;
      unchangedCount: number;
      conflicts: MergeConflict[];
      newRecords: { table: DataTableKey; record: Record<string, unknown> }[];
    }>('/api/merge/analyze', {
      method: 'POST',
      body: JSON.stringify(pkg),
    }),

  applyMerge: (payload: {
    newRecords: { table: DataTableKey; record: Record<string, unknown> }[];
    resolutions: MergeResolutionItem[];
    conflicts: MergeConflict[];
    sourceDeviceId: string;
  }) =>
    apiRequest<{ ok: boolean; stats: { inserted: number; updated: number; preserved: number } }>(
      '/api/merge/apply',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  exportBackup: () => apiRequest<Record<string, unknown>>('/api/backup/export'),

  restoreBackup: (backup: unknown) =>
    apiRequest<{ ok: boolean; restoredCounts: Record<string, number> }>('/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify(backup),
    }),

  getSnapshots: () => apiRequest<{ snapshots: RecordSnapshot[] }>('/api/snapshots'),

  restoreSnapshot: (snapshotId: string) =>
    apiRequest<{ record: Record<string, unknown> }>(`/api/snapshots/${snapshotId}/restore`, {
      method: 'POST',
    }),

  getAuditLogs: (params?: {
    action?: string;
    entity_table?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.action) qs.set('action', params.action);
    if (params?.entity_table) qs.set('entity_table', params.entity_table);
    if (params?.search) qs.set('search', params.search);
    if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params?.dateTo) qs.set('dateTo', params.dateTo);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    const query = qs.toString();
    return apiRequest<{ logs: AuditLogEntry[]; total: number; page: number; pageSize: number }>(
      `/api/audit-logs${query ? `?${query}` : ''}`
    );
  },
};
