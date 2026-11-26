export type Language = 'en' | 'si';

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'district_officer'
  | 'ds_officer'
  | 'gn_officer'
  | 'auditor_viewer';

export type ModuleKey =
  | 'dashboard'
  | 'disasters'
  | 'districts'
  | 'divisional_secretariats'
  | 'gn_divisions'
  | 'affected_families'
  | 'affected_persons'
  | 'house_damages'
  | 'relief_assistance'
  | 'officers'
  | 'audit_logs'
  | 'reports'
  | 'map'
  | 'sync_center';

export type DataTableKey =
  | 'districts'
  | 'divisional_secretariats'
  | 'gn_divisions'
  | 'officers'
  | 'disasters'
  | 'affected_families'
  | 'affected_persons'
  | 'house_damages'
  | 'relief_assistance';

export interface BaseRecord {
  id: string;
  version: number;
  device_id: string;
  updated_by?: string | null;
  legacy_source_id?: string | null;
  legacy_extra_data?: Record<string, unknown>;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface District extends BaseRecord {
  district_code: string;
  name_en: string;
  name_si: string;
  province: string;
}

export interface DivisionalSecretariat extends BaseRecord {
  ds_code: string;
  district_id: string;
  name_en: string;
  name_si: string;
}

export interface GNDivision extends BaseRecord {
  gn_code: string;
  gn_number: string;
  ds_id: string;
  name_en: string;
  name_si: string;
}

export interface Officer extends BaseRecord {
  username: string;
  email: string;
  email_verified?: boolean;
  password_hash?: string;
  full_name: string;
  role: UserRole;
  designation: string;
  phone: string;
  district_id?: string | null;
  ds_id?: string | null;
  gn_id?: string | null;
  is_active: boolean;
}

export interface Disaster extends BaseRecord {
  disaster_code: string;
  title: string;
  disaster_type: string;
  severity: 'Low' | 'Moderate' | 'High' | 'Critical';
  start_date: string;
  end_date?: string | null;
  status: 'Active' | 'Monitoring' | 'Relief Phase' | 'Closed';
  district_id?: string | null;
  ds_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  description: string;
}

export interface AffectedFamily extends BaseRecord {
  family_ref_no: string;
  disaster_id: string;
  district_id?: string | null;
  ds_id?: string | null;
  gn_id?: string | null;
  head_name: string;
  head_nic: string;
  phone: string;
  address: string;
  total_members: number;
  displacement_status: 'At Home' | 'With Relatives' | 'Safety Centre' | 'Relocated';
  latitude?: number | null;
  longitude?: number | null;
  needs_summary: string;
}

export interface AffectedPerson extends BaseRecord {
  person_ref_no: string;
  family_id: string;
  disaster_id: string;
  full_name: string;
  nic_or_bc: string;
  age: number | null;
  gender: 'Male' | 'Female' | 'Other';
  relationship_to_head: string;
  vulnerability: string;
  health_status: string;
  photo_url?: string | null;
}

export interface HouseDamage extends BaseRecord {
  assessment_no: string;
  disaster_id: string;
  family_id: string;
  gn_id?: string | null;
  damage_level: 'Fully Damaged' | 'Partially Damaged - Severe' | 'Partially Damaged - Minor';
  estimated_loss_lkr: number;
  inspection_date: string;
  inspector_name: string;
  verification_status: 'Pending' | 'Field Verified' | 'DS Approved' | 'District Approved';
  remarks: string;
  photos?: string[];
}

export interface ReliefAssistance extends BaseRecord {
  voucher_no: string;
  disaster_id: string;
  family_id: string;
  gn_id?: string | null;
  assistance_type: string;
  quantity_unit: string;
  value_lkr: number;
  distributed_date: string;
  distribution_status: 'Planned' | 'Dispatched' | 'Distributed' | 'Verified';
  distributed_by: string;
  remarks: string;
}

export interface RecordSnapshot {
  id: string;
  entity_table: DataTableKey;
  record_id: string;
  snapshot_reason: string;
  snapshot_data: Record<string, unknown>;
  created_by?: string | null;
  device_id: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id?: string | null;
  actor_username: string;
  action: string;
  entity_table: string;
  record_id?: string | null;
  device_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export type AnyEntityRecord =
  | District
  | DivisionalSecretariat
  | GNDivision
  | Officer
  | Disaster
  | AffectedFamily
  | AffectedPerson
  | HouseDamage
  | ReliefAssistance;

export type DmisDataset = {
  districts: District[];
  divisional_secretariats: DivisionalSecretariat[];
  gn_divisions: GNDivision[];
  officers: Officer[];
  disasters: Disaster[];
  affected_families: AffectedFamily[];
  affected_persons: AffectedPerson[];
  house_damages: HouseDamage[];
  relief_assistance: ReliefAssistance[];
};

export interface OfflineMutation {
  mutation_id: string;
  table: DataTableKey;
  action: 'upsert' | 'soft_delete';
  record_id: string;
  payload: Record<string, unknown>;
  queued_at: string;
  device_id: string;
}

export interface MergeConflict {
  conflict_id: string;
  table: DataTableKey;
  record_id: string;
  conflict_type: 'version_divergence' | 'duplicate_natural_key';
  natural_key_label?: string;
  existing_record: Record<string, unknown>;
  incoming_record: Record<string, unknown>;
  differing_fields: string[];
}

export type ConflictResolutionStrategy =
  | 'keep_existing'
  | 'use_incoming'
  | 'keep_both'
  | 'field_merge';

export interface MergeResolutionItem {
  conflict_id: string;
  strategy: ConflictResolutionStrategy;
  merged_record?: Record<string, unknown>;
}

export interface SyncPackage {
  format: 'dmis-sync-package';
  schema_version: number;
  exported_at: string;
  source_device_id: string;
  source_label: string;
  checksum: string;
  tables: Partial<DmisDataset>;
}

export interface AuthUser {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  designation: string;
  district_id?: string | null;
  ds_id?: string | null;
  gn_id?: string | null;
  auth_mode: 'supabase_server' | 'offline_local';
}

export const ADMIN_ONLY_MODULES: readonly ModuleKey[] = [
  'relief_assistance',
  'districts',
  'divisional_secretariats',
  'gn_divisions',
  'officers',
  'audit_logs',
  'sync_center',
];

export function isAdminRole(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin';
}

export function canAccessModule(role: UserRole, module: ModuleKey): boolean {
  if ((ADMIN_ONLY_MODULES as readonly string[]).includes(module)) {
    return isAdminRole(role);
  }
  return true;
}

export const ROLE_PERMISSIONS: Record<
  UserRole,
  {
    canManageUsers: boolean;
    canManageDivisions: boolean;
    canManageDisasters: boolean;
    canEditFieldData: boolean;
    canBackupRestore: boolean;
    canMergeDevices: boolean;
    canDeleteRecords: boolean;
    canPrintReports: boolean;
  }
> = {
  super_admin: {
    canManageUsers: true,
    canManageDivisions: true,
    canManageDisasters: true,
    canEditFieldData: true,
    canBackupRestore: true,
    canMergeDevices: true,
    canDeleteRecords: true,
    canPrintReports: true,
  },
  admin: {
    canManageUsers: true,
    canManageDivisions: true,
    canManageDisasters: true,
    canEditFieldData: true,
    canBackupRestore: true,
    canMergeDevices: true,
    canDeleteRecords: true,
    canPrintReports: true,
  },
  district_officer: {
    canManageUsers: false,
    canManageDivisions: false,
    canManageDisasters: true,
    canEditFieldData: true,
    canBackupRestore: false,
    canMergeDevices: false,
    canDeleteRecords: true,
    canPrintReports: true,
  },
  ds_officer: {
    canManageUsers: false,
    canManageDivisions: false,
    canManageDisasters: false,
    canEditFieldData: true,
    canBackupRestore: false,
    canMergeDevices: false,
    canDeleteRecords: false,
    canPrintReports: true,
  },
  gn_officer: {
    canManageUsers: false,
    canManageDivisions: false,
    canManageDisasters: false,
    canEditFieldData: true,
    canBackupRestore: false,
    canMergeDevices: false,
    canDeleteRecords: false,
    canPrintReports: true,
  },
  auditor_viewer: {
    canManageUsers: false,
    canManageDivisions: false,
    canManageDisasters: false,
    canEditFieldData: false,
    canBackupRestore: false,
    canMergeDevices: false,
    canDeleteRecords: false,
    canPrintReports: true,
  },
};
