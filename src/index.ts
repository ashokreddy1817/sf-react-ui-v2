// src/index.ts — library entry point  (Week 1–3 components)

// ─── Components ───────────────────────────────────────────────────────────────
export { SfProvider, useSfContext }    from './components/SfProvider/SfProvider';
export { SfRecordForm }                from './components/SfRecordForm/SfRecordForm';
export { SfDataTable }                 from './components/SfDataTable/SfDataTable';
export { SfLookupField }               from './components/SfLookupField/SfLookupField';
export { SfPicklistSelect }            from './components/SfPicklistSelect/SfPicklistSelect';
export { SfRelatedList }               from './components/SfRelatedList/SfRelatedList';
export { SfStatusBadge }               from './components/SfStatusBadge/SfStatusBadge';
export { SfRecordCard }                from './components/SfRecordCard/SfRecordCard';
export { SfChart }                     from './components/SfChart/SfChart';
export { SfTimeline }                  from './components/SfTimeline/SfTimeline';

// ─── Hooks ────────────────────────────────────────────────────────────────────
export { useObjectInfo, useRecord, usePicklistValues, useLookupSearch } from './hooks';

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  // Layout
  LayoutType, LayoutMode,

  // Context
  SfContextValue, SfProviderConfig, SfProviderProps,

  // Records
  SfRecord, SfFieldValue, SfError, SfFormMode,

  // Object / field metadata
  SfObjectInfo, SfFieldMetadata, SfFieldInfo,
  SfFieldDataType, SfPicklistValue, SfRecordTypeInfo, FlsAccess,

  // Record form
  SfRecordFormProps, SfRecordFormRef,

  // Data table
  SfDataTableProps, SfColumnDef, SfColumnType, SfRowAction, BadgeVariant,

  // Lookup
  LookupResult, SfLookupFieldProps,

  // Picklist
  SfPicklistSelectProps,

  // Related list
  SfRelatedListProps, SfRelatedListInfo,

  // Week 3 — Display components
  SfStatusBadgeProps, SfBadgeColor,
  SfRecordCardProps, SfRecordCardLayout,
  SfChartProps, SfChartType, SfAggregateType,
  SfTimelineProps, SfTimelineItem, SfActivityType,
} from './types';
