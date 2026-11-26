import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building,
  Building2,
  Database,
  Globe,
  Home,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  MapPin,
  Menu,
  PackageCheck,
  RefreshCw,
  ScrollText,
  Shield,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  canAccessModule,
  isAdminRole,
  type AuthUser,
  type DataTableKey,
  type DmisDataset,
  type Language,
  type MergeConflict,
  type ModuleKey,
  type OfflineMutation,
  type RecordSnapshot,
} from './types/dmis';
import { MODULE_LABELS, ROLE_LABELS } from './i18n/translations';
import { apiClient, setAuthToken, type HealthStatus, type SaveRecordResponse } from './lib/apiClient';
import {
  ALL_DATA_TABLES,
  appendLocalAuditLog,
  getLocalSnapshots,
  getOrCreateDeviceId,
  getPendingMutations,
  loadLocalDataset,
  removeMutations,
  replaceLocalDataset,
  saveLocalRecord,
  setLocalOfflineOfficer,
} from './lib/offlineDb';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { PWAInstallButton } from './components/PWAInstallButton';
import { AuthGate } from './components/AuthGate';
import { DashboardOverview } from './components/DashboardOverview';
import { EntityCrudModule } from './components/EntityCrudModule';
import { ReportsModule } from './components/ReportsModule';
import { DisasterMapModule } from './components/DisasterMapModule';
import { SyncMergeBackupModule } from './components/SyncMergeBackupModule';
import { AuditLogModule } from './components/AuditLogModule';
import { QuickLogFab } from './components/QuickLogFab';

