import type { DataTableKey, DmisDataset, Language } from '../types/dmis';

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'textarea'
  | 'relation'
  | 'boolean'
  | 'password'
  | 'photo_single'
  | 'photo_multi';

export interface FieldConfig {
  key: string;
  labelEn: string;
  labelSi: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; labelEn: string; labelSi: string }[];
  relationTable?: DataTableKey;
  relationLabelFn?: (row: Record<string, unknown>, lang: Language) => string;
  placeholder?: string;
  defaultValue?: unknown;
  hideOnEdit?: boolean;
  maxPhotos?: number;
}

export interface ColumnConfig {
  key: string;
  labelEn: string;
  labelSi: string;
  isNumeric?: boolean;
  format?: (val: unknown, row: Record<string, unknown>, dataset: DmisDataset, lang: Language) => string;
}

export interface FilterConfig {
  key: string;
  labelEn: string;
  labelSi: string;
  relationTable?: DataTableKey;
  relationLabelFn?: (row: Record<string, unknown>, lang: Language) => string;
  options?: { value: string; labelEn: string; labelSi: string }[];
}

export interface ModuleSchemaConfig {
  table: DataTableKey;
  titleEn: string;
  titleSi: string;
  naturalKeyField: string;
  defaultSortKey: string;
  searchableFields: string[];
  searchHintEn: string;
  searchHintSi: string;
  fields: FieldConfig[];
  columns: ColumnConfig[];
  filters: FilterConfig[];
}

const findLabel = (
  rows: Record<string, unknown>[],
  id: unknown,
  labelFn: (r: Record<string, unknown>) => string
): string => {
  if (!id) return '—';
  const match = rows.find((r) => r.id === id);
  return match ? labelFn(match) : String(id).slice(0, 8);
};

