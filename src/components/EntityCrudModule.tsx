import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react';
import {
  canAccessModule,
  isAdminRole,
  ROLE_PERMISSIONS,
  type AffectedFamily,
  type AuthUser,
  type DataTableKey,
  type DmisDataset,
  type Language,
  type UserRole,
} from '../types/dmis';
import type { SaveRecordResponse } from '../lib/apiClient';
import { MODULE_CONFIGS } from '../lib/moduleConfigs';
import { exportDataToJson, exportRowsToCsv, parseCsvText } from '../lib/csvJson';
import { tLabel } from '../i18n/translations';
import { PhotoUploadField } from './PhotoUploadField';
import { FamilyAssessmentPdfModal } from './FamilyAssessmentDossier';

interface EntityCrudModuleProps {
  table: DataTableKey;
  lang: Language;
  dataset: DmisDataset;
  user: AuthUser;
  onSaveRecord: (table: DataTableKey, record: Record<string, unknown>, isEdit: boolean) => Promise<SaveRecordResponse | void>;
  onDeleteRecord: (table: DataTableKey, id: string) => Promise<void>;
  onBulkImport: (table: DataTableKey, records: Record<string, unknown>[]) => Promise<{ imported: number; skippedDuplicates: number }>;
}

export const EntityCrudModule: React.FC<EntityCrudModuleProps> = ({
  table,
  lang,
  dataset,
  user,
  onSaveRecord,
  onDeleteRecord,
  onBulkImport,
}) => {
  const config = MODULE_CONFIGS[table];
  const perms = ROLE_PERMISSIONS[user.role];

  const canViewModule = canAccessModule(user.role, table);

  const canWrite = useMemo(() => {
    if (isAdminRole(user.role)) return true;
    if (!canAccessModule(user.role, table)) return false;
    if (user.role === 'auditor_viewer') return false;
    if (user.role === 'district_officer') {
      return ['disasters', 'affected_families', 'affected_persons', 'house_damages'].includes(table);
    }
    return ['affected_families', 'affected_persons', 'house_damages'].includes(table);
  }, [user.role, table]);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState(config.defaultSortKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [formState, setFormState] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pdfFamily, setPdfFamily] = useState<AffectedFamily | null>(null);
  const [emailVerifChallenge, setEmailVerifChallenge] = useState<{
    challengeId: string;
    email: string;
    payload: Record<string, unknown>;
    isEdit: boolean;
  } | null>(null);
  const [emailVerifCode, setEmailVerifCode] = useState('');

  // Import state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<{
    filename: string;
    headers: string[];
    rows: Record<string, unknown>[];
    mapping: Record<string, string>;
  } | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const rawRows = (dataset[table] ?? []) as unknown as Record<string, unknown>[];

  const activeRows = useMemo(
    () => rawRows.filter((r) => !r.is_deleted),
    [rawRows]
  );

  // Build a fast lowercase search index per active row covering relevant fields,
  // resolved relation labels (e.g., District / GN / Family / Disaster), and legacy_extra_data,
  // while skipping binary/photo strings and password_hash for instant typing across large datasets.
  const searchIndexById = useMemo(() => {
    const relationFields = config.fields.filter((f) => f.type === 'relation' && f.relationTable);
    const relationLookup = new Map<string, Map<string, string>>();
    for (const rf of relationFields) {
      if (!rf.relationTable) continue;
      const relRows = (dataset[rf.relationTable] ?? []) as unknown as Record<string, unknown>[];
      const byId = new Map<string, string>();
      for (const rr of relRows) {
        if (rr.is_deleted) continue;
        const label = rf.relationLabelFn ? rf.relationLabelFn(rr, lang) : String(rr.id ?? '');
        byId.set(String(rr.id), label);
      }
      relationLookup.set(rf.key, byId);
    }

    const index = new Map<string, string>();
    for (const row of activeRows) {
      const parts: string[] = [];

      for (const fieldKey of config.searchableFields) {
        const val = row[fieldKey];
        if (val !== null && val !== undefined && val !== '') {
          parts.push(String(val));
        }
      }

      for (const rf of relationFields) {
        const relId = row[rf.key];
        if (relId !== null && relId !== undefined && relId !== '') {
          const label = relationLookup.get(rf.key)?.get(String(relId));
          if (label) parts.push(label);
        }
      }

      for (const col of config.columns) {
        if (col.key === 'photo_url' || col.key === 'photos') continue;
        if (col.format) {
          const formatted = col.format(row[col.key], row, dataset, lang);
          if (formatted && formatted !== '—') parts.push(formatted);
        }
      }

      if (row.legacy_extra_data && typeof row.legacy_extra_data === 'object') {
        for (const extraVal of Object.values(row.legacy_extra_data as Record<string, unknown>)) {
          if (extraVal !== null && extraVal !== undefined && extraVal !== '') {
            parts.push(String(extraVal));
          }
        }
      }

      index.set(String(row.id), parts.join(' ').toLowerCase());
    }
    return index;
  }, [activeRows, config, dataset, lang]);

  const hasActiveFilters = useMemo(
    () => Boolean(search.trim()) || Object.values(filters).some(Boolean),
    [search, filters]
  );

  const clearSearchAndFilters = () => {
    setSearch('');
    setFilters({});
    setPage(1);
  };

  const filteredRows = useMemo(() => {
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);

    return activeRows
      .filter((row) => {
        for (const [fKey, fVal] of Object.entries(filters)) {
          if (fVal && String(row[fKey] ?? '') !== fVal) return false;
        }
        if (tokens.length === 0) return true;
        const haystack = searchIndexById.get(String(row.id)) ?? '';
        return tokens.every((tok) => haystack.includes(tok));
      })
      .sort((a, b) => {
        const av = a[sortKey] ?? '';
        const bv = b[sortKey] ?? '';
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [activeRows, filters, search, searchIndexById, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const openCreateModal = () => {
    const initial: Record<string, unknown> = {};
    for (const f of config.fields) {
      if (f.defaultValue !== undefined) {
        initial[f.key] = f.defaultValue;
      } else if (f.type === 'date' && f.required) {
        initial[f.key] = new Date().toISOString().slice(0, 10);
      } else {
        initial[f.key] = '';
      }
    }
    setEditingRow(null);
    setFormState(initial);
    setFormError(null);
    setEmailVerifChallenge(null);
    setEmailVerifCode('');
    setModalOpen(true);
  };

  const openEditModal = (row: Record<string, unknown>) => {
    setEditingRow(row);
    setFormState({ ...row, password: '' });
    setFormError(null);
    setEmailVerifChallenge(null);
    setEmailVerifCode('');
    setModalOpen(true);
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Duplicate natural key check locally before submitting
    const natKey = config.naturalKeyField;
    const natVal = String(formState[natKey] ?? '').trim().toLowerCase();
    if (natVal) {
      const dup = rawRows.find(
        (r) => !r.is_deleted && r.id !== editingRow?.id && String(r[natKey] ?? '').trim().toLowerCase() === natVal
      );
      if (dup) {
        setFormError(
          lang === 'si'
            ? `මෙම ${natKey} අගය සහිත වාර්තාවක් දැනටමත් පවතී.`
            : `Duplicate detected: A record with ${natKey} "${String(formState[natKey])}" already exists.`
        );
        return;
      }
    }

    if (table === 'officers' && isAdminRole(formState.role as UserRole)) {
      const emailStr = String(formState.email ?? '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
        setFormError(
          lang === 'si'
            ? 'Admin සහ Super Admin ගිණුම් සඳහා වලංගු විද්‍යුත් තැපැල් ලිපිනයක් අනිවාර්ය වේ.'
            : 'A valid official email address is required to create Admin or Super Admin accounts.'
        );
        return;
      }
      if (!editingRow && String(formState.password ?? '').length < 8) {
        setFormError(
          lang === 'si'
            ? 'නව නිලධාරී ගිණුමක් සඳහා අවම වශයෙන් අකුරු 8ක මුරපදයක් අවශ්‍යයි.'
            : 'Password of at least 8 characters is required for new officer accounts.'
        );
        return;
      }
    }

    setSaving(true);
    try {
      const cleaned: Record<string, unknown> = { ...formState };
      for (const f of config.fields) {
        if (f.type === 'number') {
          cleaned[f.key] = cleaned[f.key] === '' || cleaned[f.key] === null ? null : Number(cleaned[f.key]);
        } else if (f.type === 'relation' && cleaned[f.key] === '') {
          cleaned[f.key] = null;
        } else if (f.type === 'date' && cleaned[f.key] === '') {
          cleaned[f.key] = null;
        } else if (f.type === 'photo_single') {
          cleaned[f.key] = typeof cleaned[f.key] === 'string' && cleaned[f.key] ? cleaned[f.key] : null;
        } else if (f.type === 'photo_multi') {
          const arrVal = cleaned[f.key];
          cleaned[f.key] = Array.isArray(arrVal) ? arrVal.slice(0, f.maxPhotos ?? 3) : [];
        }
      }
      if (editingRow) {
        cleaned.id = editingRow.id;
        cleaned.expected_version = editingRow.version;
      }
      const res = await onSaveRecord(table, cleaned, Boolean(editingRow));
      if (res && res.verificationRequired && res.challengeId && res.email) {
        setEmailVerifChallenge({
          challengeId: res.challengeId,
          email: res.email,
          payload: cleaned,
          isEdit: Boolean(editingRow),
        });
        setEmailVerifCode('');
        return;
      }
      setEmailVerifChallenge(null);
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save record');
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailVerifChallenge) return;
    setFormError(null);
    setSaving(true);
    try {
      await onSaveRecord(
        table,
        {
          ...emailVerifChallenge.payload,
          verification_challenge_id: emailVerifChallenge.challengeId,
          verification_code: emailVerifCode.trim(),
        },
        emailVerifChallenge.isEdit
      );
      setEmailVerifChallenge(null);
      setEmailVerifCode('');
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setSaving(false);
    }
  };

  const handleResendEmailOtp = async () => {
    if (!emailVerifChallenge) return;
    setFormError(null);
    setSaving(true);
    try {
      const res = await onSaveRecord(table, emailVerifChallenge.payload, emailVerifChallenge.isEdit);
      if (res && res.verificationRequired && res.challengeId && res.email) {
        setEmailVerifChallenge({
          ...emailVerifChallenge,
          challengeId: res.challengeId,
          email: res.email,
        });
        setEmailVerifCode('');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setSaving(false);
    }
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();

    let headers: string[] = [];
    let rows: Record<string, unknown>[] = [];

    if (file.name.toLowerCase().endsWith('.json')) {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed.rows) ? parsed.rows : [];
      rows = arr as Record<string, unknown>[];
      headers = Array.from(
        rows.reduce((s, r) => {
          Object.keys(r).forEach((k) => s.add(k));
          return s;
        }, new Set<string>())
      );
    } else {
      const parsed = parseCsvText(text);
      headers = parsed.headers;
      rows = parsed.rows;
    }

    if (rows.length === 0) {
      setImportStatus('The selected file contains no rows.');
      return;
    }

    const targetKeys = new Set(config.fields.map((f) => f.key));
    const autoMapping: Record<string, string> = {};
    for (const h of headers) {
      const norm = h.trim().toLowerCase().replace(/\s+/g, '_');
      if (targetKeys.has(h)) autoMapping[h] = h;
      else if (targetKeys.has(norm)) autoMapping[h] = norm;
      else autoMapping[h] = '__extra__';
    }

    setImportPreview({ filename: file.name, headers, rows, mapping: autoMapping });
    setImportStatus(null);
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    const mappedRecords: Record<string, unknown>[] = importPreview.rows.map((src) => {
      const out: Record<string, unknown> = { legacy_extra_data: {} };
      const extra: Record<string, unknown> = {};
      for (const h of importPreview.headers) {
        const dest = importPreview.mapping[h];
        if (!dest || dest === '__ignore__') continue;
        if (dest === '__extra__') {
          if (src[h] !== '' && src[h] !== undefined) {
            extra[h] = src[h];
          }
        } else {
          out[dest] = src[h];
        }
      }
      if (typeof src.id === 'string' && src.id.length >= 32) {
        out.id = src.id;
      }
      out.legacy_extra_data = extra;
      return out;
    });

    const result = await onBulkImport(table, mappedRecords);
    setImportPreview(null);
    setImportStatus(
      `Imported ${result.imported} records (${result.skippedDuplicates} duplicates skipped safely).`
    );
  };

  const title = lang === 'si' ? config.titleSi : config.titleEn;

  if (!canViewModule) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center space-y-2">
        <p className="text-sm font-bold text-red-800">
          {lang === 'si'
            ? 'පිවිසුම සීමා කර ඇත — Admin හෝ Super Admin අවසරය අවශ්‍යයි'
            : 'Access Restricted — Admin or Super Admin Permission Required'}
        </p>
        <p className="text-xs text-slate-600">
          {lang === 'si'
            ? 'මෙම කොටස සඳහා පිවිසීමට හැක්කේ Admin හෝ Super Admin පරිශීලකයින්ට පමණි.'
            : 'This module is restricted exclusively to Administrator and Super Administrator accounts.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="dossier-hide-on-print space-y-4">
      {/* Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500 tabular-nums">
              {tLabel(lang, 'showing')} {pagedRows.length} {tLabel(lang, 'of')} {filteredRows.length}
              {hasActiveFilters && activeRows.length !== filteredRows.length
                ? lang === 'si'
                  ? ` (මුළු ${activeRows.length} න් පෙරා ඇත)`
                  : ` (filtered from ${activeRows.length} total)`
                : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportRowsToCsv(`${table}-${new Date().toISOString().slice(0, 10)}.csv`, filteredRows)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{tLabel(lang, 'exportCsv')}</span>
            </button>

            <button
              type="button"
              onClick={() => exportDataToJson(`${table}-${new Date().toISOString().slice(0, 10)}.json`, filteredRows)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>{tLabel(lang, 'exportJson')}</span>
            </button>

            {canWrite && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json"
                  onChange={handleFileChosen}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{tLabel(lang, 'importData')}</span>
                </button>

                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0F294A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1A3B66] whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  <span>{tLabel(lang, 'addRecord')}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {importStatus && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
            {importStatus}
          </div>
        )}

        {/* Search & Filters */}
        <div className="grid gap-3 md:grid-cols-12">
          <div className="relative md:col-span-5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label={lang === 'si' ? 'වාර්තා සොයන්න' : `Search ${config.titleEn}`}
              placeholder={lang === 'si' ? config.searchHintSi : config.searchHintEn}
              className="w-full min-h-[42px] rounded-lg border border-slate-300 pl-9 pr-9 text-sm focus:border-[#0F294A] focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                aria-label={lang === 'si' ? 'සෙවුම හිස් කරන්න' : 'Clear search'}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 md:col-span-7">
            {config.filters.map((flt) => {
              const relRows = flt.relationTable
                ? ((dataset[flt.relationTable] ?? []) as unknown as Record<string, unknown>[]).filter(
                    (r) => !r.is_deleted
                  )
                : [];
              return (
                <select
                  key={flt.key}
                  value={filters[flt.key] ?? ''}
                  onChange={(e) => {
                    setFilters((prev) => ({ ...prev, [flt.key]: e.target.value }));
                    setPage(1);
                  }}
                  className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 focus:border-[#0F294A] focus:outline-none"
                >
                  <option value="">
                    {lang === 'si' ? flt.labelSi : flt.labelEn}: {tLabel(lang, 'allFilters')}
                  </option>
                  {flt.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {lang === 'si' ? opt.labelSi : opt.labelEn}
                    </option>
                  ))}
                  {relRows.map((rr) => (
                    <option key={String(rr.id)} value={String(rr.id)}>
                      {flt.relationLabelFn ? flt.relationLabelFn(rr, lang) : String(rr.id)}
                    </option>
                  ))}
                </select>
              );
            })}

            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
              aria-label="Rows per page"
            >
              <option value={15}>15 / page</option>
              <option value={30}>30 / page</option>
              <option value={50}>50 / page</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearSearchAndFilters}
                className="inline-flex min-h-[42px] items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" />
                <span>{lang === 'si' ? 'පෙරහන් ඉවත් කරන්න' : 'Clear'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Empty State or Data Table + Mobile Cards */}
      {pagedRows.length === 0 ? (
        activeRows.length > 0 && hasActiveFilters ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
            <p className="text-sm font-semibold text-slate-800">
              {lang === 'si' ? 'ගැලපෙන වාර්තා හමු නොවීය' : 'No matching records found'}
            </p>
            <p className="mt-1 text-xs text-slate-500 max-w-lg mx-auto">
              {lang === 'si'
                ? 'ඔබගේ සෙවුම් පදය හෝ පෙරහන් සඳහා ගැලපෙන වාර්තා නොමැත. සෙවුම වෙනස් කර හෝ පෙරහන් ඉවත් කර නැවත උත්සාහ කරන්න.'
                : `No records in ${config.titleEn} match your current search or filter criteria.`}
            </p>
            <button
              type="button"
              onClick={clearSearchAndFilters}
              className="mt-4 inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
              <span>{lang === 'si' ? 'සෙවුම සහ පෙරහන් ඉවත් කරන්න' : 'Clear search & filters'}</span>
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
            <p className="text-sm font-semibold text-slate-800">{tLabel(lang, 'noRecordsTitle')}</p>
            <p className="mt-1 text-xs text-slate-500 max-w-lg mx-auto">{tLabel(lang, 'noRecordsBody')}</p>
            {canWrite && (
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-4 inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1A3B66]"
              >
                <Plus className="h-4 w-4" />
                <span>{tLabel(lang, 'addRecord')}</span>
              </button>
            )}
          </div>
        )
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  {config.columns.map((col) => (
                    <th key={col.key} className={`px-4 py-3 ${col.isNumeric ? 'text-right' : ''}`}>
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        <span>{lang === 'si' ? col.labelSi : col.labelEn}</span>
                        <ArrowDownUp className="h-3 w-3 text-slate-400" />
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">{tLabel(lang, 'actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRows.map((row) => (
                  <tr key={String(row.id)} className="hover:bg-slate-50">
                    {config.columns.map((col) => {
                      const raw = row[col.key];
                      const display = col.format ? col.format(raw, row, dataset, lang) : String(raw ?? '—');
                      return (
                        <td
                          key={col.key}
                          className={`px-4 py-2.5 text-xs text-slate-800 ${
                            col.isNumeric ? 'text-right font-mono tabular-nums' : ''
                          }`}
                        >
                          {display || '—'}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {table === 'affected_families' && (
                          <button
                            type="button"
                            onClick={() => setPdfFamily(row as unknown as AffectedFamily)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-[#0F294A] hover:bg-slate-100"
                          >
                            <FileText className="h-3 w-3" />
                            <span>{lang === 'si' ? 'PDF වාර්තාව' : 'Generate PDF'}</span>
                          </button>
                        )}
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => openEditModal(row)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Edit3 className="h-3 w-3" />
                            <span>{lang === 'si' ? 'සංස්කරණය' : 'Edit'}</span>
                          </button>
                        )}
                        {perms.canDeleteRecords && canWrite && (
                          <button
                            type="button"
                            onClick={() => onDeleteRecord(table, String(row.id))}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            <Archive className="h-3 w-3" />
                            <span>{tLabel(lang, 'archiveRecord')}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Card View */}
          <div className="grid gap-3 md:hidden">
            {pagedRows.map((row) => (
              <div key={String(row.id)} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {String(row[config.columns[1]?.key ?? config.columns[0].key] ?? '—')}
                    </p>
                    <p className="text-xs font-mono text-slate-500">
                      {String(row[config.columns[0].key] ?? '')} · v{String(row.version ?? 1)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 text-xs">
                  {config.columns.slice(2).map((col) => (
                    <div key={col.key}>
                      <span className="text-slate-400">{lang === 'si' ? col.labelSi : col.labelEn}: </span>
                      <span className="font-medium text-slate-800">
                        {col.format ? col.format(row[col.key], row, dataset, lang) : String(row[col.key] ?? '—')}
                      </span>
                    </div>
                  ))}
                </div>
                {(table === 'affected_families' || canWrite) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {table === 'affected_families' && (
                      <button
                        type="button"
                        onClick={() => setPdfFamily(row as unknown as AffectedFamily)}
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0F294A] px-3 text-xs font-semibold text-white"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>{lang === 'si' ? 'PDF වාර්තාව' : 'Generate PDF'}</span>
                      </button>
                    )}
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => openEditModal(row)}
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>{lang === 'si' ? 'සංස්කරණය' : 'Edit'}</span>
                      </button>
                    )}
                    {canWrite && perms.canDeleteRecords && (
                      <button
                        type="button"
                        onClick={() => onDeleteRecord(table, String(row.id))}
                        className="min-h-[44px] px-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-700"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        <span>{tLabel(lang, 'archiveRecord')}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
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
      </div>

      {/* Add / Edit Record Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 sm:p-4">
          <div className="max-h-[92vh] w-full sm:max-w-2xl overflow-y-auto rounded-t-2xl sm:rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingRow ? tLabel(lang, 'editRecord') : tLabel(lang, 'addRecord')} — {title}
                </h3>
                {editingRow && (
                  <p className="text-[11px] font-mono text-slate-500">
                    ID: {String(editingRow.id)} · v{String(editingRow.version ?? 1)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
                {formError}
              </div>
            )}

            {emailVerifChallenge ? (
              <form onSubmit={handleVerifyEmailOtp} className="mt-4 space-y-4">
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 space-y-1.5">
                  <p className="text-xs font-bold text-slate-900">
                    {lang === 'si' ? 'විද්‍යුත් තැපැල් සත්‍යාපන කේතය අවශ්‍යයි' : 'Email Verification Required'}
                  </p>
                  <p className="text-xs text-slate-700">
                    {lang === 'si'
                      ? `${emailVerifChallenge.email} වෙත එවන ලද ඉලක්කම් 6ක සත්‍යාපන කේතය ඇතුළත් කරන්න.`
                      : `A 6-digit verification code has been sent to ${emailVerifChallenge.email}. Enter it below to finalize this Administrator account.`}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {lang === 'si' ? 'ඉලක්කම් 6ක කේතය' : '6-Digit Verification Code'} *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    value={emailVerifCode}
                    onChange={(e) => setEmailVerifCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-center font-mono text-lg tracking-widest focus:border-[#0F294A] focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setEmailVerifChallenge(null);
                        setFormError(null);
                      }}
                      className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {lang === 'si' ? 'ආපසු' : 'Back'}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleResendEmailOtp}
                      className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {lang === 'si' ? 'නැවත එවන්න' : 'Resend Code'}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={saving || emailVerifCode.length !== 6}
                    className="min-h-[40px] rounded-lg bg-[#0F294A] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1A3B66] disabled:opacity-50"
                  >
                    {saving
                      ? '...'
                      : lang === 'si'
                        ? 'තහවුරු කර ගිණුම සුරකින්න'
                        : 'Verify & Save Account'}
                  </button>
                </div>
              </form>
            ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {table === 'officers' && isAdminRole(formState.role as UserRole) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                  {lang === 'si'
                    ? 'Admin සහ Super Admin ගිණුම් සෑදීමේදී වලංගු විද්‍යුත් තැපෑලක් සහ එම ලිපිනයට එවන කේතයෙන් තහවුරු කිරීම අනිවාර්ය වේ.'
                    : 'Creating or promoting an Admin / Super Admin account requires a valid official email address verified via a 6-digit email code.'}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {config.fields.map((field) => {
                  const label = lang === 'si' ? field.labelSi : field.labelEn;
                  const val = formState[field.key] ?? '';

                  if (field.type === 'photo_single' || field.type === 'photo_multi') {
                    return (
                      <PhotoUploadField
                        key={field.key}
                        label={label}
                        lang={lang}
                        maxPhotos={field.type === 'photo_multi' ? (field.maxPhotos ?? 3) : 1}
                        value={formState[field.key] as string | string[] | null | undefined}
                        onChange={(next) => setFormState((s) => ({ ...s, [field.key]: next }))}
                      />
                    );
                  }

                  if (field.type === 'textarea') {
                    return (
                      <div key={field.key} className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          {label} {field.required ? '*' : ''}
                        </label>
                        <textarea
                          rows={3}
                          required={field.required}
                          value={String(val)}
                          onChange={(e) => setFormState((s) => ({ ...s, [field.key]: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#0F294A] focus:outline-none"
                        />
                      </div>
                    );
                  }

                  if (field.type === 'boolean') {
                    return (
                      <div key={field.key} className="flex items-center gap-2.5 pt-5">
                        <input
                          id={`fld-${field.key}`}
                          type="checkbox"
                          checked={Boolean(val)}
                          onChange={(e) => setFormState((s) => ({ ...s, [field.key]: e.target.checked }))}
                          className="h-4 w-4 rounded border-slate-300 text-[#0F294A]"
                        />
                        <label htmlFor={`fld-${field.key}`} className="text-xs font-semibold text-slate-700">
                          {label}
                        </label>
                      </div>
                    );
                  }

                  if (field.type === 'select') {
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          {label} {field.required ? '*' : ''}
                        </label>
                        <select
                          required={field.required}
                          value={String(val)}
                          onChange={(e) => setFormState((s) => ({ ...s, [field.key]: e.target.value }))}
                          className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                        >
                          {field.options?.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {lang === 'si' ? opt.labelSi : opt.labelEn}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  if (field.type === 'relation' && field.relationTable) {
                    const relRows = (
                      (dataset[field.relationTable] ?? []) as unknown as Record<string, unknown>[]
                    ).filter((r) => !r.is_deleted);
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          {label} {field.required ? '*' : ''}
                        </label>
                        <select
                          required={field.required}
                          value={String(val ?? '')}
                          onChange={(e) => setFormState((s) => ({ ...s, [field.key]: e.target.value }))}
                          className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                        >
                          <option value="">-- Select --</option>
                          {relRows.map((rr) => (
                            <option key={String(rr.id)} value={String(rr.id)}>
                              {field.relationLabelFn ? field.relationLabelFn(rr, lang) : String(rr.id)}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  const isEmailRequiredForAdmin =
                    table === 'officers' &&
                    field.key === 'email' &&
                    isAdminRole(formState.role as UserRole);

                  return (
                    <div key={field.key}>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {label} {field.required || isEmailRequiredForAdmin ? '*' : ''}
                      </label>
                      <input
                        type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.key === 'email' ? 'email' : 'text'}
                        step={field.type === 'number' ? 'any' : undefined}
                        required={(field.required || isEmailRequiredForAdmin) && !(field.type === 'password' && editingRow)}
                        placeholder={field.placeholder}
                        value={String(val ?? '')}
                        onChange={(e) => setFormState((s) => ({ ...s, [field.key]: e.target.value }))}
                        className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm focus:border-[#0F294A] focus:outline-none"
                      />
                    </div>
                  );
                })}
              </div>

              {config.fields.some((f) => f.key === 'latitude') &&
                config.fields.some((f) => f.key === 'longitude') && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <span className="text-xs text-slate-600">
                      {lang === 'si'
                        ? 'සිතියමේ පෙන්වීම සඳහා GPS ඛණ්ඩාංක ඇතුළත් කරන්න'
                        : 'Capture device GPS coordinates to plot this record on the GIS Map'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!navigator.geolocation) {
                          setFormError('Geolocation is not supported on this device/browser.');
                          return;
                        }
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            setFormState((s) => ({
                              ...s,
                              latitude: Number(pos.coords.latitude.toFixed(6)),
                              longitude: Number(pos.coords.longitude.toFixed(6)),
                            }));
                          },
                          (geoErr) => {
                            setFormError(`Unable to read device GPS: ${geoErr.message}`);
                          },
                          { enableHighAccuracy: true, timeout: 10000 }
                        );
                      }}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Crosshair className="h-3.5 w-3.5 text-[#0F294A]" />
                      <span>{lang === 'si' ? 'වත්මන් GPS ලබාගන්න' : 'Capture Device GPS'}</span>
                    </button>
                  </div>
                )}

              {editingRow &&
              editingRow.legacy_extra_data &&
              typeof editingRow.legacy_extra_data === 'object' &&
              Object.keys(editingRow.legacy_extra_data as Record<string, unknown>).length > 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1">
                    Preserved Legacy / Unmapped Fields
                  </p>
                  <pre className="text-[11px] font-mono text-slate-600 overflow-x-auto">
                    {JSON.stringify(editingRow.legacy_extra_data, null, 2)}
                  </pre>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[42px] rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {tLabel(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[42px] rounded-lg bg-[#0F294A] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1A3B66] disabled:opacity-60"
                >
                  {saving ? '...' : tLabel(lang, 'saveRecord')}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}

      {/* CSV / JSON Column-Mapping Import Modal */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Import Mapping — {importPreview.filename}
                </h3>
                <p className="text-xs text-slate-500">
                  {importPreview.rows.length} rows detected. Map columns to DMIS fields or preserve unmapped columns in legacy_extra_data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {importPreview.headers.map((header) => (
                <div key={header} className="grid grid-cols-2 items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-xs font-mono text-slate-800 truncate">{header}</span>
                  <select
                    value={importPreview.mapping[header] ?? '__extra__'}
                    onChange={(e) =>
                      setImportPreview((prev) =>
                        prev
                          ? { ...prev, mapping: { ...prev.mapping, [header]: e.target.value } }
                          : null
                      )
                    }
                    className="min-h-[36px] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                  >
                    <option value="__extra__">Preserve in legacy_extra_data</option>
                    <option value="__ignore__">Ignore column</option>
                    {config.fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.labelEn} ({f.key})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="min-h-[40px] rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                {tLabel(lang, 'cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                className="min-h-[40px] rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white"
              >
                Import {importPreview.rows.length} Rows Safely
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Individual Family Assessment PDF Modal */}
      {pdfFamily && (
        <FamilyAssessmentPdfModal
          family={pdfFamily}
          dataset={dataset}
          user={user}
          lang={lang}
          onClose={() => setPdfFamily(null)}
        />
      )}
    </div>
  );
};