function summarizeRecord(record: Record<string, unknown>): string {
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

const EMPTY_DATASET: DmisDataset = {
  districts: [],
  divisional_secretariats: [],
  gn_divisions: [],
  officers: [],
  disasters: [],
  affected_families: [],
  affected_persons: [],
  house_damages: [],
  relief_assistance: [],
};

const NAV_GROUPS: {
  titleEn: string;
  titleSi: string;
  items: { key: ModuleKey; icon: React.ComponentType<{ className?: string }> }[];
}[] = [
  {
    titleEn: 'Operations',
    titleSi: 'මෙහෙයුම්',
    items: [
      { key: 'dashboard', icon: LayoutDashboard },
      { key: 'disasters', icon: AlertTriangle },
      { key: 'affected_families', icon: Users },
      { key: 'affected_persons', icon: UserCheck },
      { key: 'house_damages', icon: Home },
      { key: 'relief_assistance', icon: PackageCheck },
    ],
  },
  {
    titleEn: 'Divisions & Users',
    titleSi: 'කොට්ඨාස හා නිලධාරීන්',
    items: [
      { key: 'districts', icon: Building2 },
      { key: 'divisional_secretariats', icon: Building },
      { key: 'gn_divisions', icon: MapPin },
      { key: 'officers', icon: Shield },
      { key: 'audit_logs', icon: ScrollText },
    ],
  },
  {
    titleEn: 'Reports & Sync',
    titleSi: 'වාර්තා හා සමමුහුර්ත',
    items: [
      { key: 'map', icon: MapIcon },
      { key: 'reports', icon: BarChart3 },
      { key: 'sync_center', icon: Database },
    ],
  },
];

export default function App() {
  const isOnline = useOnlineStatus();
  const [lang, setLang] = useState<Language>('en');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');
  const [dataset, setDataset] = useState<DmisDataset>(EMPTY_DATASET);
  const [pendingMutations, setPendingMutations] = useState<OfflineMutation[]>([]);
  const [snapshots, setSnapshots] = useState<RecordSnapshot[]>([]);
  const [deviceId, setDeviceId] = useState('initializing');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);

  const isSupabaseServerActive = Boolean(
    isOnline &&
      health?.supabaseConfigured &&
      health?.connected &&
      health?.schemaReady &&
      user?.auth_mode === 'supabase_server'
  );

  const refreshLocalState = useCallback(async () => {
    const [localDs, muts, snaps, devId] = await Promise.all([
      loadLocalDataset(),
      getPendingMutations(),
      getLocalSnapshots(),
      getOrCreateDeviceId(),
    ]);
    setDataset(localDs);
    setPendingMutations(muts);
    setSnapshots(snaps);
    setDeviceId(devId);
  }, []);

  const refreshAllData = useCallback(async () => {
    await refreshLocalState();
    if (isSupabaseServerActive) {
      try {
        const [pulled, snapRes] = await Promise.all([apiClient.pullAll(), apiClient.getSnapshots()]);
        await replaceLocalDataset(pulled.tables);
        setDataset(pulled.tables);
        setSnapshots(snapRes.snapshots);
      } catch (err) {
        console.error('Server pull failed, retaining local cache:', err);
      }
    }
  }, [isSupabaseServerActive, refreshLocalState]);

  useEffect(() => {
    let active = true;
    async function boot() {
      try {
        const healthRes = await apiClient.getHealth().catch(() => null);
        if (!active) return;
        setHealth(healthRes);
        await refreshLocalState();
      } finally {
        if (active) setLoadingInit(false);
      }
    }
    void boot();
    return () => {
      active = false;
    };
  }, [refreshLocalState]);

  useEffect(() => {
    if (user) {
      void refreshAllData();
    }
  }, [user, refreshAllData]);

  useEffect(() => {
    if (user && !canAccessModule(user.role, activeModule)) {
      setActiveModule('dashboard');
    }
  }, [user, activeModule]);

  const handleSaveRecord = async (
    table: DataTableKey,
    record: Record<string, unknown>,
    isEdit: boolean
  ): Promise<SaveRecordResponse | void> => {
    if (isSupabaseServerActive) {
      const saved = isEdit
        ? await apiClient.updateRecord(table, String(record.id), { ...record, device_id: deviceId })
        : await apiClient.upsertRecord(table, { ...record, device_id: deviceId });
      if (saved.verificationRequired) {
        return saved;
      }
      if (saved.record) {
        await saveLocalRecord(table, saved.record, { queueMutation: false, deviceId });
      }
      await refreshAllData();
      return saved;
    } else {
      const saved = await saveLocalRecord(table, record, {
        queueMutation: true,
        snapshotReason: isEdit ? 'pre_offline_edit' : undefined,
        deviceId,
      });
      if (user) {
        await appendLocalAuditLog({
          actor_id: user.id,
          actor_username: user.username,
          action: isEdit ? 'UPDATE' : 'CREATE',
          entity_table: table,
          record_id: String(saved.id),
          device_id: deviceId,
          details: {
            actor_name: user.full_name,
            actor_role: user.role,
            summary: summarizeRecord(saved),
            version: saved.version,
            mode: 'offline_local',
          },
        });
      }
      await refreshLocalState();
    }
  };

  const handleDeleteRecord = async (table: DataTableKey, id: string) => {
    if (isSupabaseServerActive) {
      await apiClient.softDeleteRecord(table, id);
      await refreshAllData();
    } else {
      const existing = (dataset[table] as unknown as Record<string, unknown>[]).find((r) => r.id === id);
      if (existing) {
        await saveLocalRecord(
          table,
          { ...existing, is_deleted: true },
          { queueMutation: true, snapshotReason: 'pre_offline_archive', deviceId }
        );
        if (user) {
          await appendLocalAuditLog({
            actor_id: user.id,
            actor_username: user.username,
            action: 'DELETE',
            entity_table: table,
            record_id: id,
            device_id: deviceId,
            details: {
              actor_name: user.full_name,
              actor_role: user.role,
              summary: summarizeRecord(existing),
              soft_deleted: true,
              mode: 'offline_local',
            },
          });
        }
        await refreshLocalState();
      }
    }
  };

  const handleBulkImport = async (
    table: DataTableKey,
    records: Record<string, unknown>[]
  ): Promise<{ imported: number; skippedDuplicates: number }> => {
    let imported = 0;
    let skippedDuplicates = 0;

    for (const rec of records) {
      try {
        await handleSaveRecord(table, rec, false);
        imported++;
      } catch {
        skippedDuplicates++;
      }
    }
    return { imported, skippedDuplicates };
  };

  const handleSyncNow = async (): Promise<{ synced: number; conflicts: MergeConflict[] }> => {
    if (!isSupabaseServerActive) {
      throw new Error('Connect Supabase PostgreSQL and sign in with a server officer account to sync.');
    }
    const muts = await getPendingMutations();
    let synced = 0;
    let conflicts: MergeConflict[] = [];

    if (muts.length > 0) {
      const pushRes = await apiClient.pushMutations(muts);
      if (pushRes.appliedIds.length > 0) {
        await removeMutations(pushRes.appliedIds);
      }
      synced = pushRes.appliedIds.length;
      conflicts = pushRes.conflicts;
    }

    await refreshAllData();
    return { synced, conflicts };
  };

  const handleSignOut = async () => {
    setAuthToken(null);
    await setLocalOfflineOfficer(null);
    setUser(null);
  };

  if (loadingInit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-sm font-medium text-slate-600">
        Loading Disaster Management Information System...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthGate
        lang={lang}
        setLang={setLang}
        health={health}
        isOnline={isOnline}
        onAuthenticated={setUser}
      />
    );
  }

  const isDataModule = (key: ModuleKey): key is DataTableKey =>
    (ALL_DATA_TABLES as string[]).includes(key);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0F294A] text-white shrink-0">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-slate-900 truncate">DMIS Portal</p>
            <p className="text-[11px] text-slate-500 truncate">{ROLE_LABELS[user.role][lang]}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => canAccessModule(user.role, item.key));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.titleEn} className="space-y-1">
                <p className="px-3 text-[11px] font-semibold text-slate-400">
                  {lang === 'si' ? group.titleSi : group.titleEn}
                </p>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeModule === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveModule(item.key)}
                      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                        active
                          ? 'bg-[#0F294A] text-white'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{MODULE_LABELS[item.key][lang]}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3 space-y-2">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
            <p className="font-semibold text-slate-800 truncate">{user.full_name}</p>
            <p className="text-[11px] text-slate-500 truncate">{user.username}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{lang === 'si' ? 'ඉවත් වන්න' : 'Sign Out'}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 print:pl-0 print:pb-0 flex flex-col min-h-screen pb-20 lg:pb-0">
        {/* Compact Sticky Top Bar */}
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 backdrop-blur px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700"
              aria-label="Open Navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              {MODULE_LABELS[activeModule][lang]}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 pr-2">
              {isOnline ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-700" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-amber-700" />
              )}
              <span>
                {isOnline ? (lang === 'si' ? 'මාර්ගගතයි' : 'Online') : lang === 'si' ? 'නොබැඳි' : 'Offline'}
              </span>
              {pendingMutations.length > 0 && (
                <span className="font-mono text-amber-700">· {pendingMutations.length} queued</span>
              )}
            </span>

            <button
              type="button"
              onClick={() => setLang(lang === 'en' ? 'si' : 'en')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Globe className="h-3.5 w-3.5 text-[#0F294A]" />
              <span>{lang === 'en' ? 'සිං' : 'EN'}</span>
            </button>

            <PWAInstallButton lang={lang} />
          </div>
        </header>

        {/* Non-intrusive Offline / Sync Notice */}
        {(!isOnline || !isSupabaseServerActive) && (
          <div className="no-print border-b border-amber-200 bg-amber-50 px-4 sm:px-6 py-2 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
            <span>
              {!isOnline
                ? 'Offline Mode — Records are saved locally in IndexedDB and queued for administrator synchronization.'
                : isAdminRole(user.role)
                  ? 'Local Offline Workspace — Records are stored on this device. Open Sync & Setup to connect Supabase PostgreSQL.'
                  : 'Local Offline Workspace — Records are stored securely on this device until synchronized by an Administrator.'}
            </span>
            {pendingMutations.length > 0 && isSupabaseServerActive && isAdminRole(user.role) && (
              <button
                type="button"
                onClick={handleSyncNow}
                className="inline-flex items-center gap-1 font-semibold underline"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Sync {pendingMutations.length} pending</span>
              </button>
            )}
          </div>
        )}

        {/* Viewport Workspace */}
        <main className="flex-1 p-4 sm:p-6 print:p-0 max-w-7xl print:max-w-none w-full mx-auto">
          {!canAccessModule(user.role, activeModule) ? (
            <div className="rounded-xl border border-red-200 bg-white p-6 text-center space-y-2">
              <p className="text-sm font-bold text-red-800">
                {lang === 'si'
                  ? 'පිවිසුම සීමා කර ඇත — Admin හෝ Super Admin අවසරය අවශ්‍යයි'
                  : 'Access Restricted — Admin or Super Admin Permission Required'}
              </p>
              <button
                type="button"
                onClick={() => setActiveModule('dashboard')}
                className="inline-flex min-h-[40px] items-center rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white"
              >
                {lang === 'si' ? 'ප්‍රධාන පුවරුවට යන්න' : 'Return to Dashboard'}
              </button>
            </div>
          ) : (
            <>
              {activeModule === 'dashboard' && (
                <DashboardOverview
                  lang={lang}
                  userRole={user.role}
                  dataset={dataset}
                  pendingCount={pendingMutations.length}
                  deviceId={deviceId}
                  supabaseReady={isSupabaseServerActive}
                  onNavigate={setActiveModule}
                />
              )}

              {isDataModule(activeModule) && (
                <EntityCrudModule
                  key={activeModule}
                  table={activeModule}
                  lang={lang}
                  dataset={dataset}
                  user={user}
                  onSaveRecord={handleSaveRecord}
                  onDeleteRecord={handleDeleteRecord}
                  onBulkImport={handleBulkImport}
                />
              )}

          {activeModule === 'map' && (
            <DisasterMapModule
              lang={lang}
              dataset={dataset}
              isOnline={isOnline}
              onNavigate={setActiveModule}
            />
          )}

          {activeModule === 'reports' && (
            <ReportsModule lang={lang} dataset={dataset} user={user} />
          )}

          {activeModule === 'audit_logs' && (
            <AuditLogModule
              lang={lang}
              user={user}
              isSupabaseActive={isSupabaseServerActive}
            />
          )}

          {activeModule === 'sync_center' && (
            <SyncMergeBackupModule
              lang={lang}
              user={user}
              dataset={dataset}
              pendingMutations={pendingMutations}
              snapshots={snapshots}
              deviceId={deviceId}
              isOnline={isOnline}
              health={health}
              onSyncNow={handleSyncNow}
              onRefreshData={refreshAllData}
            />
          )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (Thumb Zone) */}
      <nav className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur pb-safe">
        <div className="grid grid-cols-4 h-16">
          {[
            { key: 'dashboard' as ModuleKey, label: lang === 'si' ? 'පුවරුව' : 'Home', icon: LayoutDashboard },
            { key: 'affected_families' as ModuleKey, label: lang === 'si' ? 'පවුල්' : 'Families', icon: Users },
            isAdminRole(user.role)
              ? { key: 'relief_assistance' as ModuleKey, label: lang === 'si' ? 'සහන' : 'Relief', icon: PackageCheck }
              : { key: 'house_damages' as ModuleKey, label: lang === 'si' ? 'නිවාස හානි' : 'Damages', icon: Home },
            isAdminRole(user.role)
              ? { key: 'sync_center' as ModuleKey, label: lang === 'si' ? 'සමමුහුර්ත' : 'Sync', icon: RefreshCw }
              : { key: 'map' as ModuleKey, label: lang === 'si' ? 'සිතියම' : 'Map', icon: MapIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeModule === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveModule(tab.key)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
                  active ? 'text-[#0F294A]' : 'text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate max-w-[72px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile Full Module Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative z-10 w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F294A] text-white">
                  <Shield className="h-4 w-4" />
                </div>
                <span className="text-sm font-bold text-slate-900">DMIS Modules</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {NAV_GROUPS.map((group) => {
                const visibleItems = group.items.filter((item) => canAccessModule(user.role, item.key));
                if (visibleItems.length === 0) return null;
                return (
                  <div key={group.titleEn} className="space-y-1">
                    <p className="px-3 text-[11px] font-semibold text-slate-400">
                      {lang === 'si' ? group.titleSi : group.titleEn}
                    </p>
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const active = activeModule === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setActiveModule(item.key);
                            setMobileMenuOpen(false);
                          }}
                          className={`w-full min-h-[44px] flex items-center gap-3 rounded-lg px-3 text-xs font-semibold ${
                            active ? 'bg-[#0F294A] text-white' : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{MODULE_LABELS[item.key][lang]}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-200 p-3 space-y-2">
              <div className="text-xs px-2">
                <p className="font-semibold text-slate-900">{user.full_name}</p>
                <p className="text-slate-500">{ROLE_LABELS[user.role][lang]}</p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                <LogOut className="h-4 w-4" />
                <span>{lang === 'si' ? 'ඉවත් වන්න' : 'Sign Out'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <QuickLogFab
        lang={lang}
        user={user}
        dataset={dataset}
        onSaveRecord={handleSaveRecord}
      />
    </div>
  );
}