export const MODULE_CONFIGS: Record<DataTableKey, ModuleSchemaConfig> = {
  disasters: {
    table: 'disasters',
    titleEn: 'Disaster Records',
    titleSi: 'ආපදා වාර්තා',
    naturalKeyField: 'disaster_code',
    defaultSortKey: 'start_date',
    searchableFields: ['disaster_code', 'title', 'disaster_type', 'severity', 'status', 'description'],
    searchHintEn: 'Search by disaster code, title, type, status, or district...',
    searchHintSi: 'ආපදා කේතය, නම, වර්ගය හෝ දිස්ත්‍රික්කය අනුව සොයන්න...',
    fields: [
      { key: 'disaster_code', labelEn: 'Disaster Code', labelSi: 'ආපදා කේතය', type: 'text', required: true, placeholder: 'DIS-2026-001' },
      { key: 'title', labelEn: 'Incident Title', labelSi: 'ආපදා නාමය', type: 'text', required: true },
      {
        key: 'disaster_type',
        labelEn: 'Disaster Type',
        labelSi: 'ආපදා වර්ගය',
        type: 'select',
        required: true,
        defaultValue: 'Flood',
        options: [
          { value: 'Flood', labelEn: 'Flood', labelSi: 'ගංවතුර' },
          { value: 'Landslide', labelEn: 'Landslide', labelSi: 'නායයෑම' },
          { value: 'Cyclone / High Wind', labelEn: 'Cyclone / High Wind', labelSi: 'සුළි කුණාටු / තද සුළං' },
          { value: 'Drought', labelEn: 'Drought', labelSi: 'නියඟය' },
          { value: 'Fire', labelEn: 'Fire', labelSi: 'ගිනි ගැනීම' },
          { value: 'Other', labelEn: 'Other', labelSi: 'වෙනත්' },
        ],
      },
      {
        key: 'severity',
        labelEn: 'Severity',
        labelSi: 'දරුණු බව',
        type: 'select',
        required: true,
        defaultValue: 'Moderate',
        options: [
          { value: 'Low', labelEn: 'Low', labelSi: 'අඩු' },
          { value: 'Moderate', labelEn: 'Moderate', labelSi: 'මධ්‍යම' },
          { value: 'High', labelEn: 'High', labelSi: 'ඉහළ' },
          { value: 'Critical', labelEn: 'Critical', labelSi: 'අතිශය තීව්‍ර' },
        ],
      },
      { key: 'start_date', labelEn: 'Start Date', labelSi: 'ආරම්භක දිනය', type: 'date', required: true },
      { key: 'end_date', labelEn: 'End Date', labelSi: 'අවසන් දිනය', type: 'date' },
      {
        key: 'status',
        labelEn: 'Status',
        labelSi: 'තත්ත්වය',
        type: 'select',
        required: true,
        defaultValue: 'Active',
        options: [
          { value: 'Active', labelEn: 'Active', labelSi: 'සක්‍රීය' },
          { value: 'Monitoring', labelEn: 'Monitoring', labelSi: 'නිරීක්ෂණය' },
          { value: 'Relief Phase', labelEn: 'Relief Phase', labelSi: 'සහන අදියර' },
          { value: 'Closed', labelEn: 'Closed', labelSi: 'වසා දමන ලදී' },
        ],
      },
      {
        key: 'district_id',
        labelEn: 'District',
        labelSi: 'දිස්ත්‍රික්කය',
        type: 'relation',
        relationTable: 'districts',
        relationLabelFn: (r, lang) => (lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)),
      },
      {
        key: 'ds_id',
        labelEn: 'Divisional Secretariat',
        labelSi: 'ප්‍රාදේශීය ලේකම් කොට්ඨාසය',
        type: 'relation',
        relationTable: 'divisional_secretariats',
        relationLabelFn: (r, lang) => (lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)),
      },
      { key: 'latitude', labelEn: 'Latitude (GPS)', labelSi: 'අක්ෂාංශ (Latitude)', type: 'number', placeholder: '6.9271' },
      { key: 'longitude', labelEn: 'Longitude (GPS)', labelSi: 'දේශාංශ (Longitude)', type: 'number', placeholder: '79.8612' },
      { key: 'description', labelEn: 'Situation Notes', labelSi: 'විස්තරය', type: 'textarea' },
    ],
    columns: [
      { key: 'disaster_code', labelEn: 'Code', labelSi: 'කේතය' },
      { key: 'title', labelEn: 'Title', labelSi: 'නාමය' },
      { key: 'disaster_type', labelEn: 'Type', labelSi: 'වර්ගය' },
      { key: 'severity', labelEn: 'Severity', labelSi: 'තීව්‍රතාව' },
      { key: 'start_date', labelEn: 'Start Date', labelSi: 'දිනය', isNumeric: true },
      { key: 'status', labelEn: 'Status', labelSi: 'තත්ත්වය' },
    ],
    filters: [
      {
        key: 'status',
        labelEn: 'Status',
        labelSi: 'තත්ත්වය',
        options: [
          { value: 'Active', labelEn: 'Active', labelSi: 'සක්‍රීය' },
          { value: 'Monitoring', labelEn: 'Monitoring', labelSi: 'නිරීක්ෂණය' },
          { value: 'Relief Phase', labelEn: 'Relief Phase', labelSi: 'සහන අදියර' },
          { value: 'Closed', labelEn: 'Closed', labelSi: 'වසා ඇත' },
        ],
      },
      {
        key: 'severity',
        labelEn: 'Severity',
        labelSi: 'තීව්‍රතාව',
        options: [
          { value: 'Low', labelEn: 'Low', labelSi: 'අඩු' },
          { value: 'Moderate', labelEn: 'Moderate', labelSi: 'මධ්‍යම' },
          { value: 'High', labelEn: 'High', labelSi: 'ඉහළ' },
          { value: 'Critical', labelEn: 'Critical', labelSi: 'තීව්‍ර' },
        ],
      },
    ],
  },

  districts: {
    table: 'districts',
    titleEn: 'Districts',
    titleSi: 'දිස්ත්‍රික්ක',
    naturalKeyField: 'district_code',
    defaultSortKey: 'name_en',
    searchableFields: ['district_code', 'name_en', 'name_si', 'province'],
    searchHintEn: 'Search by district code, English/Sinhala name, or province...',
    searchHintSi: 'දිස්ත්‍රික් කේතය, නම හෝ පළාත අනුව සොයන්න...',
    fields: [
      { key: 'district_code', labelEn: 'District Code', labelSi: 'දිස්ත්‍රික් කේතය', type: 'text', required: true, placeholder: 'LK-11' },
      { key: 'name_en', labelEn: 'Name (English)', labelSi: 'නම (ඉංග්‍රීසි)', type: 'text', required: true },
      { key: 'name_si', labelEn: 'Name (Sinhala)', labelSi: 'නම (සිංහල)', type: 'text' },
      { key: 'province', labelEn: 'Province', labelSi: 'පළාත', type: 'text' },
    ],
    columns: [
      { key: 'district_code', labelEn: 'Code', labelSi: 'කේතය' },
      { key: 'name_en', labelEn: 'Name (EN)', labelSi: 'නම (EN)' },
      { key: 'name_si', labelEn: 'Name (SI)', labelSi: 'නම (SI)' },
      { key: 'province', labelEn: 'Province', labelSi: 'පළාත' },
    ],
    filters: [],
  },

  divisional_secretariats: {
    table: 'divisional_secretariats',
    titleEn: 'Divisional Secretariats',
    titleSi: 'ප්‍රාදේශීය ලේකම් කොට්ඨාස',
    naturalKeyField: 'ds_code',
    defaultSortKey: 'name_en',
    searchableFields: ['ds_code', 'name_en', 'name_si'],
    searchHintEn: 'Search by DS code, name, or district...',
    searchHintSi: 'ප්‍රා.ලේ. කේතය, නම හෝ දිස්ත්‍රික්කය අනුව සොයන්න...',
    fields: [
      { key: 'ds_code', labelEn: 'DS Code', labelSi: 'ප්‍රා.ලේ. කේතය', type: 'text', required: true },
      {
        key: 'district_id',
        labelEn: 'District',
        labelSi: 'දිස්ත්‍රික්කය',
        type: 'relation',
        required: true,
        relationTable: 'districts',
        relationLabelFn: (r, lang) => (lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)),
      },
      { key: 'name_en', labelEn: 'Name (English)', labelSi: 'නම (ඉංග්‍රීසි)', type: 'text', required: true },
      { key: 'name_si', labelEn: 'Name (Sinhala)', labelSi: 'නම (සිංහල)', type: 'text' },
    ],
    columns: [
      { key: 'ds_code', labelEn: 'DS Code', labelSi: 'කේතය' },
      { key: 'name_en', labelEn: 'Name (EN)', labelSi: 'නම (EN)' },
      { key: 'name_si', labelEn: 'Name (SI)', labelSi: 'නම (SI)' },
      {
        key: 'district_id',
        labelEn: 'District',
        labelSi: 'දිස්ත්‍රික්කය',
        format: (val, _r, ds, lang) =>
          findLabel(ds.districts as unknown as Record<string, unknown>[], val, (d) =>
            lang === 'si' && d.name_si ? String(d.name_si) : String(d.name_en)
          ),
      },
    ],
    filters: [
      {
        key: 'district_id',
        labelEn: 'District',
        labelSi: 'දිස්ත්‍රික්කය',
        relationTable: 'districts',
        relationLabelFn: (r, lang) => (lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)),
      },
    ],
  },

  gn_divisions: {
    table: 'gn_divisions',
    titleEn: 'GN Divisions',
    titleSi: 'ග්‍රාම නිලධාරී වසම්',
    naturalKeyField: 'gn_code',
    defaultSortKey: 'name_en',
    searchableFields: ['gn_code', 'gn_number', 'name_en', 'name_si'],
    searchHintEn: 'Search by GN code, division no, name, or DS division...',
    searchHintSi: 'ග්‍රා.නි. කේතය, අංකය, නම හෝ ප්‍රා.ලේ. කොට්ඨාසය අනුව සොයන්න...',
    fields: [
      { key: 'gn_code', labelEn: 'GN Code', labelSi: 'ග්‍රා.නි. කේතය', type: 'text', required: true },
      { key: 'gn_number', labelEn: 'GN Division No', labelSi: 'වසම් අංකය', type: 'text' },
      {
        key: 'ds_id',
        labelEn: 'Divisional Secretariat',
        labelSi: 'ප්‍රාදේශීය ලේකම් කොට්ඨාසය',
        type: 'relation',
        required: true,
        relationTable: 'divisional_secretariats',
        relationLabelFn: (r, lang) => (lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)),
      },
      { key: 'name_en', labelEn: 'Name (English)', labelSi: 'නම (ඉංග්‍රීසි)', type: 'text', required: true },
      { key: 'name_si', labelEn: 'Name (Sinhala)', labelSi: 'නම (සිංහල)', type: 'text' },
    ],
    columns: [
      { key: 'gn_code', labelEn: 'GN Code', labelSi: 'කේතය' },
      { key: 'gn_number', labelEn: 'No', labelSi: 'අංකය' },
      { key: 'name_en', labelEn: 'Name (EN)', labelSi: 'නම (EN)' },
      { key: 'name_si', labelEn: 'Name (SI)', labelSi: 'නම (SI)' },
      {
        key: 'ds_id',
        labelEn: 'Divisional Secretariat',
        labelSi: 'ප්‍රා.ලේ. කොට්ඨාසය',
        format: (val, _r, ds, lang) =>
          findLabel(ds.divisional_secretariats as unknown as Record<string, unknown>[], val, (d) =>
            lang === 'si' && d.name_si ? String(d.name_si) : String(d.name_en)
          ),
      },
    ],
    filters: [
      {
        key: 'ds_id',
        labelEn: 'DS Division',
        labelSi: 'ප්‍රා.ලේ. කොට්ඨාසය',
        relationTable: 'divisional_secretariats',
        relationLabelFn: (r, lang) => (lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)),
      },
    ],
  },

  affected_families: {
    table: 'affected_families',
    titleEn: 'Affected Families',
    titleSi: 'පීඩාවට පත් පවුල්',
    naturalKeyField: 'family_ref_no',
    defaultSortKey: 'updated_at',
    searchableFields: ['family_ref_no', 'head_name', 'head_nic', 'phone', 'address', 'displacement_status', 'needs_summary'],
    searchHintEn: 'Search by family ref no, head name, NIC, phone, address, or GN division...',
    searchHintSi: 'පවුල් යොමු අංකය, ගෘහ මූලික නම, ජා.හැ., දුරකථන හෝ වසම අනුව සොයන්න...',
    fields: [
      { key: 'family_ref_no', labelEn: 'Family Ref No', labelSi: 'පවුල් යොමු අංකය', type: 'text', required: true },
      {
        key: 'disaster_id',
        labelEn: 'Disaster Event',
        labelSi: 'ආපදා සිද්ධිය',
        type: 'relation',
        required: true,
        relationTable: 'disasters',
        relationLabelFn: (r) => `${String(r.disaster_code)} — ${String(r.title)}`,
      },
      {
        key: 'district_id',
        labelEn: 'District',
        labelSi: 'දිස්ත්‍රික්කය',
        type: 'relation',
        relationTable: 'districts',
        relationLabelFn: (r, lang) => (lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)),
      },
      {
        key: 'ds_id',
        labelEn: 'Divisional Secretariat',
        labelSi: 'ප්‍රාදේශීය ලේකම් කොට්ඨාසය',
        type: 'relation',
        relationTable: 'divisional_secretariats',
        relationLabelFn: (r, lang) => (lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)),
      },
      {
        key: 'gn_id',
        labelEn: 'GN Division',
        labelSi: 'ග්‍රාම නිලධාරී වසම',
        type: 'relation',
        relationTable: 'gn_divisions',
        relationLabelFn: (r, lang) =>
          `${String(r.gn_number || r.gn_code)} · ${lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)}`,
      },
      { key: 'head_name', labelEn: 'Head of Household', labelSi: 'ගෘහ මූලිකයාගේ නම', type: 'text', required: true },
      { key: 'head_nic', labelEn: 'NIC Number', labelSi: 'ජා.හැ. අංකය', type: 'text' },
      { key: 'phone', labelEn: 'Contact Phone', labelSi: 'දුරකථන අංකය', type: 'text' },
      { key: 'address', labelEn: 'Home Address', labelSi: 'ලිපිනය', type: 'text' },
      { key: 'total_members', labelEn: 'Total Members', labelSi: 'සාමාජික සංඛ්‍යාව', type: 'number', required: true, defaultValue: 1 },
      {
        key: 'displacement_status',
        labelEn: 'Displacement Status',
        labelSi: 'අවතැන් තත්ත්වය',
        type: 'select',
        required: true,
        defaultValue: 'At Home',
        options: [
          { value: 'At Home', labelEn: 'At Home', labelSi: 'නිවසේ රැඳී සිටී' },
          { value: 'With Relatives', labelEn: 'With Relatives', labelSi: 'ඥාතීන් සමඟ' },
          { value: 'Safety Centre', labelEn: 'Safety Centre', labelSi: 'ආරක්ෂිත මධ්‍යස්ථානයේ' },
          { value: 'Relocated', labelEn: 'Relocated', labelSi: 'වෙනත් ස්ථානයක පදිංචි කර ඇත' },
        ],
      },
      { key: 'latitude', labelEn: 'Latitude (GPS)', labelSi: 'අක්ෂාංශ (Latitude)', type: 'number', placeholder: '6.9271' },
      { key: 'longitude', labelEn: 'Longitude (GPS)', labelSi: 'දේශාංශ (Longitude)', type: 'number', placeholder: '79.8612' },
      { key: 'needs_summary', labelEn: 'Urgent Needs', labelSi: 'හදිසි අවශ්‍යතා', type: 'textarea' },
    ],
    columns: [
      { key: 'family_ref_no', labelEn: 'Ref No', labelSi: 'යොමු අංකය' },
      { key: 'head_name', labelEn: 'Head of Household', labelSi: 'ගෘහ මූලිකයා' },
      { key: 'head_nic', labelEn: 'NIC', labelSi: 'ජා.හැ. අංකය' },
      { key: 'total_members', labelEn: 'Members', labelSi: 'සාමාජිකයින්', isNumeric: true },
      { key: 'displacement_status', labelEn: 'Status', labelSi: 'තත්ත්වය' },
      {
        key: 'gn_id',
        labelEn: 'GN Division',
        labelSi: 'ග්‍රා.නි. වසම',
        format: (val, _r, ds, lang) =>
          findLabel(ds.gn_divisions as unknown as Record<string, unknown>[], val, (g) =>
            lang === 'si' && g.name_si ? String(g.name_si) : String(g.name_en)
          ),
      },
    ],
    filters: [
      {
        key: 'disaster_id',
        labelEn: 'Disaster',
        labelSi: 'ආපදාව',
        relationTable: 'disasters',
        relationLabelFn: (r) => String(r.title),
      },
      {
        key: 'displacement_status',
        labelEn: 'Displacement',
        labelSi: 'අවතැන් තත්ත්වය',
        options: [
          { value: 'At Home', labelEn: 'At Home', labelSi: 'නිවසේ' },
          { value: 'With Relatives', labelEn: 'With Relatives', labelSi: 'ඥාතීන් සමඟ' },
          { value: 'Safety Centre', labelEn: 'Safety Centre', labelSi: 'ආරක්ෂිත මධ්‍යස්ථානය' },
          { value: 'Relocated', labelEn: 'Relocated', labelSi: 'නැවත පදිංචි' },
        ],
      },
    ],
  },

  affected_persons: {
    table: 'affected_persons',
    titleEn: 'Affected Persons',
    titleSi: 'පීඩාවට පත් පුද්ගලයින්',
    naturalKeyField: 'person_ref_no',
    defaultSortKey: 'updated_at',
    searchableFields: ['person_ref_no', 'full_name', 'nic_or_bc', 'relationship_to_head', 'vulnerability', 'health_status'],
    searchHintEn: 'Search by person ref no, full name, NIC/BC, family, or vulnerability...',
    searchHintSi: 'පුද්ගල යොමු අංකය, නම, ජා.හැ. අංකය හෝ පවුල අනුව සොයන්න...',
    fields: [
      { key: 'person_ref_no', labelEn: 'Person Ref No', labelSi: 'පුද්ගල යොමු අංකය', type: 'text', required: true },
      {
        key: 'disaster_id',
        labelEn: 'Disaster Event',
        labelSi: 'ආපදා සිද්ධිය',
        type: 'relation',
        required: true,
        relationTable: 'disasters',
        relationLabelFn: (r) => `${String(r.disaster_code)} — ${String(r.title)}`,
      },
      {
        key: 'family_id',
        labelEn: 'Affected Family',
        labelSi: 'පවුල',
        type: 'relation',
        required: true,
        relationTable: 'affected_families',
        relationLabelFn: (r) => `${String(r.family_ref_no)} — ${String(r.head_name)}`,
      },
      { key: 'full_name', labelEn: 'Full Name', labelSi: 'සම්පූර්ණ නම', type: 'text', required: true },
      { key: 'nic_or_bc', labelEn: 'NIC / Birth Cert No', labelSi: 'ජා.හැ. / උප්පැන්න අංකය', type: 'text' },
      { key: 'age', labelEn: 'Age', labelSi: 'වයස', type: 'number' },
      {
        key: 'gender',
        labelEn: 'Gender',
        labelSi: 'ස්ත්‍රී/පුරුෂ භාවය',
        type: 'select',
        required: true,
        defaultValue: 'Female',
        options: [
          { value: 'Female', labelEn: 'Female', labelSi: 'ස්ත්‍රී' },
          { value: 'Male', labelEn: 'Male', labelSi: 'පුරුෂ' },
          { value: 'Other', labelEn: 'Other', labelSi: 'වෙනත්' },
        ],
      },
      { key: 'relationship_to_head', labelEn: 'Relationship to Head', labelSi: 'ගෘහ මූලිකයාට ඇති ඥාතිත්වය', type: 'text', defaultValue: 'Member' },
      {
        key: 'vulnerability',
        labelEn: 'Vulnerability',
        labelSi: 'විශේෂ අවදානම් තත්ත්වය',
        type: 'select',
        defaultValue: 'None',
        options: [
          { value: 'None', labelEn: 'None', labelSi: 'නැත' },
          { value: 'Infant / Child', labelEn: 'Infant / Child', labelSi: 'ළදරු / ළමා' },
          { value: 'Elderly (60+)', labelEn: 'Elderly (60+)', labelSi: 'වැඩිහිටි (60+)' },
          { value: 'Pregnant / Lactating', labelEn: 'Pregnant / Lactating', labelSi: 'ගර්භණී / කිරි දෙන මව' },
          { value: 'Disability', labelEn: 'Person with Disability', labelSi: 'ආබාධිත' },
          { value: 'Chronic Illness', labelEn: 'Chronic Illness', labelSi: 'නිදන්ගත රෝගී' },
        ],
      },
      {
        key: 'health_status',
        labelEn: 'Health / Casualty Status',
        labelSi: 'සෞඛ්‍ය තත්ත්වය',
        type: 'select',
        defaultValue: 'Safe',
        options: [
          { value: 'Safe', labelEn: 'Safe', labelSi: 'සුරක්ෂිත' },
          { value: 'Minor Injury', labelEn: 'Minor Injury', labelSi: 'සුළු තුවාල' },
          { value: 'Hospitalized', labelEn: 'Hospitalized', labelSi: 'රෝහල් ගත කර ඇත' },
          { value: 'Missing', labelEn: 'Missing', labelSi: 'අතුරුදහන්' },
          { value: 'Deceased', labelEn: 'Deceased', labelSi: 'මියගොස් ඇත' },
        ],
      },
      {
        key: 'photo_url',
        labelEn: 'Person Photo (Optional)',
        labelSi: 'පුද්ගලයාගේ ඡායාරූපය (අත්‍යවශ්‍ය නොවේ)',
        type: 'photo_single',
        required: false,
        defaultValue: null,
      },
    ],
    columns: [
      { key: 'person_ref_no', labelEn: 'Ref No', labelSi: 'යොමු අංකය' },
      { key: 'full_name', labelEn: 'Full Name', labelSi: 'නම' },
      { key: 'nic_or_bc', labelEn: 'NIC / BC', labelSi: 'ජා.හැ. අංකය' },
      { key: 'age', labelEn: 'Age', labelSi: 'වයස', isNumeric: true },
      { key: 'vulnerability', labelEn: 'Vulnerability', labelSi: 'අවදානම' },
      { key: 'health_status', labelEn: 'Health', labelSi: 'සෞඛ්‍යය' },
      {
        key: 'photo_url',
        labelEn: 'Photo',
        labelSi: 'ඡායාරූපය',
        format: (val, _r, _ds, lang) => (val ? (lang === 'si' ? 'ඇත' : 'Yes') : '—'),
      },
    ],
    filters: [
      {
        key: 'disaster_id',
        labelEn: 'Disaster',
        labelSi: 'ආපදාව',
        relationTable: 'disasters',
        relationLabelFn: (r) => String(r.title),
      },
      {
        key: 'health_status',
        labelEn: 'Health',
        labelSi: 'සෞඛ්‍යය',
        options: [
          { value: 'Safe', labelEn: 'Safe', labelSi: 'සුරක්ෂිත' },
          { value: 'Minor Injury', labelEn: 'Minor Injury', labelSi: 'සුළු තුවාල' },
          { value: 'Hospitalized', labelEn: 'Hospitalized', labelSi: 'රෝහල්ගත' },
          { value: 'Missing', labelEn: 'Missing', labelSi: 'අතුරුදහන්' },
          { value: 'Deceased', labelEn: 'Deceased', labelSi: 'මරණ' },
        ],
      },
    ],
  },

  house_damages: {
    table: 'house_damages',
    titleEn: 'House Damages',
    titleSi: 'නිවාස හානි',
    naturalKeyField: 'assessment_no',
    defaultSortKey: 'inspection_date',
    searchableFields: ['assessment_no', 'damage_level', 'inspector_name', 'verification_status', 'remarks'],
    searchHintEn: 'Search by assessment no, household, damage level, inspector, or remarks...',
    searchHintSi: 'තක්සේරු අංකය, පවුල, හානි මට්ටම හෝ පරීක්ෂක නම අනුව සොයන්න...',
    fields: [
      { key: 'assessment_no', labelEn: 'Assessment No', labelSi: 'තක්සේරු අංකය', type: 'text', required: true },
      {
        key: 'disaster_id',
        labelEn: 'Disaster Event',
        labelSi: 'ආපදා සිද්ධිය',
        type: 'relation',
        required: true,
        relationTable: 'disasters',
        relationLabelFn: (r) => `${String(r.disaster_code)} — ${String(r.title)}`,
      },
      {
        key: 'family_id',
        labelEn: 'Affected Family',
        labelSi: 'පවුල',
        type: 'relation',
        required: true,
        relationTable: 'affected_families',
        relationLabelFn: (r) => `${String(r.family_ref_no)} — ${String(r.head_name)}`,
      },
      {
        key: 'gn_id',
        labelEn: 'GN Division',
        labelSi: 'ග්‍රාම නිලධාරී වසම',
        type: 'relation',
        relationTable: 'gn_divisions',
        relationLabelFn: (r, lang) => (lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)),
      },
      {
        key: 'damage_level',
        labelEn: 'Damage Classification',
        labelSi: 'හානි මට්ටම',
        type: 'select',
        required: true,
        defaultValue: 'Partially Damaged - Minor',
        options: [
          { value: 'Fully Damaged', labelEn: 'Fully Damaged', labelSi: 'පූර්ණ හානි' },
          { value: 'Partially Damaged - Severe', labelEn: 'Partially Damaged - Severe', labelSi: 'අර්ධ හානි - දරුණු' },
          { value: 'Partially Damaged - Minor', labelEn: 'Partially Damaged - Minor', labelSi: 'අර්ධ හානි - සුළු' },
        ],
      },
      { key: 'estimated_loss_lkr', labelEn: 'Estimated Loss (LKR)', labelSi: 'ඇස්තමේන්තුගත හානිය (රු.)', type: 'number', required: true, defaultValue: 0 },
      { key: 'inspection_date', labelEn: 'Inspection Date', labelSi: 'පරීක්ෂණ දිනය', type: 'date', required: true },
      { key: 'inspector_name', labelEn: 'Inspector / Technical Officer', labelSi: 'පරීක්ෂක නිලධාරී', type: 'text' },
      {
        key: 'verification_status',
        labelEn: 'Verification Status',
        labelSi: 'සත්‍යාපන තත්ත්වය',
        type: 'select',
        required: true,
        defaultValue: 'Pending',
        options: [
          { value: 'Pending', labelEn: 'Pending', labelSi: 'පොරොත්තු' },
          { value: 'Field Verified', labelEn: 'Field Verified', labelSi: 'ක්ෂේත්‍ර සත්‍යාපිත' },
          { value: 'DS Approved', labelEn: 'DS Approved', labelSi: 'ප්‍රා.ලේ. අනුමත' },
          { value: 'District Approved', labelEn: 'District Approved', labelSi: 'දිස්ත්‍රික් අනුමත' },
        ],
      },
      { key: 'remarks', labelEn: 'Assessment Remarks', labelSi: 'සටහන්', type: 'textarea' },
      {
        key: 'photos',
        labelEn: 'Damage Photos (Up to 3)',
        labelSi: 'නිවාස හානි ඡායාරූප (උපරිම 3)',
        type: 'photo_multi',
        maxPhotos: 3,
        defaultValue: [],
      },
    ],
    columns: [
      { key: 'assessment_no', labelEn: 'Assessment No', labelSi: 'අංකය' },
      {
        key: 'family_id',
        labelEn: 'Household',
        labelSi: 'පවුල',
        format: (val, _r, ds) =>
          findLabel(ds.affected_families as unknown as Record<string, unknown>[], val, (f) => String(f.head_name)),
      },
      { key: 'damage_level', labelEn: 'Damage Level', labelSi: 'හානි මට්ටම' },
      {
        key: 'estimated_loss_lkr',
        labelEn: 'Est. Loss (LKR)',
        labelSi: 'හානිය (රු.)',
        isNumeric: true,
        format: (val) => Number(val ?? 0).toLocaleString('en-LK'),
      },
      { key: 'inspection_date', labelEn: 'Date', labelSi: 'දිනය', isNumeric: true },
      { key: 'verification_status', labelEn: 'Verification', labelSi: 'අනුමැතිය' },
      {
        key: 'photos',
        labelEn: 'Photos',
        labelSi: 'ඡායාරූප',
        isNumeric: true,
        format: (val) => (Array.isArray(val) ? `${val.length}/3` : '0/3'),
      },
    ],
    filters: [
      {
        key: 'damage_level',
        labelEn: 'Damage Level',
        labelSi: 'හානි මට්ටම',
        options: [
          { value: 'Fully Damaged', labelEn: 'Fully Damaged', labelSi: 'පූර්ණ හානි' },
          { value: 'Partially Damaged - Severe', labelEn: 'Severe Partial', labelSi: 'දරුණු අර්ධ' },
          { value: 'Partially Damaged - Minor', labelEn: 'Minor Partial', labelSi: 'සුළු අර්ධ' },
        ],
      },
      {
        key: 'verification_status',
        labelEn: 'Verification',
        labelSi: 'සත්‍යාපනය',
        options: [
          { value: 'Pending', labelEn: 'Pending', labelSi: 'පොරොත්තු' },
          { value: 'Field Verified', labelEn: 'Field Verified', labelSi: 'ක්ෂේත්‍ර සත්‍යාපිත' },
          { value: 'DS Approved', labelEn: 'DS Approved', labelSi: 'ප්‍රා.ලේ. අනුමත' },
          { value: 'District Approved', labelEn: 'District Approved', labelSi: 'දිස්ත්‍රික් අනුමත' },
        ],
      },
    ],
  },

  relief_assistance: {
    table: 'relief_assistance',
    titleEn: 'Relief Assistance',
    titleSi: 'සහන ආධාර',
    naturalKeyField: 'voucher_no',
    defaultSortKey: 'distributed_date',
    searchableFields: ['voucher_no', 'assistance_type', 'quantity_unit', 'distribution_status', 'distributed_by', 'remarks'],
    searchHintEn: 'Search by voucher no, recipient family, assistance type, or officer...',
    searchHintSi: 'වවුචර් අංකය, ප්‍රතිලාභී පවුල, ආධාර වර්ගය හෝ නිලධාරියා අනුව සොයන්න...',
    fields: [
      { key: 'voucher_no', labelEn: 'Voucher / Receipt No', labelSi: 'වවුචර් අංකය', type: 'text', required: true },
      {
        key: 'disaster_id',
        labelEn: 'Disaster Event',
        labelSi: 'ආපදා සිද්ධිය',
        type: 'relation',
        required: true,
        relationTable: 'disasters',
        relationLabelFn: (r) => `${String(r.disaster_code)} — ${String(r.title)}`,
      },
      {
        key: 'family_id',
        labelEn: 'Recipient Family',
        labelSi: 'ප්‍රතිලාභී පවුල',
        type: 'relation',
        required: true,
        relationTable: 'affected_families',
        relationLabelFn: (r) => `${String(r.family_ref_no)} — ${String(r.head_name)}`,
      },
      {
        key: 'gn_id',
        labelEn: 'GN Division',
        labelSi: 'ග්‍රාම නිලධාරී වසම',
        type: 'relation',
        relationTable: 'gn_divisions',
        relationLabelFn: (r, lang) => (lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)),
      },
      {
        key: 'assistance_type',
        labelEn: 'Assistance Type',
        labelSi: 'ආධාර වර්ගය',
        type: 'select',
        required: true,
        defaultValue: 'Dry Rations',
        options: [
          { value: 'Dry Rations', labelEn: 'Dry Rations', labelSi: 'වියළි ආහාර' },
          { value: 'Cooked Meals', labelEn: 'Cooked Meals', labelSi: 'පිසූ ආහාර' },
          { value: 'Cash Grant', labelEn: 'Cash Grant', labelSi: 'මුදල් ආධාර' },
          { value: 'Housing Repair Grant', labelEn: 'Housing Repair Grant', labelSi: 'නිවාස අලුත්වැඩියා ආධාර' },
          { value: 'Temporary Shelter', labelEn: 'Temporary Shelter / Tents', labelSi: 'තාවකාලික නිවාස' },
          { value: 'Medical / Hygiene Kit', labelEn: 'Medical / Hygiene Kit', labelSi: 'සෞඛ්‍ය / සනීපාරක්ෂක කට්ටල' },
          { value: 'School Supplies', labelEn: 'School Supplies', labelSi: 'පාසල් උපකරණ' },
        ],
      },
      { key: 'quantity_unit', labelEn: 'Quantity / Pack Details', labelSi: 'ප්‍රමාණය / ඒකකය', type: 'text', placeholder: '1 Pack / 7 Days' },
      { key: 'value_lkr', labelEn: 'Monetary Value (LKR)', labelSi: 'වටිනාකම (රු.)', type: 'number', required: true, defaultValue: 0 },
      { key: 'distributed_date', labelEn: 'Distribution Date', labelSi: 'බෙදාහැරීමේ දිනය', type: 'date', required: true },
      {
        key: 'distribution_status',
        labelEn: 'Status',
        labelSi: 'තත්ත්වය',
        type: 'select',
        required: true,
        defaultValue: 'Distributed',
        options: [
          { value: 'Planned', labelEn: 'Planned', labelSi: 'සැලසුම් කළ' },
          { value: 'Dispatched', labelEn: 'Dispatched', labelSi: 'පිටත් කළ' },
          { value: 'Distributed', labelEn: 'Distributed', labelSi: 'බෙදා හරින ලද' },
          { value: 'Verified', labelEn: 'Verified', labelSi: 'සත්‍යාපිත' },
        ],
      },
      { key: 'distributed_by', labelEn: 'Issuing Officer', labelSi: 'නිකුත් කළ නිලධාරී', type: 'text' },
      { key: 'remarks', labelEn: 'Notes', labelSi: 'සටහන්', type: 'textarea' },
    ],
    columns: [
      { key: 'voucher_no', labelEn: 'Voucher', labelSi: 'වවුචරය' },
      {
        key: 'family_id',
        labelEn: 'Recipient',
        labelSi: 'ප්‍රතිලාභියා',
        format: (val, _r, ds) =>
          findLabel(ds.affected_families as unknown as Record<string, unknown>[], val, (f) => String(f.head_name)),
      },
      { key: 'assistance_type', labelEn: 'Assistance Type', labelSi: 'ආධාර වර්ගය' },
      {
        key: 'value_lkr',
        labelEn: 'Value (LKR)',
        labelSi: 'වටිනාකම (රු.)',
        isNumeric: true,
        format: (val) => Number(val ?? 0).toLocaleString('en-LK'),
      },
      { key: 'distributed_date', labelEn: 'Date', labelSi: 'දිනය', isNumeric: true },
      { key: 'distribution_status', labelEn: 'Status', labelSi: 'තත්ත්වය' },
    ],
    filters: [
      {
        key: 'assistance_type',
        labelEn: 'Type',
        labelSi: 'වර්ගය',
        options: [
          { value: 'Dry Rations', labelEn: 'Dry Rations', labelSi: 'වියළි ආහාර' },
          { value: 'Cash Grant', labelEn: 'Cash Grant', labelSi: 'මුදල් ආධාර' },
          { value: 'Housing Repair Grant', labelEn: 'Housing Repair Grant', labelSi: 'නිවාස ආධාර' },
        ],
      },
      {
        key: 'distribution_status',
        labelEn: 'Status',
        labelSi: 'තත්ත්වය',
        options: [
          { value: 'Planned', labelEn: 'Planned', labelSi: 'සැලසුම්' },
          { value: 'Dispatched', labelEn: 'Dispatched', labelSi: 'පිටත් කළ' },
          { value: 'Distributed', labelEn: 'Distributed', labelSi: 'බෙදා හරින ලද' },
          { value: 'Verified', labelEn: 'Verified', labelSi: 'සත්‍යාපිත' },
        ],
      },
    ],
  },

  officers: {
    table: 'officers',
    titleEn: 'Officers & Users',
    titleSi: 'නිලධාරීන් සහ පරිශීලකයින්',
    naturalKeyField: 'username',
    defaultSortKey: 'full_name',
    searchableFields: ['username', 'full_name', 'email', 'role', 'designation', 'phone'],
    searchHintEn: 'Search by username, full name, email, role, or designation...',
    searchHintSi: 'පරිශීලක නාමය, නම, විද්‍යුත් තැපෑල, භූමිකාව හෝ තනතුර අනුව සොයන්න...',
    fields: [
      { key: 'username', labelEn: 'Username', labelSi: 'පරිශීලක නාමය', type: 'text', required: true },
      { key: 'full_name', labelEn: 'Full Name', labelSi: 'සම්පූර්ණ නම', type: 'text', required: true },
      {
        key: 'email',
        labelEn: 'Official Email (Required for Admin / Super Admin)',
        labelSi: 'විද්‍යුත් තැපෑල (Admin / Super Admin සඳහා අනිවාර්යයි)',
        type: 'text',
        placeholder: 'admin@district.gov.lk',
      },
      {
        key: 'role',
        labelEn: 'Permission Role',
        labelSi: 'අවසර භූමිකාව',
        type: 'select',
        required: true,
        defaultValue: 'gn_officer',
        options: [
          { value: 'super_admin', labelEn: 'Super Administrator', labelSi: 'ප්‍රධාන පරිපාලක' },
          { value: 'admin', labelEn: 'Administrator', labelSi: 'පරිපාලක' },
          { value: 'district_officer', labelEn: 'District Officer', labelSi: 'දිස්ත්‍රික් නිලධාරී' },
          { value: 'ds_officer', labelEn: 'DS Officer', labelSi: 'ප්‍රාදේශීය ලේකම් නිලධාරී' },
          { value: 'gn_officer', labelEn: 'GN Officer', labelSi: 'ග්‍රාම නිලධාරී' },
          { value: 'auditor_viewer', labelEn: 'Auditor (Read-Only)', labelSi: 'විගණක (කියවීම පමණි)' },
        ],
      },
      { key: 'designation', labelEn: 'Designation', labelSi: 'තනතුර', type: 'text' },
      { key: 'phone', labelEn: 'Phone', labelSi: 'දුරකථන අංකය', type: 'text' },
      {
        key: 'district_id',
        labelEn: 'Assigned District',
        labelSi: 'දිස්ත්‍රික්කය',
        type: 'relation',
        relationTable: 'districts',
        relationLabelFn: (r, lang) => (lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)),
      },
      {
        key: 'ds_id',
        labelEn: 'Assigned DS Division',
        labelSi: 'ප්‍රාදේශීය ලේකම් කොට්ඨාසය',
        type: 'relation',
        relationTable: 'divisional_secretariats',
        relationLabelFn: (r, lang) => (lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)),
      },
      {
        key: 'gn_id',
        labelEn: 'Assigned GN Division',
        labelSi: 'ග්‍රාම නිලධාරී වසම',
        type: 'relation',
        relationTable: 'gn_divisions',
        relationLabelFn: (r, lang) => (lang === 'si' && r.name_si ? String(r.name_si) : String(r.name_en)),
      },
      { key: 'password', labelEn: 'Password (min 8 chars)', labelSi: 'මුරපදය (අවම අකුරු 8)', type: 'password' },
      { key: 'is_active', labelEn: 'Account Active', labelSi: 'ගිණුම සක්‍රීයයි', type: 'boolean', defaultValue: true },
    ],
    columns: [
      { key: 'username', labelEn: 'Username', labelSi: 'පරිශීලක නාමය' },
      { key: 'full_name', labelEn: 'Full Name', labelSi: 'නම' },
      { key: 'role', labelEn: 'Role', labelSi: 'භූමිකාව' },
      { key: 'designation', labelEn: 'Designation', labelSi: 'තනතුර' },
      { key: 'phone', labelEn: 'Phone', labelSi: 'දුරකථනය' },
      {
        key: 'is_active',
        labelEn: 'Active',
        labelSi: 'සක්‍රීය',
        format: (val) => (val ? 'Active' : 'Disabled'),
      },
    ],
    filters: [
      {
        key: 'role',
        labelEn: 'Role',
        labelSi: 'භූමිකාව',
        options: [
          { value: 'super_admin', labelEn: 'Super Admin', labelSi: 'ප්‍රධාන පරිපාලක' },
          { value: 'admin', labelEn: 'Admin', labelSi: 'පරිපාලක' },
          { value: 'district_officer', labelEn: 'District Officer', labelSi: 'දිස්ත්‍රික් නිලධාරී' },
          { value: 'ds_officer', labelEn: 'DS Officer', labelSi: 'ප්‍රා.ලේ. නිලධාරී' },
          { value: 'gn_officer', labelEn: 'GN Officer', labelSi: 'ග්‍රාම නිලධාරී' },
          { value: 'auditor_viewer', labelEn: 'Auditor', labelSi: 'විගණක' },
        ],
      },
    ],
  },
};
