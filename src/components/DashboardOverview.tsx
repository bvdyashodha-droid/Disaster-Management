import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  Cpu,
  FileSpreadsheet,
  Home,
  Lock,
  MapPin,
  PackageCheck,
  Radar as RadarIcon,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { isAdminRole, type DmisDataset, type Language, type ModuleKey, type UserRole } from '../types/dmis';
import { tLabel } from '../i18n/translations';

interface DashboardOverviewProps {
  lang: Language;
  userRole: UserRole;
  dataset: DmisDataset;
  pendingCount: number;
  deviceId: string;
  supabaseReady: boolean;
  onNavigate: (module: ModuleKey) => void;
}

const RELIEF_STAGE_COLORS: Record<string, string> = {
  Planned: '#64748B',
  Dispatched: '#F59E0B',
  Distributed: '#0EA5E9',
  Verified: '#10B981',
};

const DISPLACEMENT_META = [
  { key: 'Safety Centre', labelEn: 'Safety Centre', labelSi: 'ආරක්ෂිත මධ්‍යස්ථාන', color: '#EF4444' },
  { key: 'With Relatives', labelEn: 'With Relatives', labelSi: 'ඥාතීන් සමඟ', color: '#F59E0B' },
  { key: 'Relocated', labelEn: 'Relocated', labelSi: 'ප්‍රතිස්ථාපිත', color: '#0EA5E9' },
  { key: 'At Home', labelEn: 'At Home', labelSi: 'නිවසේම සිටින', color: '#10B981' },
] as const;

const DAMAGE_META = [
  { key: 'Fully Damaged', labelEn: 'Fully Damaged', labelSi: 'පූර්ණ හානි', color: '#EF4444' },
  { key: 'Partially Damaged - Severe', labelEn: 'Partial (Severe)', labelSi: 'අර්ධ හානි (දැඩි)', color: '#F59E0B' },
  { key: 'Partially Damaged - Minor', labelEn: 'Partial (Minor)', labelSi: 'අර්ධ හානි (සුළු)', color: '#0EA5E9' },
] as const;

const SEVERITY_ACCENT: Record<string, string> = {
  Critical: '#EF4444',
  High: '#F59E0B',
  Moderate: '#0EA5E9',
  Low: '#10B981',
};

function CornerBrackets() {
  return (
    <>
      <svg className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-sky-400/50" viewBox="0 0 16 16" fill="none">
        <path d="M1 7V1H7" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <svg className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-sky-400/50" viewBox="0 0 16 16" fill="none">
        <path d="M9 1H15V7" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <svg className="pointer-events-none absolute bottom-2.5 left-2.5 h-3.5 w-3.5 text-sky-400/50" viewBox="0 0 16 16" fill="none">
        <path d="M1 9V15H7" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <svg className="pointer-events-none absolute bottom-2.5 right-2.5 h-3.5 w-3.5 text-sky-400/50" viewBox="0 0 16 16" fill="none">
        <path d="M9 15H15V9" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </>
  );
}

