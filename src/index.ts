// src/index.ts — library entry point

// ─── Components ───────────────────────────────────────────────────────────────
export { SfProvider, useSfContext } from './components/SfProvider/SfProvider';
export { SfRecordForm }             from './components/SfRecordForm/SfRecordForm';
export { SfDataTable }              from './components/SfDataTable/SfDataTable';
export { SfLookupField }            from './components/SfLookupField/SfLookupField';
export { SfPicklistSelect }         from './components/SfPicklistSelect/SfPicklistSelect';
export { SfRelatedList }            from './components/SfRelatedList/SfRelatedList';

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  // Layout
  LayoutType,
  LayoutMode,

  // Context
  SfContextValue,
  SfProviderConfig,
  SfProviderProps,

  // Records
  SfRecord,
  SfFieldValue,
  SfError,
  SfFormMode,

  // Object / field metadata
  SfObjectInfo,
  SfFieldMetadata,
  SfFieldInfo,
  SfFieldDataType,
  SfPicklistValue,
  SfRecordTypeInfo,
  FlsAccess,

  // Record form
  SfRecordFormProps,
  SfRecordFormRef,

  // Data table
  SfDataTableProps,
  SfColumnDef,
  SfColumnType,
  SfRowAction,
  BadgeVariant,

  // Lookup
  LookupResult,
  SfLookupFieldProps,

  // Picklist
  SfPicklistSelectProps,

  // Related list
  SfRelatedListProps,
  SfRelatedListInfo,
} from './types';