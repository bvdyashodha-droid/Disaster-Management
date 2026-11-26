import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  isAdminRole,
  type AuditLogEntry,
  type AuthUser,
  type DataTableKey,
  type Language,
} from '../types/dmis';
import { apiClient } from '../lib/apiClient';
import { getLocalAuditLogs } from '../lib/offlineDb';
import { exportDataToJson, exportRowsToCsv } from '../lib/csvJson';
import { MODULE_LABELS, tLabel } from '../i18n/translations';

interface AuditLogModuleProps {
  lang: Language;
  user: AuthUser;
  isSupabaseActive: boolean;
}

const ACTION_OPTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'RESTORE',
  'PHONE_MERGE_APPLY',
  'FULL_BACKUP_RESTORE',
  'ADMIN_BOOTSTRAP',
] as const;

const TABLE_OPTIONS: DataTableKey[] = [
  'disasters',
  'affected_families',
  'affected_persons',
  'house_damages',
  'relief_assistance',
  'districts',
  'divisional_secretariats',
  'gn_divisions',
  'officers',
];

function getActionTone(action: string): string {
  switch (action) {
    case 'CREATE':
    case 'ADMIN_BOOTSTRAP':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'UPDATE':
    case 'UPSERT':
      return 'border-blue-200 bg-blue-50 text-blue-800';
    case 'DELETE':
    case 'SOFT_DELETE':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'RESTORE':
    case 'PHONE_MERGE_APPLY':
    case 'FULL_BACKUP_RESTORE':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
  }
}

