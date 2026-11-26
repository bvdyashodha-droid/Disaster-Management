import type {
  DataTableKey,
  DmisDataset,
  MergeConflict,
  MergeResolutionItem,
  SyncPackage,
} from '../types/dmis';
import { ALL_DATA_TABLES, saveLocalRecord } from './offlineDb';

const NATURAL_KEYS: Record<DataTableKey, string[]> = {
  districts: ['district_code'],
  divisional_secretariats: ['ds_code'],
  gn_divisions: ['gn_code'],
  officers: ['username'],
  disasters: ['disaster_code'],
  affected_families: ['family_ref_no', 'head_nic'],
  affected_persons: ['person_ref_no', 'nic_or_bc'],
  house_damages: ['assessment_no'],
  relief_assistance: ['voucher_no'],
};

const IGNORE_DIFF_FIELDS = new Set(['version', 'created_at', 'updated_at', 'updated_by']);

export function findDifferingFields(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): string[] {
  const keys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  const diffs: string[] = [];
  for (const key of keys) {
    if (key === 'id' || key === 'password_hash' || IGNORE_DIFF_FIELDS.has(key)) continue;
    if (incoming[key] === undefined) continue;
    const a = existing[key];
    const b = incoming[key];
    const emptyA = a === null || a === undefined || a === '';
    const emptyB = b === null || b === undefined || b === '';
    if (emptyA && emptyB) continue;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      diffs.push(key);
    }
  }
  return diffs;
}

export interface LocalMergeAnalysis {
  newRecords: { table: DataTableKey; record: Record<string, unknown> }[];
  unchangedCount: number;
  conflicts: MergeConflict[];
}

export function analyzeLocalMerge(
  localData: DmisDataset,
  incomingPkg: SyncPackage
): LocalMergeAnalysis {
  const newRecords: { table: DataTableKey; record: Record<string, unknown> }[] = [];
  const conflicts: MergeConflict[] = [];
  let unchangedCount = 0;

  for (const table of ALL_DATA_TABLES) {
    if (table === 'officers') continue;
    const existingRows = (localData[table] ?? []) as unknown as Record<string, unknown>[];
    const incomingRows = (incomingPkg.tables[table] ?? []) as unknown as Record<string, unknown>[];

    const byId = new Map<string, Record<string, unknown>>();
    const byNatural = new Map<string, Record<string, unknown>>();

    for (const row of existingRows) {
      byId.set(String(row.id), row);
      if (!row.is_deleted) {
        for (const nat of NATURAL_KEYS[table]) {
          const val = row[nat];
          if (typeof val === 'string' && val.trim()) {
            byNatural.set(`${nat}:${val.trim().toLowerCase()}`, row);
          }
        }
      }
    }

    for (const inc of incomingRows) {
      const id = String(inc.id ?? '');
      const existingById = byId.get(id);
      if (existingById) {
        const diffs = findDifferingFields(existingById, inc);
        if (diffs.length === 0) {
          unchangedCount++;
        } else {
          conflicts.push({
            conflict_id: `${table}:${id}`,
            table,
            record_id: id,
            conflict_type: 'version_divergence',
            existing_record: existingById,
            incoming_record: inc,
            differing_fields: diffs,
          });
        }
        continue;
      }

      let matchedDup: Record<string, unknown> | undefined;
      let matchedLabel = '';
      for (const nat of NATURAL_KEYS[table]) {
        const val = inc[nat];
        if (typeof val === 'string' && val.trim()) {
          const found = byNatural.get(`${nat}:${val.trim().toLowerCase()}`);
          if (found) {
            matchedDup = found;
            matchedLabel = `${nat}: ${val.trim()}`;
            break;
          }
        }
      }

      if (matchedDup) {
        conflicts.push({
          conflict_id: `${table}:${id || crypto.randomUUID()}`,
          table,
          record_id: String(matchedDup.id),
          conflict_type: 'duplicate_natural_key',
          natural_key_label: matchedLabel,
          existing_record: matchedDup,
          incoming_record: inc,
          differing_fields: findDifferingFields(matchedDup, inc),
        });
      } else {
        newRecords.push({ table, record: inc });
      }
    }
  }

  return { newRecords, unchangedCount, conflicts };
}

export async function applyLocalMerge(
  analysis: LocalMergeAnalysis,
  resolutions: MergeResolutionItem[],
  sourceDeviceId: string,
  queueForServerSync: boolean
): Promise<{ inserted: number; updated: number; preserved: number }> {
  const resMap = new Map<string, MergeResolutionItem>();
  resolutions.forEach((r) => resMap.set(r.conflict_id, r));

  let inserted = 0;
  let updated = 0;
  let preserved = 0;

  for (const item of analysis.newRecords) {
    await saveLocalRecord(item.table, item.record, {
      queueMutation: queueForServerSync,
      deviceId: sourceDeviceId,
    });
    inserted++;
  }

  for (const conflict of analysis.conflicts) {
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
      for (const nat of NATURAL_KEYS[conflict.table]) {
        if (typeof cloned[nat] === 'string' && cloned[nat]) {
          cloned[nat] = `${String(cloned[nat])}-M${Date.now().toString().slice(-4)}`;
        }
      }
      await saveLocalRecord(conflict.table, cloned, {
        queueMutation: queueForServerSync,
        deviceId: sourceDeviceId,
      });
      inserted++;
      continue;
    }

    const chosen =
      decision.strategy === 'field_merge' && decision.merged_record
        ? decision.merged_record
        : conflict.incoming_record;

    await saveLocalRecord(
      conflict.table,
      { ...chosen, id: conflict.existing_record.id },
      {
        queueMutation: queueForServerSync,
        snapshotReason: `pre_phone_merge_${sourceDeviceId}`,
        deviceId: sourceDeviceId,
      }
    );
    updated++;
  }

  return { inserted, updated, preserved };
}
