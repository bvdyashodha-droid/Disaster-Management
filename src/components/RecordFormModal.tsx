import React, { useState } from 'react';
import { Crosshair, X } from 'lucide-react';
import type { DataTableKey, DmisDataset, Language } from '../types/dmis';
import { MODULE_CONFIGS } from '../lib/moduleConfigs';
import { tLabel } from '../i18n/translations';
import { PhotoUploadField } from './PhotoUploadField';

interface RecordFormModalProps {
  table: DataTableKey;
  lang: Language;
  dataset: DmisDataset;
  editingRow?: Record<string, unknown> | null;
  onClose: () => void;
  onSave: (table: DataTableKey, record: Record<string, unknown>, isEdit: boolean) => Promise<void>;
}

export const RecordFormModal: React.FC<RecordFormModalProps> = ({
  table,
  lang,
  dataset,
  editingRow = null,
  onClose,
  onSave,
}) => {
  const config = MODULE_CONFIGS[table];
  const rawRows = (dataset[table] ?? []) as unknown as Record<string, unknown>[];

  const [formState, setFormState] = useState<Record<string, unknown>>(() => {
    if (editingRow) {
      return { ...editingRow, password: '' };
    }
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
    return initial;
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const title = lang === 'si' ? config.titleSi : config.titleEn;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

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
      await onSave(table, cleaned, Boolean(editingRow));
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save record');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 sm:p-4">
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
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {formError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
                      id={`ql-fld-${field.key}`}
                      type="checkbox"
                      checked={Boolean(val)}
                      onChange={(e) => setFormState((s) => ({ ...s, [field.key]: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-[#0F294A]"
                    />
                    <label htmlFor={`ql-fld-${field.key}`} className="text-xs font-semibold text-slate-700">
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

              return (
                <div key={field.key}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {label} {field.required ? '*' : ''}
                  </label>
                  <input
                    type={
                      field.type === 'password'
                        ? 'password'
                        : field.type === 'number'
                          ? 'number'
                          : field.type === 'date'
                            ? 'date'
                            : 'text'
                    }
                    step={field.type === 'number' ? 'any' : undefined}
                    required={field.required && !(field.type === 'password' && editingRow)}
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

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
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
      </div>
    </div>
  );
};