export const AuditLogModule: React.FC<AuditLogModuleProps> = ({
  lang,
  user,
  isSupabaseActive,
}) => {
  const hasAdminAccess = isAdminRole(user.role);

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!hasAdminAccess) return;
    setLoading(true);
    setError(null);
    try {
      if (isSupabaseActive) {
        const res = await apiClient.getAuditLogs({
          action: actionFilter || undefined,
          entity_table: tableFilter || undefined,
          search: search.trim() || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
          pageSize,
        });
        setLogs(res.logs);
        setTotal(res.total);
      } else {
        const localAll = await getLocalAuditLogs();
        const q = search.trim().toLowerCase();
        const filtered = localAll.filter((item) => {
          if (actionFilter && item.action !== actionFilter) return false;
          if (tableFilter && item.entity_table !== tableFilter) return false;
          if (dateFrom && item.created_at.slice(0, 10) < dateFrom) return false;
          if (dateTo && item.created_at.slice(0, 10) > dateTo) return false;
          if (!q) return true;
          return (
            item.actor_username.toLowerCase().includes(q) ||
            item.entity_table.toLowerCase().includes(q) ||
            String(item.record_id ?? '').toLowerCase().includes(q) ||
            item.device_id.toLowerCase().includes(q) ||
            JSON.stringify(item.details ?? {}).toLowerCase().includes(q)
          );
        });
        setTotal(filtered.length);
        const start = (page - 1) * pageSize;
        setLogs(filtered.slice(start, start + pageSize));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [hasAdminAccess, isSupabaseActive, actionFilter, tableFilter, search, dateFrom, dateTo, page, pageSize]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const counts = useMemo(() => {
    let creates = 0;
    let updates = 0;
    let deletes = 0;
    for (const l of logs) {
      if (l.action === 'CREATE') creates++;
      else if (l.action === 'UPDATE' || l.action === 'UPSERT') updates++;
      else if (l.action === 'DELETE' || l.action === 'SOFT_DELETE') deletes++;
    }
    return { creates, updates, deletes };
  }, [logs]);

  if (!hasAdminAccess) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center space-y-2">
        <p className="text-sm font-bold text-red-800">
          {lang === 'si'
            ? 'පිවිසුම සීමා කර ඇත — Admin හෝ Super Admin අවසරය අවශ්‍යයි'
            : 'Access Restricted — Admin or Super Admin Permission Required'}
        </p>
        <p className="text-xs text-slate-600">
          {lang === 'si'
            ? 'ආරක්ෂක විගණන ලොගය බැලීමට හැක්කේ Admin හෝ Super Admin පරිශීලකයින්ට පමණි.'
            : 'Security Audit Logs are restricted exclusively to Administrator and Super Administrator accounts.'}
        </p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const exportRows = logs.map((l) => ({
    timestamp: l.created_at,
    action: l.action,
    module: l.entity_table,
    record_id: l.record_id ?? '',
    actor_username: l.actor_username,
    actor_name: String(l.details?.actor_name ?? ''),
    actor_role: String(l.details?.actor_role ?? ''),
    summary: String(l.details?.summary ?? ''),
    device_id: l.device_id,
    details_json: JSON.stringify(l.details ?? {}),
  }));

  return (
    <div className="space-y-4">
      {/* Header & Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F294A] text-white shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {lang === 'si' ? 'ආරක්ෂක විගණන ලොගය (Audit Log)' : 'Security Audit & Activity Log'}
              </h2>
              <p className="text-xs text-slate-500">
                {lang === 'si'
                  ? `මුළු සටහන් ${total} · නිර්මාණ, යාවත්කාලීන සහ මකාදැමීම් ස්වයංක්‍රීයව සටහන් වේ`
                  : `${total} recorded event(s) · Automatically tracks create, update, delete, restore, and merge actions`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void fetchLogs()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{lang === 'si' ? 'නැවුම් කරන්න' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv(`dmis-audit-log-${new Date().toISOString().slice(0, 10)}.csv`, exportRows)
              }
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{tLabel(lang, 'exportCsv')}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportDataToJson(`dmis-audit-log-${new Date().toISOString().slice(0, 10)}.json`, logs)
              }
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>{tLabel(lang, 'exportJson')}</span>
            </button>
          </div>
        </div>

        {/* Page Summary Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-slate-100 pt-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-medium text-slate-500">
              {lang === 'si' ? 'මුළු සටහන්' : 'Total Events'}
            </p>
            <p className="text-lg font-bold font-mono tabular-nums text-slate-900">{total}</p>
          </div>
          <div className="rounded-lg bg-emerald-50/70 px-3 py-2">
            <p className="text-[11px] font-medium text-emerald-700">
              {lang === 'si' ? 'නව නිර්මාණ (Create)' : 'Creates (Page)'}
            </p>
            <p className="text-lg font-bold font-mono tabular-nums text-emerald-900">{counts.creates}</p>
          </div>
          <div className="rounded-lg bg-blue-50/70 px-3 py-2">
            <p className="text-[11px] font-medium text-blue-700">
              {lang === 'si' ? 'යාවත්කාලීන (Update)' : 'Updates (Page)'}
            </p>
            <p className="text-lg font-bold font-mono tabular-nums text-blue-900">{counts.updates}</p>
          </div>
          <div className="rounded-lg bg-red-50/70 px-3 py-2">
            <p className="text-[11px] font-medium text-red-700">
              {lang === 'si' ? 'මකාදැමීම් (Delete)' : 'Deletes (Page)'}
            </p>
            <p className="text-lg font-bold font-mono tabular-nums text-red-900">{counts.deletes}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="grid gap-3 md:grid-cols-12">
          <div className="relative md:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={
                lang === 'si'
                  ? 'පරිශීලක, වාර්තා හැඳුනුම හෝ උපාංගය සොයන්න...'
                  : 'Search user, record ID, summary, device...'
              }
              className="w-full min-h-[42px] rounded-lg border border-slate-300 pl-9 pr-3 text-xs focus:border-[#0F294A] focus:outline-none"
            />
          </div>

          <div className="md:col-span-8 flex flex-wrap gap-2">
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
            >
              <option value="">{lang === 'si' ? 'සියලු ක්‍රියා' : 'All Actions'}</option>
              {ACTION_OPTIONS.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>

            <select
              value={tableFilter}
              onChange={(e) => {
                setTableFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
            >
              <option value="">{lang === 'si' ? 'සියලු මොඩියුල' : 'All Modules'}</option>
              {TABLE_OPTIONS.map((tbl) => (
                <option key={tbl} value={tbl}>
                  {MODULE_LABELS[tbl][lang]}
                </option>
              ))}
              <option value="all">System / All</option>
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              aria-label="Date from"
              className="min-h-[42px] rounded-lg border border-slate-300 px-2.5 text-xs text-slate-700"
            />

            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              aria-label="Date to"
              className="min-h-[42px] rounded-lg border border-slate-300 px-2.5 text-xs text-slate-700"
            />

            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700"
              aria-label="Rows per page"
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-900">
          {error}
        </div>
      )}

      {/* Logs Table & Mobile Cards */}
      {logs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-800">
            {lang === 'si' ? 'විගණන සටහන් කිසිවක් හමු නොවීය' : 'No audit log entries found'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {lang === 'si'
              ? 'පරිශීලකයින් වාර්තා නිර්මාණය, යාවත්කාලීන හෝ මකාදැමීම් සිදු කරන විට මෙහි ස්වයංක්‍රීයව සටහන් වේ.'
              : 'All create, update, and delete actions performed by officers will automatically appear here.'}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">{lang === 'si' ? 'දිනය සහ වේලාව' : 'Timestamp'}</th>
                  <th className="px-4 py-3">{lang === 'si' ? 'ක්‍රියාව' : 'Action'}</th>
                  <th className="px-4 py-3">{lang === 'si' ? 'පරිශීලකයා' : 'User Details'}</th>
                  <th className="px-4 py-3">{lang === 'si' ? 'මොඩියුලය / වාර්තාව' : 'Module & Record'}</th>
                  <th className="px-4 py-3">{lang === 'si' ? 'උපාංගය' : 'Device'}</th>
                  <th className="px-4 py-3 text-right">{tLabel(lang, 'actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const actorName = typeof log.details?.actor_name === 'string' ? log.details.actor_name : '';
                  const actorRole = typeof log.details?.actor_role === 'string' ? log.details.actor_role : '';
                  const summary = typeof log.details?.summary === 'string' ? log.details.summary : '';
                  const tableLabel =
                    log.entity_table in MODULE_LABELS
                      ? MODULE_LABELS[log.entity_table as keyof typeof MODULE_LABELS][lang]
                      : log.entity_table;

                  return (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap tabular-nums">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold ${getActionTone(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-900">
                          {actorName || log.actor_username}
                        </p>
                        <p className="font-mono text-[11px] text-slate-500">
                          @{log.actor_username}
                          {actorRole ? ` · ${actorRole}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800">{tableLabel}</p>
                        <p className="text-[11px] text-slate-500 truncate max-w-xs">
                          {summary || (log.record_id ? `ID: ${log.record_id.slice(0, 8)}...` : '—')}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {log.device_id}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Eye className="h-3 w-3" />
                          <span>{lang === 'si' ? 'විස්තර' : 'Details'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="grid gap-3 md:hidden">
            {logs.map((log) => {
              const actorName = typeof log.details?.actor_name === 'string' ? log.details.actor_name : '';
              const summary = typeof log.details?.summary === 'string' ? log.details.summary : '';
              return (
                <div key={log.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold ${getActionTone(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs">
                    <p className="font-semibold text-slate-900">
                      {actorName ? `${actorName} (@${log.actor_username})` : `@${log.actor_username}`}
                    </p>
                    <p className="text-slate-600">
                      {log.entity_table}
                      {summary ? ` · ${summary}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                    <span className="font-mono">{log.device_id}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      className="inline-flex items-center gap-1 font-semibold text-[#0F294A]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>{lang === 'si' ? 'විස්තර' : 'Inspect'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
            <span className="tabular-nums">
              Page {safePage} / {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>{tLabel(lang, 'prev')}</span>
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 disabled:opacity-40"
              >
                <span>{tLabel(lang, 'next')}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Detail Inspection Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {selectedLog.action} · {selectedLog.entity_table}
                </h3>
                <p className="font-mono text-[11px] text-slate-500">
                  {new Date(selectedLog.created_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400">Username: </span>
                <span className="font-mono font-semibold text-slate-800">{selectedLog.actor_username}</span>
              </div>
              <div>
                <span className="text-slate-400">Device ID: </span>
                <span className="font-mono font-semibold text-slate-800">{selectedLog.device_id}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400">Actor ID: </span>
                <span className="font-mono text-slate-700">{selectedLog.actor_id ?? '—'}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400">Record ID: </span>
                <span className="font-mono text-slate-700">{selectedLog.record_id ?? '—'}</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Event Metadata (JSON)</p>
              <pre className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] font-mono text-slate-700 overflow-x-auto">
                {JSON.stringify(selectedLog.details ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
