// src/types/index.ts  — single source of truth for all library types

import type { ReactNode } from 'react';

// ─── Field-level security ─────────────────────────────────────────────────────
export type FlsAccess = 'ReadWrite' | 'ReadOnly' | 'NoAccess';

// ─── Layout types ─────────────────────────────────────────────────────────────
export type LayoutType = 'Full' | 'Compact';
export type LayoutMode = 'View' | 'Edit' | 'Create';

// ─── Field value ──────────────────────────────────────────────────────────────
export interface SfFieldValue {
  value: string | number | boolean | null;
  displayValue: string | null;
}

// ─── Record ───────────────────────────────────────────────────────────────────
export interface SfRecord {
  id: string;
  apiName: string;
  recordTypeId?: string;
  lastModifiedById?: string;
  lastModifiedDate?: string;
  fields: Record<string, SfFieldValue>;
}

// ─── Error ────────────────────────────────────────────────────────────────────
export interface SfError {
  message: string;
  statusCode?: number;
  errorCode?: string;
  fields?: string[];
}

// ─── Field metadata ───────────────────────────────────────────────────────────
export type SfFieldDataType =
  | 'string' | 'textarea' | 'boolean'
  | 'int' | 'double' | 'number' | 'currency' | 'percent'
  | 'date' | 'datetime' | 'email' | 'phone' | 'url'
  | 'picklist' | 'multipicklist' | 'lookup' | 'id'
  | string;

export interface SfFieldMetadata {
  apiName: string;
  label: string;
  dataType: SfFieldDataType;
  required: boolean;
  updateable: boolean;
  createable: boolean;
  flsAccess: FlsAccess;
  referenceTo?: string[];
  relationshipName?: string;
  picklistValues?: SfPicklistValue[];
}

export type SfFieldInfo = SfFieldMetadata;

// ─── Picklist ─────────────────────────────────────────────────────────────────
export interface SfPicklistValue {
  label: string;
  value: string;
  active: boolean;
  validFor?: string[];
}

// ─── Record type ──────────────────────────────────────────────────────────────
export interface SfRecordTypeInfo {
  recordTypeId: string;
  name: string;
  available: boolean;
  defaultRecordTypeMapping: boolean;
}

// ─── Object info ──────────────────────────────────────────────────────────────
export interface SfObjectInfo {
  apiName: string;
  label: string;
  labelPlural: string;
  keyPrefix?: string;
  defaultRecordTypeId: string;
  recordTypeInfos: Record<string, SfRecordTypeInfo>;
  fields: Record<string, SfFieldMetadata>;
}

// ─── Lookup result ────────────────────────────────────────────────────────────
export interface LookupResult {
  id: string;
  name: string;
  subtitle?: string;
}

// ─── Related list info ────────────────────────────────────────────────────────
export interface SfRelatedListInfo {
  id: string;
  label: string;
  columns: string[];
}

// ─── Context ──────────────────────────────────────────────────────────────────
export interface SfProviderConfig {
  orgUrl: string;
  apiVersion?: string;
  accessToken?: string;
  onAuthError?: () => void;
}

export interface SfContextValue {
  config: SfProviderConfig;
  getObjectInfo: (objectName: string) => Promise<SfObjectInfo>;
  getRecord: (objectName: string, recordId: string, fields: string[]) => Promise<SfRecord>;
  getRecordLayout: (objectName: string, recordTypeId: string, layoutType?: LayoutType, mode?: LayoutMode) => Promise<string[]>;
  getCompactLayout: (objectName: string, recordTypeId: string) => Promise<string[]>;
  createRecord: (objectName: string, data: Record<string, unknown>) => Promise<SfRecord>;
  updateRecord: (objectName: string, recordId: string, data: Record<string, unknown>) => Promise<SfRecord>;
  getPicklistValues: (objectName: string, recordTypeId: string, fieldName: string) => Promise<SfPicklistValue[]>;
  searchRecords: (objectName: string, query: string, limit?: number) => Promise<LookupResult[]>;
  getRelatedListInfo: (parentObjectName: string, relatedListId: string) => Promise<SfRelatedListInfo>;
  getRelatedListRecords: (parentRecordId: string, relatedListId: string, fields: string[]) => Promise<Record<string, unknown>[]>;
}

