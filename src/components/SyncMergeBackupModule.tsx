import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  GitMerge,
  HardDriveDownload,
  History,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Upload,
} from 'lucide-react';
import {
  ADMIN_ONLY_MODULES,
  isAdminRole,
  ROLE_PERMISSIONS,
  type AuthUser,
  type ConflictResolutionStrategy,
  type DataTableKey,
  type DmisDataset,
  type Language,
  type MergeConflict,
  type MergeResolutionItem,
  type OfflineMutation,
  type RecordSnapshot,
  type SyncPackage,
} from '../types/dmis';
import type { HealthStatus } from '../lib/apiClient';
import { apiClient } from '../lib/apiClient';
import { computeChecksum, exportDataToJson } from '../lib/csvJson';
import { analyzeLocalMerge, applyLocalMerge, type LocalMergeAnalysis } from '../lib/mergeEngine';
import { ALL_DATA_TABLES, replaceLocalDataset, saveLocalRecord } from '../lib/offlineDb';
import { tLabel } from '../i18n/translations';

interface SyncMergeBackupModuleProps {
  lang: Language;
  user: AuthUser;
  dataset: DmisDataset;
  pendingMutations: OfflineMutation[];
  snapshots: RecordSnapshot[];
  deviceId: string;
  isOnline: boolean;
  health: HealthStatus | null;
  onSyncNow: () => Promise<{ synced: number; conflicts: MergeConflict[] }>;
  onRefreshData: () => Promise<void>;
}

type SubTab = 'sync' | 'merge' | 'backup' | 'supabase';

