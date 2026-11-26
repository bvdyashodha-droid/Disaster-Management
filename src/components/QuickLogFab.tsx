import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Home,
  PackageCheck,
  Plus,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { AuthUser, DataTableKey, DmisDataset, Language, UserRole } from '../types/dmis';
import { MODULE_LABELS } from '../i18n/translations';
import { RecordFormModal } from './RecordFormModal';

interface QuickLogFabProps {
  lang: Language;
  user: AuthUser;
  dataset: DmisDataset;
  onSaveRecord: (table: DataTableKey, record: Record<string, unknown>, isEdit: boolean) => Promise<unknown>;
}

const QUICK_LOG_OPTIONS: {
  table: DataTableKey;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}[] = [
  {
    table: 'disasters',
    icon: AlertTriangle,
    roles: ['super_admin', 'admin', 'district_officer'],
  },
  {
    table: 'affected_families',
    icon: Users,
    roles: ['super_admin', 'admin', 'district_officer', 'ds_officer', 'gn_officer'],
  },
  {
    table: 'affected_persons',
    icon: UserCheck,
    roles: ['super_admin', 'admin', 'district_officer', 'ds_officer', 'gn_officer'],
  },
  {
    table: 'house_damages',
    icon: Home,
    roles: ['super_admin', 'admin', 'district_officer', 'ds_officer', 'gn_officer'],
  },
  {
    table: 'relief_assistance',
    icon: PackageCheck,
    roles: ['super_admin', 'admin'],
  },
];

export const QuickLogFab: React.FC<QuickLogFabProps> = ({
  lang,
  user,
  dataset,
  onSaveRecord,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTable, setActiveTable] = useState<DataTableKey | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const permittedOptions = useMemo(
    () => QUICK_LOG_OPTIONS.filter((opt) => opt.roles.includes(user.role)),
    [user.role]
  );

  if (permittedOptions.length === 0) {
    return null;
  }

  const handleSave = async (table: DataTableKey, record: Record<string, unknown>, isEdit: boolean) => {
    await onSaveRecord(table, record, isEdit);
    const label = MODULE_LABELS[table][lang];
    setSavedBanner(
      lang === 'si' ? `${label} වාර්තාව සුරකින ලදී.` : `${label} record saved.`
    );
    setTimeout(() => setSavedBanner(null), 3500);
  };

  return (
    <>
      {/* Confirmation Toast */}
      {savedBanner && (
        <div className="no-print fixed bottom-36 right-4 lg:bottom-22 lg:right-6 z-40 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-900 shadow-md">
          <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      {/* Floating Action Button & Quick Menu */}
      <div className="no-print fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 flex flex-col items-end gap-2.5">
        {menuOpen && (
          <div
            className="w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
            role="menu"
            aria-label={lang === 'si' ? 'ක්ෂණික සටහන් මෙනුව' : 'Quick Log Menu'}
          >
            <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
              {lang === 'si' ? 'නව වාර්තාවක් එක් කරන්න' : 'Create New Record'}
            </div>
            <div className="py-1 space-y-0.5">
              {permittedOptions.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.table}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setActiveTable(opt.table);
                    }}
                    className="w-full min-h-[42px] flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-[#0F294A] transition"
                  >
                    <Icon className="h-4 w-4 text-[#0F294A] shrink-0" />
                    <span className="truncate">{MODULE_LABELS[opt.table][lang]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen}
          className="inline-flex h-12 min-w-[48px] items-center justify-center gap-2 rounded-full bg-[#0F294A] px-4 text-xs font-semibold text-white shadow-lg transition hover:bg-[#1A3B66] active:scale-[0.98] whitespace-nowrap"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          <span>{lang === 'si' ? 'ක්ෂණික සටහන' : 'Quick Log'}</span>
        </button>
      </div>

      {/* Modal Form */}
      {activeTable && (
        <RecordFormModal
          table={activeTable}
          lang={lang}
          dataset={dataset}
          onClose={() => setActiveTable(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
};