// ─── SfRecordForm ─────────────────────────────────────────────────────────────
export type SfFormMode = 'view' | 'edit' | 'create';

export interface SfRecordFormProps {
  objectName: string;
  recordId?: string;
  mode?: SfFormMode;
  layoutType?: LayoutType;
  fields?: string[];
  columns?: 1 | 2;
  lockMode?: boolean;
  hideFooter?: boolean;
  hideHeader?: boolean;
  title?: string;
  defaultValues?: Record<string, unknown>;
  recordTypeId?: string;
  loading?: ReactNode;
  error?: ReactNode;
  className?: string;
  onSave?: (record: SfRecord) => void;
  onBeforeSave?: (data: Record<string, unknown>) => Record<string, unknown>;
  onError?: (error: SfError) => void;
  onModeChange?: (mode: SfFormMode) => void;
  onCancel?: () => void;
}

export interface SfRecordFormRef {
  save: () => void;
  reset: () => void;
  isDirty: () => boolean;
  getValues: () => Record<string, unknown>;
  setFieldValue: (field: string, value: unknown) => void;
  setMode: (mode: SfFormMode) => void;
}

// ─── SfProvider ───────────────────────────────────────────────────────────────
export interface SfProviderProps {
  orgUrl: string;
  accessToken?: string;
  apiVersion?: string;
  onAuthError?: () => void;
  children: ReactNode;
}

// ─── SfDataTable ──────────────────────────────────────────────────────────────
export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default';

export type SfColumnType =
  | 'string' | 'number' | 'currency' | 'percent'
  | 'date' | 'datetime' | 'boolean'
  | 'email' | 'phone' | 'url';

export interface SfColumnDef {
  fieldName: string;
  label: string;
  type?: SfColumnType;
  badge?: Record<string, BadgeVariant> | ((value: unknown) => BadgeVariant);
  primary?: boolean;
  sortable?: boolean;
  width?: string;
}

export interface SfRowAction {
  name: string;
  label: string;
  variant?: 'default' | 'destructive';
}

export interface SfDataTableProps {
  objectApiName?: string;
  title?: string;
  columns: SfColumnDef[];
  records: Record<string, unknown>[];
  keyField?: string;
  sortable?: boolean;
  filterable?: boolean;
  striped?: boolean;
  loading?: boolean;
  actions?: SfRowAction[];
  onRowAction?: (actionName: string, row: Record<string, unknown>) => void;
  selectedRows?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  emptyMessage?: string;
}

// ─── SfLookupField ────────────────────────────────────────────────────────────
export interface SfLookupFieldProps {
  objectApiName: string;
  fieldApiName?: string;
  label?: string;
  value?: string;
  displayValue?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  debounceMs?: number;
  minChars?: number;
  maxResults?: number;
  subtitle?: string;
  onChange?: (id: string, name: string, result: LookupResult | undefined) => void;
  onClear?: () => void;
  onError?: (error: { message: string }) => void;
  className?: string;
}

// ─── SfPicklistSelect ─────────────────────────────────────────────────────────
export interface SfPicklistSelectProps {
  objectApiName: string;
  fieldApiName: string;
  recordTypeId?: string;
  label?: string;
  value?: string | string[];
  multiple?: boolean;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  filterByController?: string | null;
  onChange?: (value: string | string[], values: string[]) => void;
  onError?: (error: { message: string }) => void;
  className?: string;
}

// ─── SfRelatedList ────────────────────────────────────────────────────────────
export interface SfRelatedListProps {
  parentRecordId: string;
  parentObjectName: string;
  relatedListId: string;
  columns?: string[];
  title?: string;
  pageSize?: number;
  sortable?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  actions?: SfRowAction[];
  showNewButton?: boolean;
  newButtonLabel?: string;
  onRowAction?: (actionName: string, row: Record<string, unknown>) => void;
  onNew?: () => void;
  onError?: (error: { message: string }) => void;
  className?: string;
}