export const SyncMergeBackupModule: React.FC<SyncMergeBackupModuleProps> = ({
  lang,
  user,
  dataset,
  pendingMutations,
  snapshots,
  deviceId,
  isOnline,
  health,
  onSyncNow,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<SubTab>('sync');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Merge state
  const mergeInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [mergeAnalysis, setMergeAnalysis] = useState<{
    sourceDeviceId: string;
    sourceLabel: string;
    newRecords: { table: DataTableKey; record: Record<string, unknown> }[];
    unchangedCount: number;
    conflicts: MergeConflict[];
  } | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolutionStrategy>>({});

  // Backup restore dry-run preview
  const [backupPreview, setBackupPreview] = useState<{
    filename: string;
    exportedAt: string;
    counts: Record<string, number>;
    raw: { format: string; tables: Partial<DmisDataset> };
  } | null>(null);

  const perms = ROLE_PERMISSIONS[user.role];
  const isSupabaseActive = Boolean(
    isOnline && health?.supabaseConfigured && health?.connected && health?.schemaReady && user.auth_mode === 'supabase_server'
  );

  const handleRunSync = async () => {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await onSyncNow();
      if (res.conflicts.length > 0) {
        setMergeAnalysis({
          sourceDeviceId: deviceId,
          sourceLabel: 'Offline Sync Queue vs Supabase Server',
          newRecords: [],
          unchangedCount: res.synced,
          conflicts: res.conflicts,
        });
        setActiveTab('merge');
        setErrorMsg(
          `${res.synced} changes synced, ${res.conflicts.length} conflict(s) require manual resolution before overwriting server records.`
        );
      } else {
        setStatusMsg(`Synchronization complete. ${res.synced} queued change(s) processed.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  };

  const handleExportPhonePackage = async () => {
    const cleanTables: Partial<DmisDataset> = {};
    for (const t of ALL_DATA_TABLES) {
      if (t === 'officers') continue;
      if (!isAdminRole(user.role) && (ADMIN_ONLY_MODULES as readonly string[]).includes(t)) continue;
      (cleanTables as Record<string, unknown>)[t] = dataset[t];
    }
    const checksum = await computeChecksum(cleanTables);
    const pkg: SyncPackage = {
      format: 'dmis-sync-package',
      schema_version: 1,
      exported_at: new Date().toISOString(),
      source_device_id: deviceId,
      source_label: `${user.full_name} (${deviceId})`,
      checksum,
      tables: cleanTables,
    };
    exportDataToJson(`dmis-phone-pkg-${deviceId}-${new Date().toISOString().slice(0, 10)}.json`, pkg);
    setStatusMsg(`Phone sync package exported (${deviceId}). Transfer to another phone or office PC to merge.`);
  };

  const handleAnalyzePhonePackage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const parsed = JSON.parse(await file.text()) as SyncPackage;
      if (parsed.format !== 'dmis-sync-package' || !parsed.tables) {
        throw new Error('Invalid phone sync package format.');
      }

      if (isSupabaseActive) {
        const res = await apiClient.analyzeMerge(parsed);
        setMergeAnalysis({
          sourceDeviceId: parsed.source_device_id,
          sourceLabel: parsed.source_label || parsed.source_device_id,
          newRecords: res.newRecords,
          unchangedCount: res.unchangedCount,
          conflicts: res.conflicts,
        });
        const initRes: Record<string, ConflictResolutionStrategy> = {};
        res.conflicts.forEach((c) => {
          initRes[c.conflict_id] = 'keep_existing';
        });
        setResolutions(initRes);
      } else {
        const filteredTables: Partial<DmisDataset> = isAdminRole(user.role)
          ? parsed.tables
          : Object.fromEntries(
              Object.entries(parsed.tables).filter(
                ([k]) => !(ADMIN_ONLY_MODULES as readonly string[]).includes(k)
              )
            );
        const localRes: LocalMergeAnalysis = analyzeLocalMerge(dataset, {
          ...parsed,
          tables: filteredTables,
        });
        setMergeAnalysis({
          sourceDeviceId: parsed.source_device_id,
          sourceLabel: parsed.source_label || parsed.source_device_id,
          newRecords: localRes.newRecords,
          unchangedCount: localRes.unchangedCount,
          conflicts: localRes.conflicts,
        });
        const initRes: Record<string, ConflictResolutionStrategy> = {};
        localRes.conflicts.forEach((c) => {
          initRes[c.conflict_id] = 'keep_existing';
        });
        setResolutions(initRes);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to analyze merge package.');
    } finally {
      setBusy(false);
    }
  };

  const handleApplyMerge = async () => {
    if (!mergeAnalysis) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const resolutionList: MergeResolutionItem[] = mergeAnalysis.conflicts.map((c) => ({
        conflict_id: c.conflict_id,
        strategy: resolutions[c.conflict_id] ?? 'keep_existing',
      }));

      if (isSupabaseActive) {
        const result = await apiClient.applyMerge({
          newRecords: mergeAnalysis.newRecords,
          resolutions: resolutionList,
          conflicts: mergeAnalysis.conflicts,
          sourceDeviceId: mergeAnalysis.sourceDeviceId,
        });
        setStatusMsg(
          `Server merge complete: ${result.stats.inserted} inserted, ${result.stats.updated} updated (originals archived), ${result.stats.preserved} preserved.`
        );
      } else {
        const result = await applyLocalMerge(
          {
            newRecords: mergeAnalysis.newRecords,
            unchangedCount: mergeAnalysis.unchangedCount,
            conflicts: mergeAnalysis.conflicts,
          },
          resolutionList,
          mergeAnalysis.sourceDeviceId,
          true
        );
        setStatusMsg(
          `Offline merge complete: ${result.inserted} inserted, ${result.updated} updated (originals archived), ${result.preserved} preserved.`
        );
      }
      setMergeAnalysis(null);
      await onRefreshData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to apply merge');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadFullBackup = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      if (isSupabaseActive) {
        const backup = await apiClient.exportBackup();
        exportDataToJson(`dmis-full-backup-${new Date().toISOString().slice(0, 10)}.json`, backup);
      } else {
        const backup = {
          format: 'dmis-full-backup',
          schema_version: 1,
          exported_at: new Date().toISOString(),
          exported_by: user.username,
          device_id: deviceId,
          tables: dataset,
        };
        exportDataToJson(`dmis-local-backup-${new Date().toISOString().slice(0, 10)}.json`, backup);
      }
      setStatusMsg('Full database backup JSON downloaded safely.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Backup export failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBackupFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as {
        format: string;
        exported_at?: string;
        tables?: Partial<DmisDataset>;
      };
      if (parsed.format !== 'dmis-full-backup' || !parsed.tables) {
        throw new Error('Invalid DMIS full backup file.');
      }
      const counts: Record<string, number> = {};
      for (const t of ALL_DATA_TABLES) {
        counts[t] = Array.isArray(parsed.tables[t]) ? parsed.tables[t]!.length : 0;
      }
      setBackupPreview({
        filename: file.name,
        exportedAt: parsed.exported_at ?? 'Unknown',
        counts,
        raw: { format: parsed.format, tables: parsed.tables },
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse backup file');
    }
  };

  const handleConfirmRestore = async () => {
    if (!backupPreview) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      // Always snapshot existing local records before restore
      for (const t of ALL_DATA_TABLES) {
        const existingRows = (dataset[t] ?? []) as unknown as Record<string, unknown>[];
        for (const r of existingRows) {
          await saveLocalRecord(t, r, {
            queueMutation: false,
            snapshotReason: 'pre_full_backup_restore',
            deviceId,
          });
        }
      }

      if (isSupabaseActive) {
        await apiClient.restoreBackup(backupPreview.raw);
      } else {
        await replaceLocalDataset(backupPreview.raw.tables);
      }

      setBackupPreview(null);
      await onRefreshData();
      setStatusMsg('Database restored safely. Previous records were archived in snapshots.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreSnapshot = async (snap: RecordSnapshot) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      if (isSupabaseActive) {
        await apiClient.restoreSnapshot(snap.id);
      } else {
        await saveLocalRecord(
          snap.entity_table,
          { ...snap.snapshot_data, id: snap.record_id, is_deleted: false },
          { queueMutation: true, snapshotReason: 'pre_snapshot_restore', deviceId }
        );
      }
      await onRefreshData();
      setStatusMsg(`Restored original snapshot for ${snap.entity_table} (${snap.record_id.slice(0, 8)}).`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to restore snapshot');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdminRole(user.role)) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center space-y-2">
        <p className="text-sm font-bold text-red-800">
          {lang === 'si'
            ? 'පිවිසුම සීමා කර ඇත — Admin හෝ Super Admin අවසරය අවශ්‍යයි'
            : 'Access Restricted — Admin or Super Admin Permission Required'}
        </p>
        <p className="text-xs text-slate-600">
          {lang === 'si'
            ? 'සමමුහුර්තකරණය, ඒකාබද්ධ කිරීම සහ උපස්ථ කළමනාකරණය කිරීමට හැක්කේ Admin හෝ Super Admin පරිශීලකයින්ට පමණි.'
            : 'Synchronization, multi-phone database merge, and backup/restore operations are restricted to Administrator and Super Administrator accounts.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navigation Sub-tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2">
        {[
          { id: 'sync' as SubTab, label: lang === 'si' ? 'සමමුහුර්ත හා පෝලිම' : 'Cloud Sync & Snapshots', icon: RefreshCw },
          { id: 'merge' as SubTab, label: lang === 'si' ? 'දුරකථන ඒකාබද්ධ කිරීම' : 'Multi-Phone Merge', icon: GitMerge },
          { id: 'backup' as SubTab, label: lang === 'si' ? 'උපස්ථ සහ ප්‍රතිසාධනය' : 'Backup, Restore & Access', icon: HardDriveDownload },
          { id: 'supabase' as SubTab, label: lang === 'si' ? 'Supabase සැකසුම් මාර්ගෝපදේශය' : 'Supabase Setup Guide', icon: Database },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                active ? 'bg-[#0F294A] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {statusMsg && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-900">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* TAB 1: SYNC & SNAPSHOTS */}
      {activeTab === 'sync' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              {lang === 'si' ? 'උපාංග සමමුහුර්ත තත්ත්වය' : 'Device Synchronization Status'}
            </h3>
            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Device Identifier</span>
                <span className="font-mono font-semibold text-slate-900">{deviceId}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Network Status</span>
                <span className="font-semibold text-slate-900">{isOnline ? 'Online' : 'Offline'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Supabase PostgreSQL</span>
                <span className="font-semibold text-slate-900">
                  {isSupabaseActive ? 'Connected & Ready' : 'Not Connected / Local Mode'}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span>Pending Offline Mutations</span>
                <span className="font-mono font-bold text-slate-900">{pendingMutations.length}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={!isSupabaseActive || busy}
              onClick={handleRunSync}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F294A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#1A3B66] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
              <span>{tLabel(lang, 'syncNow')}</span>
            </button>
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[#0F294A]" />
              <h3 className="text-sm font-bold text-slate-900">
                {lang === 'si' ? 'සුරැකි මුල් වාර්තා (Snapshots)' : 'Preserved Original Record Snapshots'}
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Original records are automatically archived here before any update, phone merge, soft-delete, or restore.
            </p>
            {(() => {
              const visibleSnapshots = isAdminRole(user.role)
                ? snapshots
                : snapshots.filter((s) => !(ADMIN_ONLY_MODULES as readonly string[]).includes(s.entity_table));
              return visibleSnapshots.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No snapshots recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {visibleSnapshots.slice(0, 20).map((snap) => (
                  <div key={snap.id} className="flex items-center justify-between py-2.5 text-xs gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">
                        {snap.entity_table} · {snap.snapshot_reason}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {snap.record_id.slice(0, 8)} · {new Date(snap.created_at).toLocaleString()}
                      </p>
                    </div>
                    {perms.canBackupRestore && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRestoreSnapshot(snap)}
                        className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                ))}
              </div>
            );
            })()}
          </div>
        </div>
      )}

      {/* TAB 2: MULTI-PHONE MERGE & CONFLICT RESOLVER */}
      {activeTab === 'merge' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {lang === 'si' ? 'දුරකථන අතර දත්ත ගබඩා ඒකාබද්ධ කිරීම' : 'Multi-Phone Database Merge & Conflict Detection'}
                </h3>
                <p className="text-xs text-slate-500">
                  Works both offline (phone-to-phone) and online (phone-to-Supabase). Duplicates are matched by UUID and unique codes/NICs before any data is written.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportPhonePackage}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Smartphone className="h-4 w-4" />
                  <span>{tLabel(lang, 'exportPhonePkg')}</span>
                </button>
                <input
                  ref={mergeInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleAnalyzePhonePackage}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={!perms.canMergeDevices || busy}
                  onClick={() => mergeInputRef.current?.click()}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1A3B66] disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  <span>{tLabel(lang, 'importPhonePkg')}</span>
                </button>
              </div>
            </div>
          </div>

          {mergeAnalysis && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Merge Preview — Source: {mergeAnalysis.sourceLabel}
                  </h4>
                  <p className="text-xs text-slate-600 tabular-nums">
                    New records: <strong>{mergeAnalysis.newRecords.length}</strong> · Unchanged:{' '}
                    <strong>{mergeAnalysis.unchangedCount}</strong> · Conflicts/Duplicates:{' '}
                    <strong className="text-amber-700">{mergeAnalysis.conflicts.length}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleApplyMerge}
                  className="min-h-[42px] rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1A3B66]"
                >
                  {tLabel(lang, 'applyMerge')}
                </button>
              </div>

              {mergeAnalysis.conflicts.length === 0 ? (
                <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  Zero conflicts or duplicates detected. Click "{tLabel(lang, 'applyMerge')}" to safely add the {mergeAnalysis.newRecords.length} new record(s).
                </p>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-amber-800">{tLabel(lang, 'resolveConflicts')}</p>
                  {mergeAnalysis.conflicts.map((conflict) => {
                    const choice = resolutions[conflict.conflict_id] ?? 'keep_existing';
                    return (
                      <div key={conflict.conflict_id} className="rounded-lg border border-slate-200 p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs">
                            <span className="font-bold text-slate-900">{conflict.table}</span>
                            <span className="text-slate-500">
                              {' '}
                              ·{' '}
                              {conflict.conflict_type === 'duplicate_natural_key'
                                ? `Duplicate (${conflict.natural_key_label})`
                                : `Version Divergence (${conflict.record_id.slice(0, 8)})`}
                            </span>
                          </div>
                          <select
                            value={choice}
                            onChange={(e) =>
                              setResolutions((prev) => ({
                                ...prev,
                                [conflict.conflict_id]: e.target.value as ConflictResolutionStrategy,
                              }))
                            }
                            className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800"
                          >
                            <option value="keep_existing">{tLabel(lang, 'keepExisting')}</option>
                            <option value="use_incoming">{tLabel(lang, 'useIncoming')} (Archive Original)</option>
                            <option value="keep_both">{tLabel(lang, 'keepBoth')}</option>
                          </select>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500">
                                <th className="py-1.5 text-left">Field</th>
                                <th className="py-1.5 text-left">Existing Record</th>
                                <th className="py-1.5 text-left">Incoming Phone Record</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                              {conflict.differing_fields.map((fld) => (
                                <tr key={fld}>
                                  <td className="py-1.5 font-semibold text-slate-700">{fld}</td>
                                  <td className="py-1.5 text-slate-800">
                                    {String(conflict.existing_record[fld] ?? '—')}
                                  </td>
                                  <td className="py-1.5 text-[#1D4ED8]">
                                    {String(conflict.incoming_record[fld] ?? '—')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BACKUP, RESTORE & ACCESS SCHEMA READINESS */}
      {activeTab === 'backup' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              {lang === 'si' ? 'සම්පූර්ණ දත්ත ගබඩා උපස්ථය' : 'Full Database Backup & Safe Restore'}
            </h3>
            <p className="text-xs text-slate-600">
              Backups include all tables with UUIDs, versions, and preserved legacy fields. Restoring a backup automatically archives current records into snapshots first.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={handleDownloadFullBackup}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1A3B66]"
              >
                <Download className="h-4 w-4" />
                <span>{tLabel(lang, 'downloadBackup')}</span>
              </button>

              {perms.canBackupRestore && (
                <>
                  <input
                    ref={backupInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleBackupFileSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => backupInputRef.current?.click()}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Upload className="h-4 w-4" />
                    <span>{tLabel(lang, 'restoreBackup')}</span>
                  </button>
                </>
              )}
            </div>

            {backupPreview && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-xs font-bold text-amber-900">
                  Confirm Restore: {backupPreview.filename} ({backupPreview.exportedAt})
                </p>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono text-amber-900">
                  {Object.entries(backupPreview.counts).map(([k, v]) => (
                    <div key={k}>
                      {k}: {v}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmRestore}
                    disabled={busy}
                    className="min-h-[38px] rounded-lg bg-amber-800 px-3.5 py-1.5 text-xs font-semibold text-white"
                  >
                    Confirm & Archive Current Data First
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackupPreview(null)}
                    className="min-h-[38px] rounded-lg border border-amber-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-amber-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#0F294A]" />
              <h3 className="text-sm font-bold text-slate-900">{tLabel(lang, 'accessNoticeTitle')}</h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">{tLabel(lang, 'accessNoticeBody')}</p>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 space-y-1.5">
              <p className="font-semibold text-slate-900">Ready Target PostgreSQL Tables:</p>
              <p className="font-mono text-[11px]">
                disasters, districts, divisional_secretariats, gn_divisions, affected_families, affected_persons, house_damages, relief_assistance, officers
              </p>
              <p className="pt-1 text-slate-600">
                Share your Microsoft Access table names and column list in chat whenever ready to generate an exact Access-to-Supabase mapping migration.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SUPABASE SETUP GUIDE */}
      {activeTab === 'supabase' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
          <h3 className="text-base font-bold text-slate-900">Step-by-Step Supabase PostgreSQL Configuration</h3>
          <ol className="space-y-3 text-xs leading-relaxed text-slate-700 list-decimal pl-5">
            <li>
              <strong>Create a Supabase Project:</strong> Sign in at supabase.com, click <em>New Project</em>, choose your region (e.g. Singapore), and set a strong database password.
            </li>
            <li>
              <strong>Run Schema Migrations:</strong> Open the <em>SQL Editor</em> in your Supabase dashboard, paste and execute <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">supabase/migrations/0001_initial_schema.sql</code> through <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">0006_email_verification_codes.sql</code> in order.
            </li>
            <li>
              <strong>Copy Connection String:</strong> Go to <em>Project Settings → Database → Connection string (URI)</em> (Session pooler or Direct connection) and copy the PostgreSQL URI.
            </li>
            <li>
              <strong>Configure Server Secrets (Never Frontend):</strong> Add <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">SUPABASE_DATABASE_URL</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">SESSION_SECRET</code>, optionally <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">ADMIN_BOOTSTRAP_PASSCODE</code>, and SMTP email secrets (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded">SMTP_HOST</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">SMTP_PORT</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">SMTP_USER</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">SMTP_PASS</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">SMTP_FROM</code>) in your server environment / Secrets panel.
            </li>
            <li>
              <strong>Restart & Claim Super Admin:</strong> Reload the app, create the first Super Administrator account on the login screen, and click <strong>Sync Now</strong> to push any offline records entered earlier.
            </li>
          </ol>
        </div>
      )}
    </div>
  );
};
