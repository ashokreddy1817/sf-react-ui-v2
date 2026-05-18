// src/index.ts — public API of @ashokreddy1828/sf-react-ui

// ─── Components ───────────────────────────────────────────────────────────────
export { SfProvider, useSfContext } from './components/SfProvider';
export { SfRecordForm } from './components/SfRecordForm';

// ─── Hooks ────────────────────────────────────────────────────────────────────
export {
  useObjectInfo,
  useRecord,
  usePicklistValues,
  useLookupSearch,
} from './hooks';

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  // Records & fields
  SfRecord,
  SfFieldValue,
  SfFieldMetadata,
  SfFieldInfo,       // alias for SfFieldMetadata (backwards compat)
  SfFieldDataType,
  FlsAccess,
  // Picklist
  SfPicklistValue,
  // Object info
  SfObjectInfo,
  SfRecordTypeInfo,
  // Lookup
  LookupResult,
  // Error
  SfError,
  // Context
  SfContextValue,
  SfProviderConfig,
  // Form
  SfFormMode,
  SfRecordFormProps,
  SfRecordFormRef,
  // Provider
  SfProviderProps,
} from './types';
