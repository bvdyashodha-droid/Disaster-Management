import React, { useMemo, useState } from 'react';
import { Download, FileText, Printer } from 'lucide-react';
import { isAdminRole, type AuthUser, type DmisDataset, type Language } from '../types/dmis';
import { exportRowsToCsv } from '../lib/csvJson';
import { tLabel } from '../i18n/translations';
import { FamilyAssessmentSheet } from './FamilyAssessmentDossier';

interface ReportsModuleProps {
  lang: Language;
  dataset: DmisDataset;
  user: AuthUser;
}

export const ReportsModule: React.FC<ReportsModuleProps> = ({ lang, dataset, user }) => {
  const hasAdminAccess = isAdminRole(user.role);
  const [reportMode, setReportMode] = useState<'summary' | 'family'>('summary');
  const [selectedFamilyId, setSelectedFamilyId] = useState('');
  const [selectedDisasterId, setSelectedDisasterId] = useState('');
  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const disasters = dataset.disasters.filter((d) => !d.is_deleted);
  const districts = dataset.districts.filter((d) => !d.is_deleted);
  const dsList = dataset.divisional_secretariats.filter((d) => !d.is_deleted);
  const gnList = dataset.gn_divisions.filter((g) => !g.is_deleted);
  const allFamilies = useMemo(
    () => dataset.affected_families.filter((f) => !f.is_deleted),
    [dataset.affected_families]
  );
  const selectedFamily = useMemo(
    () => allFamilies.find((f) => f.id === selectedFamilyId) ?? allFamilies[0] ?? null,
    [allFamilies, selectedFamilyId]
  );

  const filteredFamilies = useMemo(() => {
    return dataset.affected_families.filter((f) => {
      if (f.is_deleted) return false;
      if (selectedDisasterId && f.disaster_id !== selectedDisasterId) return false;
      if (selectedDistrictId && f.district_id !== selectedDistrictId) return false;
      return true;
    });
  }, [dataset.affected_families, selectedDisasterId, selectedDistrictId]);

  const familyIds = useMemo(() => new Set(filteredFamilies.map((f) => f.id)), [filteredFamilies]);

  const filteredPersons = useMemo(
    () => dataset.affected_persons.filter((p) => !p.is_deleted && familyIds.has(p.family_id)),
    [dataset.affected_persons, familyIds]
  );

  const filteredDamages = useMemo(() => {
    return dataset.house_damages.filter((h) => {
      if (h.is_deleted) return false;
      if (selectedDisasterId && h.disaster_id !== selectedDisasterId) return false;
      if (selectedDistrictId && !familyIds.has(h.family_id)) return false;
      if (dateFrom && h.inspection_date < dateFrom) return false;
      if (dateTo && h.inspection_date > dateTo) return false;
      return true;
    });
  }, [dataset.house_damages, selectedDisasterId, selectedDistrictId, familyIds, dateFrom, dateTo]);

  const filteredRelief = useMemo(() => {
    return dataset.relief_assistance.filter((r) => {
      if (r.is_deleted) return false;
      if (selectedDisasterId && r.disaster_id !== selectedDisasterId) return false;
      if (selectedDistrictId && !familyIds.has(r.family_id)) return false;
      if (dateFrom && r.distributed_date < dateFrom) return false;
      if (dateTo && r.distributed_date > dateTo) return false;
      return true;
    });
  }, [dataset.relief_assistance, selectedDisasterId, selectedDistrictId, familyIds, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const membersSum = filteredFamilies.reduce((a, f) => a + Number(f.total_members || 0), 0);
    const damageLossLkr = filteredDamages.reduce((a, d) => a + Number(d.estimated_loss_lkr || 0), 0);
    const reliefValueLkr = filteredRelief.reduce((a, r) => a + Number(r.value_lkr || 0), 0);
    const fullyDamaged = filteredDamages.filter((d) => d.damage_level === 'Fully Damaged').length;
    const severePartial = filteredDamages.filter((d) => d.damage_level === 'Partially Damaged - Severe').length;
    const minorPartial = filteredDamages.filter((d) => d.damage_level === 'Partially Damaged - Minor').length;
    return {
      families: filteredFamilies.length,
      persons: Math.max(filteredPersons.length, membersSum),
      damages: filteredDamages.length,
      fullyDamaged,
      severePartial,
      minorPartial,
      damageLossLkr,
      reliefCount: filteredRelief.length,
      reliefValueLkr,
    };
  }, [filteredFamilies, filteredPersons, filteredDamages, filteredRelief]);

  const divisionBreakdown = useMemo(() => {
    const gnMap = new Map(gnList.map((g) => [g.id, g]));
    const dsMap = new Map(dsList.map((d) => [d.id, d]));
    const rows = new Map<
      string,
      { label: string; families: number; persons: number; damages: number; reliefLkr: number }
    >();

    for (const fam of filteredFamilies) {
      const gn = fam.gn_id ? gnMap.get(fam.gn_id) : undefined;
      const ds = fam.ds_id ? dsMap.get(fam.ds_id) : gn ? dsMap.get(gn.ds_id) : undefined;
      const key = gn?.id ?? ds?.id ?? 'unassigned';
      const label = gn
        ? `${gn.name_en}${ds ? ` (${ds.name_en})` : ''}`
        : ds
          ? ds.name_en
          : 'Unassigned Division';
      const cur = rows.get(key) ?? { label, families: 0, persons: 0, damages: 0, reliefLkr: 0 };
      cur.families += 1;
      cur.persons += Number(fam.total_members || 0);
      rows.set(key, cur);
    }

    for (const dmg of filteredDamages) {
      const fam = filteredFamilies.find((f) => f.id === dmg.family_id);
      const gnId = dmg.gn_id ?? fam?.gn_id ?? 'unassigned';
      const cur = rows.get(gnId);
      if (cur) cur.damages += 1;
    }

    for (const rel of filteredRelief) {
      const fam = filteredFamilies.find((f) => f.id === rel.family_id);
      const gnId = rel.gn_id ?? fam?.gn_id ?? 'unassigned';
      const cur = rows.get(gnId);
      if (cur) cur.reliefLkr += Number(rel.value_lkr || 0);
    }

    return Array.from(rows.values()).sort((a, b) => b.families - a.families);
  }, [filteredFamilies, filteredDamages, filteredRelief, gnList, dsList]);

  const reliefByType = useMemo(() => {
    const map = new Map<string, { type: string; count: number; valueLkr: number }>();
    for (const r of filteredRelief) {
      const cur = map.get(r.assistance_type) ?? { type: r.assistance_type, count: 0, valueLkr: 0 };
      cur.count += 1;
      cur.valueLkr += Number(r.value_lkr || 0);
      map.set(r.assistance_type, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.valueLkr - a.valueLkr);
  }, [filteredRelief]);

  const maxDamageBar = Math.max(1, totals.fullyDamaged, totals.severePartial, totals.minorPartial);

  return (
    <div className="space-y-6">
      {/* Screen Filter Bar (hidden when printing PDF) */}
      <div className="no-print rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {lang === 'si' ? 'වාර්තා සහ සංඛ්‍යාලේඛන' : 'Official Reports & Statistical Summary'}
            </h2>
            <p className="text-xs text-slate-500">
              {lang === 'si'
                ? 'සැබෑ දත්ත මත පදනම්ව ගණනය කළ සාරාංශ සහ මුද්‍රණය කළ හැකි PDF වාර්තා'
                : 'Live aggregates computed from verified records with A4 printable PDF layout'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setReportMode('summary')}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${
                  reportMode === 'summary' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {lang === 'si' ? 'සාරාංශ වාර්තාව' : 'Situation Summary'}
              </button>
              <button
                type="button"
                onClick={() => setReportMode('family')}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${
                  reportMode === 'family' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {lang === 'si' ? 'පවුල් තක්සේරු PDF' : 'Family Assessment PDF'}
              </button>
            </div>
            {reportMode === 'summary' && (
              <button
                type="button"
                onClick={() => exportRowsToCsv(`dmis-summary-${new Date().toISOString().slice(0, 10)}.csv`, divisionBreakdown)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{tLabel(lang, 'exportCsv')}</span>
              </button>
            )}
            <button
              type="button"
              disabled={reportMode === 'family' && !selectedFamily}
              onClick={() => {
                const prevTitle = document.title;
                if (reportMode === 'family' && selectedFamily) {
                  document.title = `DMIS-Family-Assessment-${selectedFamily.family_ref_no || selectedFamily.id.slice(0, 8)}`;
                }
                window.print();
                setTimeout(() => {
                  document.title = prevTitle;
                }, 500);
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1A3B66] disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              <span>{reportMode === 'family' ? (lang === 'si' ? 'පවුල් PDF සුරකින්න' : 'Generate PDF') : tLabel(lang, 'printPdf')}</span>
            </button>
          </div>
        </div>

        {reportMode === 'family' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'si' ? 'පවුල තෝරන්න' : 'Select Affected Family Record'}
              </label>
              <select
                value={selectedFamily?.id ?? ''}
                onChange={(e) => setSelectedFamilyId(e.target.value)}
                className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
              >
                {allFamilies.length === 0 ? (
                  <option value="">{lang === 'si' ? 'පවුල් වාර්තා නොමැත' : 'No affected family records available'}</option>
                ) : (
                  allFamilies.map((fam) => (
                    <option key={fam.id} value={fam.id}>
                      {fam.family_ref_no} — {fam.head_name} ({fam.head_nic || 'No NIC'})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            value={selectedDisasterId}
            onChange={(e) => setSelectedDisasterId(e.target.value)}
            className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
          >
            <option value="">{lang === 'si' ? 'සියලු ආපදා' : 'All Disasters'}</option>
            {disasters.map((d) => (
              <option key={d.id} value={d.id}>
                {d.disaster_code} — {d.title}
              </option>
            ))}
          </select>

          <select
            value={selectedDistrictId}
            onChange={(e) => setSelectedDistrictId(e.target.value)}
            className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
          >
            <option value="">{lang === 'si' ? 'සියලු දිස්ත්‍රික්ක' : 'All Districts'}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {lang === 'si' && d.name_si ? d.name_si : d.name_en}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Date From"
            className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-xs text-slate-700"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Date To"
            className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-xs text-slate-700"
          />
        </div>
        )}
      </div>

      {reportMode === 'family' ? (
        selectedFamily ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 print:border-0 print:p-0">
            <FamilyAssessmentSheet family={selectedFamily} dataset={dataset} user={user} lang={lang} />
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-2">
            <FileText className="mx-auto h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-800">{tLabel(lang, 'noRecordsTitle')}</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {lang === 'si'
                ? 'තනි පවුල් තක්සේරු PDF වාර්තාවක් සෑදීමට පළමුව පීඩාවට පත් පවුලක් ඇතුළත් කරන්න.'
                : 'Add at least one Affected Family record to generate an individual government assessment PDF.'}
            </p>
          </div>
        )
      ) : (
      /* Printable Official Report Document */
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6 print:border-0 print:p-0">
        <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500">
              DISASTER MANAGEMENT INFORMATION SYSTEM · OFFICIAL SITUATION REPORT
            </p>
            <h3 className="text-xl font-bold text-slate-900 mt-1">
              {lang === 'si' ? 'ආපදා බලපෑම් හා සහන සේවා සාරාංශ වාර්තාව' : 'Disaster Impact & Relief Distribution Report'}
            </h3>
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums sm:text-right">
            <div>Generated: {new Date().toLocaleString()}</div>
            <div>Prepared by: {user.full_name} ({user.role})</div>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className={`grid grid-cols-2 gap-4 ${hasAdminAccess ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} print-break-inside-avoid`}>
          <div className="rounded-lg border border-slate-200 p-3.5">
            <div className="text-xs text-slate-500">{lang === 'si' ? 'පීඩාවට පත් පවුල්' : 'Affected Families'}</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">{totals.families}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3.5">
            <div className="text-xs text-slate-500">{lang === 'si' ? 'පුද්ගලයින්' : 'Affected Persons'}</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">{totals.persons}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3.5">
            <div className="text-xs text-slate-500">{lang === 'si' ? 'නිවාස හානි (රු.)' : 'House Damage Loss (LKR)'}</div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
              {totals.damageLossLkr.toLocaleString('en-LK')}
            </div>
          </div>
          {hasAdminAccess && (
            <div className="rounded-lg border border-slate-200 p-3.5">
              <div className="text-xs text-slate-500">{lang === 'si' ? 'සහන වටිනාකම (රු.)' : 'Total Relief (LKR)'}</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                {totals.reliefValueLkr.toLocaleString('en-LK')}
              </div>
            </div>
          )}
        </div>

        {/* House Damage & Relief Breakdowns */}
        <div className="grid gap-6 md:grid-cols-2 print-break-inside-avoid">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
              {lang === 'si' ? 'නිවාස හානි වර්ගීකරණය' : 'House Damage Classification'}
            </h4>
            {[
              { label: 'Fully Damaged', count: totals.fullyDamaged, color: 'bg-red-700' },
              { label: 'Partially Damaged - Severe', count: totals.severePartial, color: 'bg-amber-600' },
              { label: 'Partially Damaged - Minor', count: totals.minorPartial, color: 'bg-slate-600' },
            ].map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-700">{item.label}</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">{item.count}</span>
                </div>
                <div className="h-2.5 w-full rounded bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full ${item.color}`}
                    style={{ width: `${Math.round((item.count / maxDamageBar) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {hasAdminAccess && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
                {lang === 'si' ? 'සහන ආධාර වර්ග අනුව' : 'Relief Assistance by Type'}
              </h4>
              {reliefByType.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">No relief vouchers recorded for the selected filters.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-1.5 text-left">Assistance Type</th>
                      <th className="py-1.5 text-right">Vouchers</th>
                      <th className="py-1.5 text-right">Value (LKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reliefByType.map((row) => (
                      <tr key={row.type}>
                        <td className="py-1.5 font-medium text-slate-800">{row.type}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{row.count}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {row.valueLkr.toLocaleString('en-LK')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Division-wise Breakdown Table */}
        <div className="space-y-3 print-break-inside-avoid">
          <h4 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
            {lang === 'si' ? 'ග්‍රාම නිලධාරී වසම් අනුව බලපෑම' : 'Division-Wise Impact Summary'}
          </h4>
          {divisionBreakdown.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No division impact records available for the selected criteria.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">GN / DS Division</th>
                    <th className="px-3 py-2 text-right">Families</th>
                    <th className="px-3 py-2 text-right">Persons</th>
                    <th className="px-3 py-2 text-right">House Damages</th>
                    {hasAdminAccess && <th className="px-3 py-2 text-right">Relief Value (LKR)</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {divisionBreakdown.map((row) => (
                    <tr key={row.label}>
                      <td className="px-3 py-2 font-medium text-slate-900">{row.label}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{row.families}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{row.persons}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{row.damages}</td>
                      {hasAdminAccess && (
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {row.reliefLkr.toLocaleString('en-LK')}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Official Signature Blocks for Print */}
        <div className="grid grid-cols-3 gap-6 pt-10 text-xs text-slate-600 print-break-inside-avoid">
          <div className="border-t border-slate-400 pt-2">
            <p className="font-semibold text-slate-800">Grama Niladhari / Field Officer</p>
            <p>Date & Official Stamp</p>
          </div>
          <div className="border-t border-slate-400 pt-2">
            <p className="font-semibold text-slate-800">Divisional Secretary</p>
            <p>Certification & Seal</p>
          </div>
          <div className="border-t border-slate-400 pt-2">
            <p className="font-semibold text-slate-800">District Disaster Coordinator</p>
            <p>Verification & Approval</p>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
