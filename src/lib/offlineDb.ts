import type {
  AuditLogEntry,
  AuthUser,
  DataTableKey,
  DmisDataset,
  OfflineMutation,
  RecordSnapshot,
} from '../types/dmis';

const DB_NAME = 'dmis_offline_db';
const DB_VERSION = 2;

export const ALL_DATA_TABLES: DataTableKey[] = [
  'districts',
  'divisional_secretariats',
  'gn_divisions',
  'officers',
  'disasters',
  'affected_families',
  'affected_persons',
  'house_damages',
  'relief_assistance',
];

const EXTRA_STORES = ['offline_mutations', 'record_snapshots', 'audit_logs', 'meta'] as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of [...ALL_DATA_TABLES, ...EXTRA_STORES]) {
        if (!db.objectStoreNames.contains(store)) {
          const keyPath =
            store === 'offline_mutations'
              ? 'mutation_id'
              : store === 'meta'
                ? 'key'
                : 'id';
          db.createObjectStore(store, { keyPath });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result ?? []) as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function putInStore<T>(storeName: string, item: T): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAndBulkPut(storeName: string, items: unknown[]): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOrCreateDeviceId(): Promise<string> {
  const all = await getAllFromStore<{ key: string; value: string }>('meta');
  const existing = all.find((m) => m.key === 'device_id');
  if (existing?.value) return existing.value;
  const generated = `phone-${crypto.randomUUID().slice(0, 8)}`;
  await putInStore('meta', { key: 'device_id', value: generated });
  return generated;
}

export async function getMetaValue<T = string>(key: string): Promise<T | null> {
  const all = await getAllFromStore<{ key: string; value: T }>('meta');
  return all.find((m) => m.key === key)?.value ?? null;
}

export async function setMetaValue<T>(key: string, value: T): Promise<void> {
  await putInStore('meta', { key, value });
}

export async function loadLocalDataset(): Promise<DmisDataset> {
  const entries = await Promise.all(
    ALL_DATA_TABLES.map(async (table) => [table, await getAllFromStore<Record<string, unknown>>(table)] as const)
  );
  return Object.fromEntries(entries) as unknown as DmisDataset;
}

export async function replaceLocalDataset(tables: Partial<DmisDataset>): Promise<void> {
  for (const table of ALL_DATA_TABLES) {
    const rows = tables[table];
    if (Array.isArray(rows)) {
      await clearAndBulkPut(table, rows);
    }
  }
}

export async function saveLocalRecord(
  table: DataTableKey,
  record: Record<string, unknown>,
  options: { queueMutation: boolean; snapshotReason?: string; deviceId: string }
): Promise<Record<string, unknown>> {
  const existingList = await getAllFromStore<Record<string, unknown>>(table);
  const existing = existingList.find((r) => r.id === record.id);

  if (existing && options.snapshotReason) {
    const snapshot: RecordSnapshot = {
      id: crypto.randomUUID(),
      entity_table: table,
      record_id: String(existing.id),
      snapshot_reason: options.snapshotReason,
      snapshot_data: existing,
      device_id: options.deviceId,
      created_at: new Date().toISOString(),
    };
    await putInStore('record_snapshots', snapshot);
  }

  const now = new Date().toISOString();
  const nextVersion = existing ? Number(existing.version ?? 1) + 1 : Number(record.version ?? 1);
  const saved: Record<string, unknown> = {
    ...existing,
    ...record,
    id: record.id || crypto.randomUUID(),
    version: nextVersion,
    device_id: options.deviceId,
    is_deleted: Boolean(record.is_deleted ?? false),
    created_at: existing?.created_at ?? record.created_at ?? now,
    updated_at: now,
  };

  await putInStore(table, saved);

  if (options.queueMutation) {
    const mut: OfflineMutation = {
      mutation_id: crypto.randomUUID(),
      table,
      action: saved.is_deleted ? 'soft_delete' : 'upsert',
      record_id: String(saved.id),
      payload: saved,
      queued_at: now,
      device_id: options.deviceId,
    };
    await putInStore('offline_mutations', mut);
  }

  return saved;
}

export async function getPendingMutations(): Promise<OfflineMutation[]> {
  return getAllFromStore<OfflineMutation>('offline_mutations');
}

export async function removeMutations(mutationIds: string[]): Promise<void> {
  for (const id of mutationIds) {
    await deleteFromStore('offline_mutations', id);
  }
}

export async function getLocalSnapshots(): Promise<RecordSnapshot[]> {
  const list = await getAllFromStore<RecordSnapshot>('record_snapshots');
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function appendLocalAuditLog(
  entry: Omit<AuditLogEntry, 'id' | 'created_at'> & { id?: string; created_at?: string }
): Promise<AuditLogEntry> {
  const item: AuditLogEntry = {
    id: entry.id || crypto.randomUUID(),
    actor_id: entry.actor_id ?? null,
    actor_username: entry.actor_username,
    action: entry.action,
    entity_table: entry.entity_table,
    record_id: entry.record_id ?? null,
    device_id: entry.device_id,
    details: entry.details ?? {},
    created_at: entry.created_at || new Date().toISOString(),
  };
  await putInStore('audit_logs', item);
  return item;
}

export async function getLocalAuditLogs(): Promise<AuditLogEntry[]> {
  const list = await getAllFromStore<AuditLogEntry>('audit_logs');
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getLocalOfflineOfficer(): Promise<AuthUser | null> {
  return getMetaValue<AuthUser>('local_officer');
}

export async function setLocalOfflineOfficer(user: AuthUser | null): Promise<void> {
  await setMetaValue('local_officer', user);
}

interface OfflineCachedCredential {
  username: string;
  salt: string;
  hash: string;
  user: AuthUser;
  updated_at: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function deriveOfflineSecretHex(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const saltBytes = hexToBytes(saltHex);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function saveOfflineCredential(user: AuthUser, password: string): Promise<void> {
  if (!password || !crypto?.subtle) return;
  const cleanUsername = user.username.trim().toLowerCase();
  const existing = (await getMetaValue<OfflineCachedCredential[]>('offline_credentials')) ?? [];
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await deriveOfflineSecretHex(password, salt);
  const entry: OfflineCachedCredential = {
    username: cleanUsername,
    salt,
    hash,
    user: { ...user, username: cleanUsername, auth_mode: 'offline_local' },
    updated_at: new Date().toISOString(),
  };
  const next = existing.filter((c) => c.username !== cleanUsername).concat(entry);
  await setMetaValue('offline_credentials', next);
}

export async function verifyOfflineCredential(
  username: string,
  password: string
): Promise<AuthUser | null> {
  if (!crypto?.subtle) return null;
  const cleanUsername = username.trim().toLowerCase();
  const existing = (await getMetaValue<OfflineCachedCredential[]>('offline_credentials')) ?? [];
  const match = existing.find((c) => c.username === cleanUsername);
  if (!match) return null;
  const candidateHash = await deriveOfflineSecretHex(password, match.salt);
  if (candidateHash.length !== match.hash.length) return null;
  let diff = 0;
  for (let i = 0; i < candidateHash.length; i++) {
    diff |= candidateHash.charCodeAt(i) ^ match.hash.charCodeAt(i);
  }
  return diff === 0 ? { ...match.user, auth_mode: 'offline_local' } : null;
}

export async function hasAnyOfflineCredential(): Promise<boolean> {
  const existing = (await getMetaValue<OfflineCachedCredential[]>('offline_credentials')) ?? [];
  return existing.length > 0;
}

