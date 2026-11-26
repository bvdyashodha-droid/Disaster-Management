import React, { useEffect, useMemo } from 'react';
import { Printer, Shield, X } from 'lucide-react';
import {
  isAdminRole,
  type AffectedFamily,
  type AuthUser,
  type DmisDataset,
  type Language,
} from '../types/dmis';

interface FamilyAssessmentSheetProps {
  family: AffectedFamily;
  dataset: DmisDataset;
  user: AuthUser;
  lang: Language;
}

export const FamilyAssessmentSheet: React.FC<FamilyAssessmentSheetProps> = ({
  family,
  dataset,
  user,
  lang,
}) => {
  const hasAdminAccess = isAdminRole(user.role);

  const resolved = useMemo(() => {
    const disaster = dataset.disasters.find((d) => !d.is_deleted && d.id === family.disaster_id);
    const gn = family.gn_id
      ? dataset.gn_divisions.find((g) => !g.is_deleted && g.id === family.gn_id)
      : undefined;
    const dsId = family.ds_id ?? gn?.ds_id ?? null;
    const ds = dsId
      ? dataset.divisional_secretariats.find((d) => !d.is_deleted && d.id === dsId)
      : undefined;
    const districtId = family.district_id ?? ds?.district_id ?? null;
    const district = districtId
      ? dataset.districts.find((d) => !d.is_deleted && d.id === districtId)
      : undefined;

    const persons = dataset.affected_persons.filter(
      (p) => !p.is_deleted && p.family_id === family.id
    );
    const damages = dataset.house_damages.filter(
      (h) => !h.is_deleted && h.family_id === family.id
    );
    const reliefs = hasAdminAccess
      ? dataset.relief_assistance.filter((r) => !r.is_deleted && r.family_id === family.id)
      : [];

    const totalEstimatedLoss = damages.reduce(
      (sum, d) => sum + Number(d.estimated_loss_lkr || 0),
      0
    );
    const totalReliefValue = reliefs.reduce((sum, r) => sum + Number(r.value_lkr || 0), 0);

    return {
      disaster,
      gn,
      ds,
      district,
      persons,
      damages,
      reliefs,
      totalEstimatedLoss,
      totalReliefValue,
    };
  }, [dataset, family, hasAdminAccess]);

  const divisionLabel = (
    item: { name_en: string; name_si: string } | undefined,
    extra?: string
  ) => {
    if (!item) return '—';
    const base = lang === 'si' && item.name_si ? `${item.name_si} (${item.name_en})` : item.name_en;
    return extra ? `${extra} · ${base}` : base;
  };

  return (
    <article className="bg-white text-slate-900 space-y-5 text-xs leading-relaxed">
      {/* Official Letterhead */}
      <header className="border-b-2 border-slate-900 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 bg-slate-50 text-slate-900">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                {lang === 'si'
                  ? 'ආපදා කළමනාකරණ තොරතුරු පද්ධතිය · නිල ක්ෂේත්‍ර තක්සේරු වාර්තාව'
                  : 'DISASTER MANAGEMENT INFORMATION SYSTEM · OFFICIAL GOVERNMENT SUBMISSION'}
              </p>
              <h1 className="mt-0.5 text-lg font-bold tracking-tight text-slate-950">
                {lang === 'si'
                  ? 'පීඩාවට පත් පවුල් තක්සේරු හා සහන ආධාර වාර්තාව'
                  : 'Individual Family Disaster Assessment & Relief Dossier'}
              </h1>
              <p className="text-[11px] text-slate-600">
                {resolved.disaster
                  ? `${resolved.disaster.disaster_code} — ${resolved.disaster.title} (${resolved.disaster.disaster_type}, ${resolved.disaster.severity})`
                  : lang === 'si'
                    ? 'ආපදා සිදුවීම සම්බන්ධ කර නැත'
                    : 'No disaster event linked'}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-[11px] tabular-nums sm:text-right shrink-0">
            <div className="font-bold text-slate-950">REF: {family.family_ref_no}</div>
            <div className="text-slate-600">
              {lang === 'si' ? 'සකස් කළේ' : 'Prepared'}: {new Date().toLocaleDateString('en-LK')}
            </div>
            <div className="text-slate-600">
              {user.full_name} ({user.designation || user.role})
            </div>
          </div>
        </div>
      </header>

      {/* Section 1: Administrative Jurisdiction & Household Profile */}
      <section className="space-y-2 print-break-inside-avoid">
        <h2 className="border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wider text-slate-800">
          {lang === 'si'
            ? '1. පරිපාලන කලාපය සහ පවුලේ මූලික තොරතුරු'
            : '1. Administrative Jurisdiction & Household Profile'}
        </h2>

        <table className="w-full border-collapse border border-slate-300 text-xs">
          <tbody>
            <tr>
              <th className="w-1/4 border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                {lang === 'si' ? 'දිස්ත්‍රික්කය' : 'District'}
              </th>
              <td className="w-1/4 border border-slate-300 px-2.5 py-1.5 text-slate-900">
                {divisionLabel(resolved.district)}
              </td>
              <th className="w-1/4 border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                {lang === 'si' ? 'ප්‍රාදේශීය ලේකම් කොට්ඨාසය' : 'Divisional Secretariat'}
              </th>
              <td className="w-1/4 border border-slate-300 px-2.5 py-1.5 text-slate-900">
                {divisionLabel(resolved.ds)}
              </td>
            </tr>
            <tr>
              <th className="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                {lang === 'si' ? 'ග්‍රාම නිලධාරී වසම' : 'GN Division'}
              </th>
              <td className="border border-slate-300 px-2.5 py-1.5 text-slate-900">
                {divisionLabel(resolved.gn, resolved.gn?.gn_number)}
              </td>
              <th className="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                {lang === 'si' ? 'අවතැන් තත්ත්වය' : 'Displacement Status'}
              </th>
              <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-900">
                {family.displacement_status}
              </td>
            </tr>
            <tr>
              <th className="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                {lang === 'si' ? 'ගෘහ මූලිකයාගේ නම' : 'Head of Household'}
              </th>
              <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-950">
                {family.head_name}
              </td>
              <th className="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                {lang === 'si' ? 'ජාතික හැඳුනුම්පත් අංකය' : 'Head NIC Number'}
              </th>
              <td className="border border-slate-300 px-2.5 py-1.5 font-mono text-slate-900">
                {family.head_nic || '—'}
              </td>
            </tr>
            <tr>
              <th className="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                {lang === 'si' ? 'දුරකථන අංකය' : 'Contact Telephone'}
              </th>
              <td className="border border-slate-300 px-2.5 py-1.5 font-mono text-slate-900">
                {family.phone || '—'}
              </td>
              <th className="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                {lang === 'si' ? 'මුළු සාමාජික සංඛ්‍යාව' : 'Declared Household Size'}
              </th>
              <td className="border border-slate-300 px-2.5 py-1.5 font-mono font-semibold text-slate-900 tabular-nums">
                {family.total_members} ({resolved.persons.length}{' '}
                {lang === 'si' ? 'ලියාපදිංචි' : 'individual records'})
              </td>
            </tr>
            <tr>
              <th className="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                {lang === 'si' ? 'පදිංචි ලිපිනය' : 'Residential Address'}
              </th>
              <td colSpan={3} className="border border-slate-300 px-2.5 py-1.5 text-slate-900">
                {family.address || '—'}
                {family.latitude != null && family.longitude != null && (
                  <span className="ml-3 font-mono text-[11px] text-slate-600">
                    (GPS: {Number(family.latitude).toFixed(5)}, {Number(family.longitude).toFixed(5)})
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <th className="border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                {lang === 'si' ? 'ක්ෂණික අවශ්‍යතා සාරාංශය' : 'Immediate Needs Summary'}
              </th>
              <td colSpan={3} className="border border-slate-300 px-2.5 py-1.5 text-slate-900">
                {family.needs_summary || (lang === 'si' ? 'සටහන් කර නොමැත' : 'None specified')}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Section 2: Affected Household Members */}
      <section className="space-y-2">
        <h2 className="border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wider text-slate-800">
          {lang === 'si'
            ? `2. පවුලේ සාමාජික විස්තර (${resolved.persons.length})`
            : `2. Household Members / Affected Persons (${resolved.persons.length})`}
        </h2>

        {resolved.persons.length === 0 ? (
          <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            {lang === 'si'
              ? `තනි පුද්ගල වාර්තා තවම සම්බන්ධ කර නොමැත (ප්‍රකාශිත සාමාජික සංඛ්‍යාව: ${family.total_members}).`
              : `No individual member records have been linked yet (declared household members: ${family.total_members}).`}
          </div>
        ) : (
          <table className="w-full border-collapse border border-slate-300 text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-800">
                <th className="border border-slate-300 px-2 py-1.5 text-left">Ref No</th>
                <th className="border border-slate-300 px-2 py-1.5 text-left">
                  {lang === 'si' ? 'සම්පූර්ණ නම' : 'Full Name'}
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left">NIC / BC</th>
                <th className="border border-slate-300 px-2 py-1.5 text-center">
                  {lang === 'si' ? 'වයස / ස්ත්‍රී පුරුෂ' : 'Age / Gender'}
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left">
                  {lang === 'si' ? 'ඥාතිත්වය' : 'Relation'}
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left">
                  {lang === 'si' ? 'අවදානම් / සෞඛ්‍ය' : 'Vulnerability & Health'}
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-center">Photo</th>
              </tr>
            </thead>
            <tbody>
              {resolved.persons.map((person) => (
                <tr key={person.id}>
                  <td className="border border-slate-300 px-2 py-1.5 font-mono">{person.person_ref_no}</td>
                  <td className="border border-slate-300 px-2 py-1.5 font-medium text-slate-900">
                    {person.full_name}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 font-mono">
                    {person.nic_or_bc || '—'}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-center tabular-nums">
                    {person.age ?? '—'} / {person.gender}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5">
                    {person.relationship_to_head || '—'}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5">
                    {[person.vulnerability, person.health_status].filter(Boolean).join(' · ') || 'Normal'}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center">
                    {person.photo_url ? (
                      <img
                        src={person.photo_url}
                        alt={person.full_name}
                        className="mx-auto h-10 w-10 rounded border border-slate-300 object-cover"
                      />
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Section 3: House Damage Assessments & Photo Evidence */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between border-b border-slate-300 pb-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            {lang === 'si'
              ? `3. නිවාස හා දේපළ හානි තක්සේරුව (${resolved.damages.length})`
              : `3. House & Property Damage Assessment (${resolved.damages.length})`}
          </h2>
          <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
            {lang === 'si' ? 'මුළු ඇස්තමේන්තුගත අලාභය' : 'Total Estimated Loss'}: LKR{' '}
            {resolved.totalEstimatedLoss.toLocaleString('en-LK')}
          </span>
        </div>

        {resolved.damages.length === 0 ? (
          <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            {lang === 'si'
              ? 'මෙම පවුල සඳහා නිවාස හානි තක්සේරු වාර්තා ඇතුළත් කර නොමැත.'
              : 'No house damage assessment records filed for this household.'}
          </div>
        ) : (
          <div className="space-y-3">
            {resolved.damages.map((dmg) => (
              <div
                key={dmg.id}
                className="rounded border border-slate-300 p-3 space-y-2.5 print-break-inside-avoid"
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                  <div>
                    <span className="block text-[10px] text-slate-500">Assessment No</span>
                    <span className="font-mono font-semibold text-slate-950">{dmg.assessment_no}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500">Damage Level</span>
                    <span className="font-semibold text-slate-950">{dmg.damage_level}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500">Estimated Loss (LKR)</span>
                    <span className="font-mono font-semibold text-slate-950 tabular-nums">
                      {Number(dmg.estimated_loss_lkr || 0).toLocaleString('en-LK')}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500">Verification</span>
                    <span className="font-semibold text-slate-950">{dmg.verification_status}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-1 border-t border-slate-200 pt-2 text-[11px] text-slate-700 sm:grid-cols-3">
                  <div>
                    <span className="font-semibold">Inspection Date:</span> {dmg.inspection_date || '—'}
                  </div>
                  <div>
                    <span className="font-semibold">Inspector:</span> {dmg.inspector_name || '—'}
                  </div>
                  <div>
                    <span className="font-semibold">Remarks:</span> {dmg.remarks || '—'}
                  </div>
                </div>

                {Array.isArray(dmg.photos) && dmg.photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2.5 border-t border-slate-200 pt-2.5">
                    {dmg.photos.slice(0, 3).map((src, idx) => (
                      <figure key={idx} className="space-y-1">
                        <img
                          src={src}
                          alt={`Damage Evidence ${idx + 1}`}
                          className="h-28 w-full rounded border border-slate-300 object-cover"
                        />
                        <figcaption className="text-center font-mono text-[10px] text-slate-600">
                          Evidence Photo {idx + 1}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 4: Relief Assistance Vouchers (Admin / Super Admin Only) */}
      {hasAdminAccess && (
        <section className="space-y-2 print-break-inside-avoid">
          <div className="flex items-center justify-between border-b border-slate-300 pb-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              {lang === 'si'
                ? `4. ලබා දුන් සහන ආධාර (${resolved.reliefs.length})`
                : `4. Relief Assistance Issued (${resolved.reliefs.length})`}
            </h2>
            <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
              {lang === 'si' ? 'මුළු සහන වටිනාකම' : 'Total Relief Value'}: LKR{' '}
              {resolved.totalReliefValue.toLocaleString('en-LK')}
            </span>
          </div>

          {resolved.reliefs.length === 0 ? (
            <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              {lang === 'si'
                ? 'මෙම පවුල සඳහා සහන ආධාර වවුචර් නිකුත් කර නොමැත.'
                : 'No relief assistance vouchers recorded for this household.'}
            </div>
          ) : (
            <table className="w-full border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="border border-slate-300 px-2 py-1.5 text-left">Voucher No</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left">Assistance Type</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left">Quantity</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right">Value (LKR)</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left">Date</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {resolved.reliefs.map((rel) => (
                  <tr key={rel.id}>
                    <td className="border border-slate-300 px-2 py-1.5 font-mono">{rel.voucher_no}</td>
                    <td className="border border-slate-300 px-2 py-1.5 font-medium">{rel.assistance_type}</td>
                    <td className="border border-slate-300 px-2 py-1.5">{rel.quantity_unit || '—'}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
                      {Number(rel.value_lkr || 0).toLocaleString('en-LK')}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 font-mono">{rel.distributed_date}</td>
                    <td className="border border-slate-300 px-2 py-1.5 font-semibold">{rel.distribution_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* Section 5: Official Certification & Signature Blocks */}
      <section className="pt-4 print-break-inside-avoid">
        <h2 className="border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wider text-slate-800">
          {lang === 'si' ? '5. නිල සහතික කිරීම සහ අත්සන්' : '5. Official Certification & Verification Signatures'}
        </h2>
        <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4 text-[11px] text-slate-700">
          <div className="border-t border-slate-500 pt-1.5">
            <p className="font-semibold text-slate-900">
              {lang === 'si' ? 'ගෘහ මූලිකයා' : 'Head of Household'}
            </p>
            <p className="text-slate-500">Signature & Date</p>
          </div>
          <div className="border-t border-slate-500 pt-1.5">
            <p className="font-semibold text-slate-900">
              {lang === 'si' ? 'ග්‍රාම නිලධාරී' : 'Grama Niladhari'}
            </p>
            <p className="text-slate-500">Date & Official Stamp</p>
          </div>
          <div className="border-t border-slate-500 pt-1.5">
            <p className="font-semibold text-slate-900">
              {lang === 'si' ? 'ප්‍රාදේශීය ලේකම්' : 'Divisional Secretary'}
            </p>
            <p className="text-slate-500">Certification & Seal</p>
          </div>
          <div className="border-t border-slate-500 pt-1.5">
            <p className="font-semibold text-slate-900">
              {lang === 'si' ? 'දිස්ත්‍රික් ආපදා සම්බන්ධීකාරක' : 'District Coordinator'}
            </p>
            <p className="text-slate-500">Final Approval</p>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-2 flex flex-wrap items-center justify-between text-[10px] font-mono text-slate-500">
          <span>Record UUID: {family.id}</span>
          <span>
            Version v{family.version} · Device {family.device_id} · Generated {new Date().toLocaleString('en-LK')}
          </span>
        </div>
      </section>
    </article>
  );
};

interface FamilyAssessmentPdfModalProps {
  family: AffectedFamily;
  dataset: DmisDataset;
  user: AuthUser;
  lang: Language;
  onClose: () => void;
}

export const FamilyAssessmentPdfModal: React.FC<FamilyAssessmentPdfModalProps> = ({
  family,
  dataset,
  user,
  lang,
  onClose,
}) => {
  useEffect(() => {
    const prevTitle = document.title;
    document.body.classList.add('printing-family-dossier');
    document.title = `DMIS-Family-Assessment-${family.family_ref_no || family.id.slice(0, 8)}`;

    const handleAfterPrint = () => {
      document.title = prevTitle;
    };
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('printing-family-dossier');
      document.title = prevTitle;
    };
  }, [family.family_ref_no, family.id]);

  const handlePrint = () => {
    document.title = `DMIS-Family-Assessment-${family.family_ref_no || family.id.slice(0, 8)}`;
    window.print();
  };

  return (
    <div className="family-dossier-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6 overflow-y-auto">
      <div className="family-dossier-sheet relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Top Screen Action Bar (Hidden in PDF Printout) */}
        <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/95 backdrop-blur px-5 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {lang === 'si' ? 'පවුල් තක්සේරු PDF පෙරදසුන' : 'Official Family Assessment PDF Preview'}
            </h3>
            <p className="text-xs text-slate-500">
              {family.family_ref_no} — {family.head_name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#0F294A] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1A3B66]"
            >
              <Printer className="h-4 w-4" />
              <span>{lang === 'si' ? 'PDF සුරකින්න / මුද්‍රණය' : 'Generate PDF / Print'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              aria-label="Close Preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable A4 Government Dossier Content */}
        <div className="p-5 sm:p-8">
          <FamilyAssessmentSheet family={family} dataset={dataset} user={user} lang={lang} />
        </div>
      </div>
    </div>
  );
};