function RadialGauge({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
      <svg className="h-11 w-11 -rotate-90" viewBox="0 0 44 44">
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="#1E293B"
          strokeWidth="3.5"
        />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute font-mono text-[10px] font-semibold text-slate-200 tabular-nums">
        {clamped}%
      </span>
    </div>
  );
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  lang,
  userRole,
  dataset,
  pendingCount,
  deviceId,
  supabaseReady,
  onNavigate,
}) => {
  const [reliefMetric, setReliefMetric] = useState<'count' | 'value_lkr'>('count');
  const [telemetryView, setTelemetryView] = useState<'displacement' | 'damage'>('displacement');
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const hasAdminAccess = isAdminRole(userRole);

  const allDisasters = dataset.disasters.filter((d) => !d.is_deleted);
  const activeDisasters = allDisasters.filter((d) => d.status !== 'Closed');
  const families = dataset.affected_families.filter((f) => !f.is_deleted);
  const persons = dataset.affected_persons.filter((p) => !p.is_deleted);
  const damages = dataset.house_damages.filter((h) => !h.is_deleted);
  const reliefs = dataset.relief_assistance.filter((r) => !r.is_deleted);

  const totalMembersCount = families.reduce((acc, f) => acc + Number(f.total_members || 0), 0);
  const totalReliefValue = reliefs.reduce((acc, r) => acc + Number(r.value_lkr || 0), 0);
  const fullyDamagedCount = damages.filter((d) => d.damage_level === 'Fully Damaged').length;
  const displacedFamiliesCount = families.filter((f) => f.displacement_status !== 'At Home').length;
  const verifiedReliefCount = reliefs.filter((r) => r.distribution_status === 'Verified').length;

  const districtChartData = useMemo(() => {
    const districts = dataset.districts.filter((d) => !d.is_deleted);
    const dsMap = new Map(
      dataset.divisional_secretariats.filter((d) => !d.is_deleted).map((d) => [d.id, d])
    );
    const gnMap = new Map(
      dataset.gn_divisions.filter((g) => !g.is_deleted).map((g) => [g.id, g])
    );
    const distMap = new Map(districts.map((d) => [d.id, d]));

    const counts = new Map<string, { district: string; families: number; persons: number }>();

    for (const fam of families) {
      let distId = fam.district_id ?? null;
      if (!distId && fam.ds_id) {
        distId = dsMap.get(fam.ds_id)?.district_id ?? null;
      }
      if (!distId && fam.gn_id) {
        const gn = gnMap.get(fam.gn_id);
        if (gn?.ds_id) {
          distId = dsMap.get(gn.ds_id)?.district_id ?? null;
        }
      }

      const distObj = distId ? distMap.get(distId) : undefined;
      const key = distObj ? distObj.id : 'unassigned';
      const label = distObj
        ? lang === 'si' && distObj.name_si
          ? distObj.name_si
          : distObj.name_en
        : lang === 'si'
          ? 'වෙන් නොකළ'
          : 'Unassigned';

      const current = counts.get(key) ?? { district: label, families: 0, persons: 0 };
      current.families += 1;
      current.persons += Number(fam.total_members || 0);
      counts.set(key, current);
    }

    return Array.from(counts.values()).sort((a, b) => b.families - a.families).slice(0, 10);
  }, [dataset.districts, dataset.divisional_secretariats, dataset.gn_divisions, families, lang]);

  const reliefChartData = useMemo(() => {
    const stages = ['Planned', 'Dispatched', 'Distributed', 'Verified'] as const;
    return stages.map((stage) => {
      const matching = reliefs.filter((r) => r.distribution_status === stage);
      const valueLkr = matching.reduce((sum, r) => sum + Number(r.value_lkr || 0), 0);
      return {
        stage,
        count: matching.length,
        value_lkr: valueLkr,
      };
    });
  }, [reliefs]);

  const segmentSeries = useMemo(() => {
    if (telemetryView === 'displacement') {
      const total = families.length;
      return DISPLACEMENT_META.map((item) => {
        const count = families.filter((f) => f.displacement_status === item.key).length;
        return {
          key: item.key,
          label: lang === 'si' ? item.labelSi : item.labelEn,
          count,
          pct: total > 0 ? Math.round((count / total) * 100) : 0,
          color: item.color,
        };
      });
    }
    const total = damages.length;
    return DAMAGE_META.map((item) => {
      const count = damages.filter((d) => d.damage_level === item.key).length;
      return {
        key: item.key,
        label: lang === 'si' ? item.labelSi : item.labelEn,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        color: item.color,
      };
    });
  }, [damages, families, lang, telemetryView]);

  const segmentTotal = segmentSeries.reduce((acc, s) => acc + s.count, 0);

  const severityRadarData = useMemo(() => {
    const levels: Array<{ key: 'Critical' | 'High' | 'Moderate' | 'Low'; labelEn: string; labelSi: string }> = [
      { key: 'Critical', labelEn: 'Critical', labelSi: 'තීරණාත්මක' },
      { key: 'High', labelEn: 'High', labelSi: 'ඉහළ' },
      { key: 'Moderate', labelEn: 'Moderate', labelSi: 'මධ්‍යම' },
      { key: 'Low', labelEn: 'Low', labelSi: 'අඩු' },
    ];
    return levels.map((lvl) => ({
      severity: lang === 'si' ? lvl.labelSi : lvl.labelEn,
      incidents: allDisasters.filter((d) => d.severity === lvl.key).length,
      active: activeDisasters.filter((d) => d.severity === lvl.key).length,
    }));
  }, [activeDisasters, allDisasters, lang]);

  const stageCounts = useMemo(() => {
    const stages = ['Active', 'Relief Phase', 'Monitoring', 'Closed'] as const;
    return stages.map((st) => ({
      stage: st,
      count: allDisasters.filter((d) => d.status === st).length,
    }));
  }, [allDisasters]);

  const kpis = [
    {
      label: lang === 'si' ? 'සක්‍රීය ආපදා' : 'Active Disasters',
      value: activeDisasters.length,
      sub:
        lang === 'si'
          ? `මුළු ආපදා ${allDisasters.length}`
          : `${allDisasters.length} total recorded`,
      pct: allDisasters.length > 0 ? (activeDisasters.length / allDisasters.length) * 100 : 0,
      ratioLabel: lang === 'si' ? 'සක්‍රීය අනුපාතය' : 'Active share',
      color: '#F59E0B',
      module: 'disasters' as ModuleKey,
      icon: AlertTriangle,
    },
    {
      label: lang === 'si' ? 'පීඩාවට පත් පවුල්' : 'Affected Families',
      value: families.length,
      sub:
        lang === 'si'
          ? `පුද්ගලයින් ${Math.max(persons.length, totalMembersCount)}`
          : `${Math.max(persons.length, totalMembersCount)} individuals`,
      pct: families.length > 0 ? (displacedFamiliesCount / families.length) * 100 : 0,
      ratioLabel: lang === 'si' ? 'අවතැන් අනුපාතය' : 'Displaced ratio',
      color: '#0EA5E9',
      module: 'affected_families' as ModuleKey,
      icon: Users,
    },
    {
      label: lang === 'si' ? 'නිවාස හානි තක්සේරු' : 'House Damages',
      value: damages.length,
      sub:
        lang === 'si'
          ? `පූර්ණ හානි ${fullyDamagedCount}`
          : `${fullyDamagedCount} fully damaged`,
      pct: damages.length > 0 ? (fullyDamagedCount / damages.length) * 100 : 0,
      ratioLabel: lang === 'si' ? 'පූර්ණ හානි අනුපාතය' : 'Severe loss ratio',
      color: '#EF4444',
      module: 'house_damages' as ModuleKey,
      icon: Home,
    },
    ...(hasAdminAccess
      ? [
          {
            label: lang === 'si' ? 'සහන ආධාර (රු.)' : 'Relief Distributed (LKR)',
            value: totalReliefValue.toLocaleString('en-LK'),
            sub: lang === 'si' ? `වවුචර් ${reliefs.length}` : `${reliefs.length} vouchers issued`,
            pct: reliefs.length > 0 ? (verifiedReliefCount / reliefs.length) * 100 : 0,
            ratioLabel: lang === 'si' ? 'තහවුරු කළ ප්‍රතිශතය' : 'Verified rate',
            color: '#10B981',
            module: 'relief_assistance' as ModuleKey,
            icon: PackageCheck,
          },
        ]
      : []),
  ];

  // Build SVG donut ring geometry for the Displacement / Damage schematic
  const donutSegments = useMemo(() => {
    const r = 52;
    const circ = 2 * Math.PI * r;
    if (segmentTotal === 0) return [];
    let accumulated = 0;
    return segmentSeries
      .filter((s) => s.count > 0)
      .map((s) => {
        const len = (s.count / segmentTotal) * circ;
        const gap = segmentSeries.filter((x) => x.count > 0).length > 1 ? 3 : 0;
        const dashLen = Math.max(0, len - gap);
        const offset = -accumulated;
        accumulated += len;
        return {
          ...s,
          circumference: circ,
          dashArray: `${dashLen} ${circ}`,
          dashOffset: offset,
        };
      });
  }, [segmentSeries, segmentTotal]);

  const activeSegmentObj = hoveredSegment
    ? segmentSeries.find((s) => s.key === hoveredSegment)
    : undefined;

  return (
    <div className="console-grid space-y-5 rounded-2xl border border-slate-800 bg-[#090F1A] p-4 text-slate-100 shadow-xl sm:p-6">
      {/* Command Header Panel */}
      <div className="relative flex flex-col gap-4 rounded-xl border border-slate-800 bg-[#0F172A]/95 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <CornerBrackets />
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-sky-400">
            <Cpu className="h-3.5 w-3.5" />
            <span>
              {lang === 'si' ? 'ස්වයංක්‍රීය මෙහෙයුම් පාලන මැදිරිය' : 'Command & Telemetry Interface'}
            </span>
          </div>
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-50 sm:text-2xl">
            {lang === 'si' ? 'මෙහෙයුම් සාරාංශ පුවරුව' : 'Operations & Field Readiness Console'}
          </h2>
          <p className="font-mono text-xs text-slate-400 tabular-nums">
            {lang === 'si'
              ? `උපාංගය: ${deviceId} · සමමුහුර්ත පෝලිම: ${pendingCount} · ${
                  supabaseReady ? 'Supabase PostgreSQL සක්‍රීයයි' : 'IndexedDB Offline ගබඩාව'
                }`
              : `Device: ${deviceId} · Sync queue: ${pendingCount} · ${
                  supabaseReady ? 'Supabase PostgreSQL active' : 'Offline-first IndexedDB storage active'
                }`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('affected_families')}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-400 whitespace-nowrap"
          >
            <span>{lang === 'si' ? 'පවුල් වාර්තා කරන්න' : 'Record Affected Family'}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('map')}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-500/60 hover:text-white whitespace-nowrap"
          >
            <MapPin className="h-3.5 w-3.5 text-sky-400" />
            <span>{lang === 'si' ? 'සිතියම බලන්න' : 'Open GIS Map'}</span>
          </button>
          {hasAdminAccess && (
            <button
              type="button"
              onClick={() => onNavigate('sync_center')}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-500/60 hover:text-white whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
              <span>{lang === 'si' ? 'සමමුහුර්ත හා උපස්ථ' : 'Sync, Merge & Backup'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Telemetry KPI Matrix with Live SVG Arc Gauges */}
      <div className={`grid gap-4 sm:grid-cols-2 ${hasAdminAccess ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <button
              key={kpi.label}
              type="button"
              onClick={() => onNavigate(kpi.module)}
              className="group relative flex flex-col justify-between rounded-xl border border-slate-800 bg-[#0F172A] p-5 text-left transition hover:border-sky-500/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                    <Icon className="h-3.5 w-3.5 text-slate-400 group-hover:text-sky-400" />
                    <span>{kpi.label}</span>
                  </div>
                  <div className="font-mono text-2xl font-bold tracking-tight text-slate-50 tabular-nums">
                    {kpi.value}
                  </div>
                </div>
                <RadialGauge pct={kpi.pct} color={kpi.color} />
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-400 tabular-nums">
                <span>{kpi.sub}</span>
                <span className="font-mono text-slate-500">{kpi.ratioLabel}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Robotic Graphical Telemetry Diagnostics Row */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Panel 1: Interactive SVG Donut & Vector Distribution Matrix */}
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0F172A] p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                {telemetryView === 'displacement'
                  ? lang === 'si'
                    ? 'අවතැන්වීම් තත්ත්ව රේඛා සටහන'
                    : 'Displacement Telemetry Schematic'
                  : lang === 'si'
                    ? 'නිවාස හානි මට්ටම් විශ්ලේෂණය'
                    : 'Structural Damage Telemetry'}
              </h3>
              <p className="text-xs text-slate-400">
                {telemetryView === 'displacement'
                  ? lang === 'si'
                    ? 'පවුල් රැඳී සිටින ස්ථාන අනුව සජීවී බෙදීම'
                    : 'Real-time family distribution across shelter states'
                  : lang === 'si'
                    ? 'නිවාස හානි තක්සේරු මට්ටම් අනුව බෙදීම'
                    : 'Assessed properties grouped by structural damage severity'}
              </p>
            </div>

            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setTelemetryView('displacement');
                  setHoveredSegment(null);
                }}
                className={`rounded-md px-2.5 py-1 font-semibold transition ${
                  telemetryView === 'displacement'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang === 'si' ? 'අවතැන්වීම්' : 'Displacement'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTelemetryView('damage');
                  setHoveredSegment(null);
                }}
                className={`rounded-md px-2.5 py-1 font-semibold transition ${
                  telemetryView === 'damage'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang === 'si' ? 'නිවාස හානි' : 'Damage'}
              </button>
            </div>
          </div>

          <div className="grid items-center gap-6 sm:grid-cols-12">
            {/* Precision SVG Multi-Arc Ring */}
            <div className="sm:col-span-5 flex flex-col items-center justify-center">
              <div className="relative flex h-44 w-44 items-center justify-center">
                <svg className="h-44 w-44 -rotate-90" viewBox="0 0 140 140">
                  {/* Outer coordinate reference ring */}
                  <circle
                    cx="70"
                    cy="70"
                    r="62"
                    fill="none"
                    stroke="#1E293B"
                    strokeWidth="1"
                    strokeDasharray="2 4"
                  />
                  {/* Base track */}
                  <circle
                    cx="70"
                    cy="70"
                    r="52"
                    fill="none"
                    stroke="#1E293B"
                    strokeWidth="11"
                  />
                  {donutSegments.map((seg) => {
                    const isFocused = hoveredSegment === seg.key;
                    return (
                      <circle
                        key={seg.key}
                        cx="70"
                        cy="70"
                        r="52"
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={isFocused ? 14 : 11}
                        strokeDasharray={seg.dashArray}
                        strokeDashoffset={seg.dashOffset}
                        className="cursor-pointer transition-all duration-200"
                        onMouseEnter={() => setHoveredSegment(seg.key)}
                        onMouseLeave={() => setHoveredSegment(null)}
                        onClick={() =>
                          onNavigate(telemetryView === 'displacement' ? 'affected_families' : 'house_damages')
                        }
                      />
                    );
                  })}
                  {/* Inner instrument ring */}
                  <circle
                    cx="70"
                    cy="70"
                    r="38"
                    fill="none"
                    stroke="#1E293B"
                    strokeWidth="1"
                  />
                </svg>

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                  <span className="font-mono text-2xl font-bold text-slate-50 tabular-nums">
                    {activeSegmentObj ? activeSegmentObj.count : segmentTotal}
                  </span>
                  <span className="mt-0.5 text-[11px] font-medium text-slate-400 leading-tight max-w-[96px] truncate">
                    {activeSegmentObj
                      ? activeSegmentObj.label
                      : telemetryView === 'displacement'
                        ? lang === 'si'
                          ? 'මුළු පවුල්'
                          : 'Total Families'
                        : lang === 'si'
                          ? 'මුළු තක්සේරු'
                          : 'Assessments'}
                  </span>
                  {activeSegmentObj && (
                    <span className="font-mono text-[10px] text-sky-400 tabular-nums">
                      {activeSegmentObj.pct}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Segment Telemetry Vector Bars */}
            <div className="sm:col-span-7 space-y-3">
              {segmentSeries.map((item) => {
                const isFocused = hoveredSegment === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onMouseEnter={() => setHoveredSegment(item.key)}
                    onMouseLeave={() => setHoveredSegment(null)}
                    onClick={() =>
                      onNavigate(telemetryView === 'displacement' ? 'affected_families' : 'house_damages')
                    }
                    className={`w-full rounded-lg border p-2.5 text-left transition ${
                      isFocused
                        ? 'border-sky-500/60 bg-slate-900/90'
                        : 'border-slate-800/80 bg-slate-950/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-medium text-slate-200">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-xs"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.label}
                      </span>
                      <span className="font-mono text-slate-300 tabular-nums">
                        {item.count} <span className="text-slate-500">({item.pct}%)</span>
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${item.pct}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Panel 2: Disaster Severity Radar Profile (Recharts RadarChart) */}
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0F172A] p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                {lang === 'si' ? 'ආපදා බරපතලකම රේඩාර් පැතිකඩ' : 'Incident Severity Radar'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'si'
                  ? 'මුළු සහ සක්‍රීය ආපදා බෙදීම'
                  : 'Recorded vs active incidents by severity level'}
              </p>
            </div>
            <RadarIcon className="h-4 w-4 text-sky-400" />
          </div>

          {allDisasters.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center px-4">
              <RadarIcon className="h-8 w-8 text-slate-700" />
              <p className="mt-2 text-xs font-semibold text-slate-300">
                {lang === 'si' ? 'ආපදා දත්ත තවම නොමැත' : 'No Disaster Vector Data Yet'}
              </p>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                {lang === 'si'
                  ? 'ආපදා වාර්තා එක් කළ පසු බරපතලකම රේඩාර් පැතිකඩ ස්වයංක්‍රීයව දිස්වේ.'
                  : 'Log disaster events to render the live severity polar radar.'}
              </p>
            </div>
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="72%" data={severityRadarData}>
                  <PolarGrid stroke="#1E293B" />
                  <PolarAngleAxis
                    dataKey="severity"
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                  />
                  <PolarRadiusAxis
                    allowDecimals={false}
                    tick={{ fill: '#64748B', fontSize: 10 }}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                  <Radar
                    name={lang === 'si' ? 'මුළු ආපදා' : 'Total'}
                    dataKey="incidents"
                    stroke="#38BDF8"
                    fill="#0EA5E9"
                    fillOpacity={0.25}
                  />
                  <Radar
                    name={lang === 'si' ? 'සක්‍රීය' : 'Active'}
                    dataKey="active"
                    stroke="#F59E0B"
                    fill="#F59E0B"
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2 border-t border-slate-800 pt-3 text-center">
            {stageCounts.map((st) => (
              <div key={st.stage} className="rounded-lg bg-slate-950/70 px-2 py-1.5">
                <div className="font-mono text-sm font-bold text-slate-100 tabular-nums">
                  {st.count}
                </div>
                <div className="truncate text-[10px] text-slate-400">{st.stage}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Recharts Statistical Telemetry Charts */}
      <div className={`grid gap-5 ${hasAdminAccess ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
        {/* Chart 1: Affected Families per District */}
        <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                {lang === 'si' ? 'දිස්ත්‍රික්ක අනුව පීඩාවට පත් පවුල්' : 'District Impact Telemetry'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'si'
                  ? 'පවුල් සහ මුළු සාමාජික සංඛ්‍යාව'
                  : 'Affected families and household members by district'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('affected_families')}
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 whitespace-nowrap"
            >
              {lang === 'si' ? 'විස්තර' : 'View All'}
            </button>
          </div>

          {districtChartData.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center px-4">
              <BarChart3 className="h-8 w-8 text-slate-700" />
              <p className="mt-2 text-xs font-semibold text-slate-300">
                {lang === 'si' ? 'පවුල් දත්ත තවම නොමැත' : 'No Affected Family Data Yet'}
              </p>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                {lang === 'si'
                  ? 'පීඩාවට පත් පවුල් ඇතුළත් කළ පසු මෙම ප්‍රස්තාරය ස්වයංක්‍රීයව යාවත්කාලීන වේ.'
                  : 'Add affected family records to visualize district-level distribution here.'}
              </p>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={districtChartData} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                  <defs>
                    <linearGradient id="dmisFamiliesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#0284C7" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="dmisMembersGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2DD4BF" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#0D9488" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis
                    dataKey="district"
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    tickLine={false}
                    axisLine={{ stroke: '#334155' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', color: '#CBD5E1' }} />
                  <Bar
                    dataKey="families"
                    name={lang === 'si' ? 'පවුල්' : 'Families'}
                    fill="url(#dmisFamiliesGrad)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="persons"
                    name={lang === 'si' ? 'සාමාජිකයින්' : 'Members'}
                    fill="url(#dmisMembersGrad)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 2: Relief Distribution Progress (Admin & Super Admin Only) */}
        {hasAdminAccess && (
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  {lang === 'si' ? 'සහන ආධාර බෙදාහැරීමේ ප්‍රගතිය' : 'Relief Distribution Pipeline'}
                </h3>
                <p className="text-xs text-slate-400">
                  {lang === 'si'
                    ? 'අදියර අනුව වවුචර් සහ මුළු වටිනාකම'
                    : 'Live progression across Planned, Dispatched, Distributed & Verified stages'}
                </p>
              </div>

              <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setReliefMetric('count')}
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    reliefMetric === 'count'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {lang === 'si' ? 'වවුචර්' : 'Vouchers'}
                </button>
                <button
                  type="button"
                  onClick={() => setReliefMetric('value_lkr')}
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    reliefMetric === 'value_lkr'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  LKR
                </button>
              </div>
            </div>

            {reliefs.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center px-4">
                <PackageCheck className="h-8 w-8 text-slate-700" />
                <p className="mt-2 text-xs font-semibold text-slate-300">
                  {lang === 'si' ? 'සහන වවුචර් තවම නොමැත' : 'No Relief Distribution Data Yet'}
                </p>
                <p className="mt-1 text-xs text-slate-500 max-w-xs">
                  {lang === 'si'
                    ? 'සහන ආධාර වාර්තා ඇතුළත් කළ පසු ප්‍රගතිය මෙහි දිස්වේ.'
                    : 'Log relief assistance vouchers to track stage-by-stage distribution progress.'}
                </p>
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reliefChartData} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                    <XAxis
                      dataKey="stage"
                      tick={{ fontSize: 11, fill: '#94A3B8' }}
                      tickLine={false}
                      axisLine={{ stroke: '#334155' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#94A3B8' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(val) =>
                        reliefMetric === 'value_lkr'
                          ? [`LKR ${Number(val ?? 0).toLocaleString('en-LK')}`, 'Value']
                          : [Number(val ?? 0), 'Vouchers']
                      }
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        color: '#F8FAFC',
                        fontSize: '12px',
                      }}
                    />
                    <Bar
                      dataKey={reliefMetric}
                      name={reliefMetric === 'value_lkr' ? 'Value (LKR)' : 'Vouchers'}
                      radius={[4, 4, 0, 0]}
                    >
                      {reliefChartData.map((entry) => (
                        <Cell key={entry.stage} fill={RELIEF_STAGE_COLORS[entry.stage] ?? '#0EA5E9'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Administrative Division Coverage + Active Incidents & Safeguards */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0F172A] p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              {lang === 'si' ? 'පරිපාලන කලාප සහ වත්මන් ආපදා' : 'Active Disaster Incidents & Administrative Grid'}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('disasters')}
              className="text-xs font-semibold text-sky-400 hover:text-sky-300"
            >
              {lang === 'si' ? 'සියල්ල බලන්න' : 'Open Module'}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 border-b border-slate-800 pb-4 text-center">
            <button
              type="button"
              disabled={!hasAdminAccess}
              onClick={() => hasAdminAccess && onNavigate('districts')}
              className={`rounded-lg border border-slate-800 bg-slate-950/70 p-3 transition ${
                hasAdminAccess ? 'hover:border-sky-500/50' : 'cursor-default opacity-75'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 font-mono text-lg font-bold text-slate-100 tabular-nums">
                {dataset.districts.filter((d) => !d.is_deleted).length}
                {!hasAdminAccess && <Lock className="h-3 w-3 text-slate-500" />}
              </div>
              <div className="text-xs text-slate-400">{lang === 'si' ? 'දිස්ත්‍රික්ක' : 'Districts'}</div>
            </button>
            <button
              type="button"
              disabled={!hasAdminAccess}
              onClick={() => hasAdminAccess && onNavigate('divisional_secretariats')}
              className={`rounded-lg border border-slate-800 bg-slate-950/70 p-3 transition ${
                hasAdminAccess ? 'hover:border-sky-500/50' : 'cursor-default opacity-75'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 font-mono text-lg font-bold text-slate-100 tabular-nums">
                {dataset.divisional_secretariats.filter((d) => !d.is_deleted).length}
                {!hasAdminAccess && <Lock className="h-3 w-3 text-slate-500" />}
              </div>
              <div className="text-xs text-slate-400">{lang === 'si' ? 'ප්‍රා.ලේ. කොට්ඨාස' : 'DS Divisions'}</div>
            </button>
            <button
              type="button"
              disabled={!hasAdminAccess}
              onClick={() => hasAdminAccess && onNavigate('gn_divisions')}
              className={`rounded-lg border border-slate-800 bg-slate-950/70 p-3 transition ${
                hasAdminAccess ? 'hover:border-sky-500/50' : 'cursor-default opacity-75'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 font-mono text-lg font-bold text-slate-100 tabular-nums">
                {dataset.gn_divisions.filter((d) => !d.is_deleted).length}
                {!hasAdminAccess && <Lock className="h-3 w-3 text-slate-500" />}
              </div>
              <div className="text-xs text-slate-400">{lang === 'si' ? 'ග්‍රා.නි. වසම්' : 'GN Divisions'}</div>
            </button>
          </div>

          {activeDisasters.length === 0 ? (
            <div className="py-8 text-center">
              <Building2 className="mx-auto h-8 w-8 text-slate-700" />
              <p className="mt-2 text-sm font-medium text-slate-300">{tLabel(lang, 'noRecordsTitle')}</p>
              <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">{tLabel(lang, 'noRecordsBody')}</p>
            </div>
          ) : (
            <div className="mt-3 divide-y divide-slate-800/80">
              {activeDisasters.slice(0, 5).map((dis) => {
                const barColor = SEVERITY_ACCENT[dis.severity] ?? '#0EA5E9';
                return (
                  <div key={dis.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div className="flex min-w-0 items-center gap-3 pr-3">
                      <span
                        className="h-7 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: barColor }}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-100 truncate">{dis.title}</p>
                        <p className="font-mono text-xs text-slate-400">
                          {dis.disaster_code} · {dis.disaster_type} · {dis.start_date}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-slate-300 whitespace-nowrap">
                      {dis.severity} / {dis.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 sm:p-6 space-y-3">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="h-5 w-5 text-sky-400" />
              <h3 className="font-display text-sm font-semibold text-slate-100">
                {tLabel(lang, 'accessNoticeTitle')}
              </h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">{tLabel(lang, 'accessNoticeBody')}</p>
            <div className="pt-1 flex flex-wrap gap-2">
              {hasAdminAccess && (
                <button
                  type="button"
                  onClick={() => onNavigate('sync_center')}
                  className="inline-flex min-h-[38px] items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-500/50 hover:text-white"
                >
                  {lang === 'si' ? 'Supabase හා Access සැකසුම්' : 'Open Migration & Supabase Guide'}
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="inline-flex min-h-[38px] items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-500/50 hover:text-white"
              >
                {lang === 'si' ? 'PDF වාර්තා' : 'Printable PDF Reports'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 sm:p-6 space-y-2.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <h3 className="font-display text-sm font-semibold text-slate-100">
                {lang === 'si' ? 'දත්ත ආරක්ෂණ සහතිකය' : 'Data Integrity Safeguards'}
              </h3>
            </div>
            <ul className="space-y-1.5 text-xs text-slate-400">
              <li>1. Every record carries a unique UUID across phones and Supabase.</li>
              <li>2. Duplicate codes, NICs, and voucher numbers are flagged before saving.</li>
              <li>3. Multi-phone merges pause for side-by-side conflict resolution.</li>
              <li>4. Original records are archived into snapshots prior to any overwrite.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
