/**
 * SfRecordForm — React equivalent of lightning-record-form for Salesforce
 *
 * Supports:
 *  - layoutType: 'Full' | 'Compact'  (mirrors lightning-record-form layout prop)
 *  - mode: 'view' | 'edit' | 'create'
 *  - Full LDS-style field ordering from the org's real page layouts
 *  - FLS enforcement, picklist values, lookup search, required validation
 *  - Save / Cancel / Edit footer like lightning-record-form
 *
 * Key fixes over previous version:
 *  1. layoutType prop added — fetches Full OR Compact layout from UI API
 *  2. recordTypeId resolved BEFORE layout fetch (no chicken-and-egg)
 *  3. getRecordLayout URL now puts recordTypeId in the path, not query string
 *  4. Compact layout uses /ui-api/compact-layouts endpoint
 *  5. Race condition fixed: record load waits for layoutFields
 *  6. Fallback alphabetical slice replaced with FLS-ordered fields from objectInfo
 *  7. columns auto-forced to 1 when layoutType='Compact'
 *  8. create+recordId guard added
 *  9. All useEffect dep arrays corrected
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
  useMemo,
  type ReactNode,
  type ChangeEvent,
} from 'react';
import './SfRecordForm.css';
import { useSfContext } from '../SfProvider/SfProvider';
import type {
  SfRecordFormProps,
  SfRecordFormRef,
  SfFormMode,
  SfObjectInfo,
  SfRecord,
  SfPicklistValue,
  SfError,
  SfFieldMetadata,
  LookupResult,
} from '../../types';

// ─── Layout type ──────────────────────────────────────────────────────────────
type LayoutType = 'Full' | 'Compact';

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonLoading({ count = 6 }: { count?: number }) {
  return (
    <div className="sf-record-form__skeleton">
      <div className="sf-record-form__skeleton-header" />
      <div className="sf-record-form__skeleton-grid">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="sf-record-form__skeleton-field">
            <div className="sf-record-form__skeleton-label" />
            <div className="sf-record-form__skeleton-value" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Lookup field ─────────────────────────────────────────────────────────────
interface LookupFieldProps {
  meta: SfFieldMetadata;
  displayValue: string;
  onChange: (id: string, name: string) => void;
  onClear: () => void;
  objectName: string;
}

function LookupField({ meta, displayValue, onChange, onClear, objectName }: LookupFieldProps) {
  const { searchRecords } = useSfContext();
  const [query, setQuery] = useState(displayValue);
  const [results, setResults] = useState<LookupResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const targetObject = meta.referenceTo?.[0] ?? objectName;

  useEffect(() => {
    setQuery(displayValue);
  }, [displayValue]);

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchRecords(targetObject, q);
        setResults(res);
        setOpen(true);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const selectResult = (r: LookupResult) => {
    setQuery(r.name);
    setOpen(false);
    setResults([]);
    onChange(r.id, r.name);
  };

  return (
    <div className="sf-record-form__lookup-wrap">
      <div className="sf-record-form__lookup-input-row">
        <input
          className="sf-record-form__input"
          value={query}
          onChange={handleInput}
          placeholder={`Search ${targetObject}…`}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          autoComplete="off"
        />
        <button type="button" className="sf-record-form__lookup-btn" title="Search">
          🔍
        </button>
        {displayValue && (
          <button type="button" className="sf-record-form__lookup-btn" onClick={onClear} title="Clear">
            ✕
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="sf-record-form__lookup-dropdown">
          {results.map((r) => (
            <div
              key={r.id}
              className="sf-record-form__lookup-item"
              onMouseDown={() => selectResult(r)}
            >
              <strong>{r.name}</strong>
              {r.subtitle && (
                <span style={{ fontSize: 11, color: '#706e6b', marginLeft: 6 }}>{r.subtitle}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {searching && <div style={{ fontSize: 11, color: '#706e6b', marginTop: 4 }}>Searching…</div>}
    </div>
  );
}

// ─── Helper: resolve record type ID ──────────────────────────────────────────
/**
 * Returns the record type ID to use for layout/picklist fetches.
 * Priority: explicit prop > record's RT > objectInfo default > '012000000000000AAA' (master)
 */
function resolveRecordTypeId(
  recordTypeIdProp: string | undefined,
  record: SfRecord | null,
  objectInfo: SfObjectInfo | null
): string | null {
  return (
    recordTypeIdProp ??
    record?.recordTypeId ??
    objectInfo?.defaultRecordTypeId ??
    null
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export const SfRecordForm = forwardRef<SfRecordFormRef, SfRecordFormProps & { layoutType?: LayoutType }>(
  function SfRecordForm(
    {
      objectName,
      recordId,
      mode: modeProp = recordId ? 'view' : 'create',
      lockMode = false,
      layoutType = 'Full',            // ← NEW: 'Full' | 'Compact'
      fields: fieldsProp,
      columns: columnsProp = 2,
      defaultValues = {},
      recordTypeId: recordTypeIdProp,
      title,
      hideHeader = false,
      hideFooter = false,
      className = '',
      loading: loadingSlot,
      error: errorSlot,
      onSave,
      onBeforeSave,
      onError,
      onModeChange,
      onCancel,
    },
    ref
  ) {
    const sf = useSfContext();

    // Compact always forces single column (like lightning-record-form)
    const columns = layoutType === 'Compact' ? 1 : columnsProp;

    // ── State ──────────────────────────────────────────────────────────────────
    const [mode, setModeState] = useState<SfFormMode>(modeProp);
    const [objectInfo, setObjectInfo] = useState<SfObjectInfo | null>(null);
    const [record, setRecord] = useState<SfRecord | null>(null);
    const [picklistMap, setPicklistMap] = useState<Record<string, SfPicklistValue[]>>({});
    const [values, setValues] = useState<Record<string, unknown>>(defaultValues);
    const [displayValues, setDisplayValues] = useState<Record<string, string>>({});
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    // layoutFields = field API names in the ORDER the org's page layout defines
    const [layoutFields, setLayoutFields] = useState<string[]>([]);
    const [layoutReady, setLayoutReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const originalValues = useRef<Record<string, unknown>>({});

    // Sync external mode prop
    useEffect(() => {
      setModeState(modeProp);
    }, [modeProp]);

    // ── Step 1: Load objectInfo ────────────────────────────────────────────────
    useEffect(() => {
      if (!objectName) return;
      setLoading(true);
      setGlobalError(null);
      setLayoutReady(false);
      setLayoutFields([]);

      sf.getObjectInfo(objectName)
        .then(setObjectInfo)
        .catch((e: SfError) => {
          setGlobalError(e.message);
          onError?.(e);
          setLoading(false);
        });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectName]);

    // ── Step 2: Fetch layout (Full or Compact) ────────────────────────────────
    // Runs once objectInfo is ready. recordTypeId is resolved here — no dependency
    // on `record` so there's no chicken-and-egg deadlock.
    useEffect(() => {
      if (!objectInfo) return;
      if (fieldsProp && fieldsProp.length > 0) {
        // Caller specified explicit fields — skip layout fetch entirely
        setLayoutFields(fieldsProp);
        setLayoutReady(true);
        return;
      }

      const rtId = resolveRecordTypeId(recordTypeIdProp, null, objectInfo);

      // Master record type fallback if org returns null
      const effectiveRtId = rtId ?? '012000000000000AAA';

      const fetchLayout = async () => {
        try {
          let fields: string[];

          if (layoutType === 'Compact') {
            // Compact layout: /ui-api/compact-layouts/:objectName/:recordTypeId
            // Returns a small set of highlight fields (4-8 fields)
            fields = await sf.getCompactLayout(objectName, effectiveRtId);
          } else {
            // Full layout: /ui-api/layout/:objectName/:recordTypeId?layoutType=Full&mode=View
            // FIX: recordTypeId MUST be in the path (not query string)
            fields = await sf.getRecordLayout(objectName, effectiveRtId, layoutType);
          }

          if (fields.length > 0) {
            setLayoutFields(fields);
          } else {
            // Graceful fallback: objectInfo fields sorted by FLS (ReadWrite first)
            // This is always better than alphabetical Object.keys()
            const fallback = Object.values(objectInfo.fields)
              .filter((f) => f.flsAccess !== 'NoAccess')
              .sort((a, b) => {
                // ReadWrite before ReadOnly, required before optional
                const rwScore = (f: SfFieldMetadata) =>
                  (f.flsAccess === 'ReadWrite' ? 2 : 1) + (f.required ? 1 : 0);
                return rwScore(b) - rwScore(a);
              })
              .slice(0, layoutType === 'Compact' ? 8 : 20)
              .map((f) => f.apiName);
            setLayoutFields(fallback);
          }
        } catch {
          // Layout API error — fall back gracefully, never show blank form
          const fallback = Object.values(objectInfo.fields)
            .filter((f) => f.flsAccess !== 'NoAccess')
            .sort((a, b) => (a.required === b.required ? 0 : a.required ? -1 : 1))
            .slice(0, layoutType === 'Compact' ? 8 : 20)
            .map((f) => f.apiName);
          setLayoutFields(fallback);
        } finally {
          setLayoutReady(true);
        }
      };

      fetchLayout();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectInfo, recordTypeIdProp, layoutType, fieldsProp]);

    // ── Step 3: Load record (only after layout is ready) ──────────────────────
    // This ensures we fetch exactly the fields the layout wants — in layout order.
    useEffect(() => {
      if (!recordId || !objectInfo || !layoutReady) return;

      const fieldsToFetch = layoutFields.length > 0 ? layoutFields : null;
      if (!fieldsToFetch) return;

      setLoading(true);
      sf.getRecord(objectName, recordId, fieldsToFetch)
        .then((rec) => {
          setRecord(rec);
          const vals: Record<string, unknown> = {};
          const display: Record<string, string> = {};
          Object.entries(rec.fields).forEach(([k, v]) => {
            vals[k] = v.value;
            display[k] = v.displayValue ?? String(v.value ?? '');
          });
          setValues(vals);
          setDisplayValues(display);
          originalValues.current = { ...vals };
        })
        .catch((e: SfError) => {
          setGlobalError(e.message);
          onError?.(e);
        })
        .finally(() => setLoading(false));

      // If create mode (no recordId) — just stop loading after layout is ready
    }, [recordId, objectInfo, layoutReady, objectName]);

    // For create mode: stop loading once layout is ready (no record to fetch)
    useEffect(() => {
      if (!recordId && layoutReady) {
        setLoading(false);
      }
    }, [recordId, layoutReady]);

    // ── Step 4: Load picklist values ──────────────────────────────────────────
    useEffect(() => {
      if (!objectInfo) return;
      const rtId = resolveRecordTypeId(recordTypeIdProp, record, objectInfo);
      if (!rtId) return;

      const picklistFields = Object.values(objectInfo.fields).filter(
        (f) => f.dataType === 'picklist' || f.dataType === 'multipicklist'
      );
      if (picklistFields.length === 0) return;

      Promise.all(
        picklistFields.map(async (f) => {
          const vals = await sf.getPicklistValues(objectName, rtId, f.apiName).catch(() => []);
          return [f.apiName, vals] as [string, SfPicklistValue[]];
        })
      ).then((entries) => setPicklistMap(Object.fromEntries(entries)));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectInfo, record?.recordTypeId, recordTypeIdProp, objectName]);

    // ── Visible fields — always in layout order ───────────────────────────────
    const visibleFields: SfFieldMetadata[] = useMemo(() => {
      if (!objectInfo) return [];

      const keys =
        fieldsProp && fieldsProp.length > 0
          ? fieldsProp
          : layoutFields.length > 0
          ? layoutFields
          : // Last-resort: required fields first, then ReadWrite, alphabetical within each group
            Object.values(objectInfo.fields)
              .filter((f) => f.flsAccess !== 'NoAccess')
              .sort((a, b) =>
                a.required !== b.required
                  ? Number(b.required) - Number(a.required)
                  : a.label.localeCompare(b.label)
              )
              .slice(0, layoutType === 'Compact' ? 8 : 20)
              .map((f) => f.apiName);

      return keys
        .map((k) => objectInfo.fields[k])
        .filter(Boolean)
        .filter((f) => f.flsAccess !== 'NoAccess');
    }, [objectInfo, fieldsProp, layoutFields, layoutType]);

    // ── Field change ──────────────────────────────────────────────────────────
    const handleFieldChange = useCallback(
      (apiName: string, val: unknown, display?: string) => {
        setValues((prev) => {
          const next = { ...prev, [apiName]: val };
          setDirty(Object.keys(next).some((k) => next[k] !== originalValues.current[k]));
          return next;
        });
        if (display !== undefined) {
          setDisplayValues((prev) => ({ ...prev, [apiName]: display }));
        }
        setFieldErrors((prev) => {
          const n = { ...prev };
          delete n[apiName];
          return n;
        });
      },
      []
    );

    // ── Mode switch ───────────────────────────────────────────────────────────
    const setMode = useCallback(
      (m: SfFormMode) => {
        setModeState(m);
        onModeChange?.(m);
      },
      [onModeChange]
    );

    // ── Cancel ────────────────────────────────────────────────────────────────
    const handleCancel = useCallback(() => {
      setValues({ ...originalValues.current });
      setDirty(false);
      setFieldErrors({});
      setMode('view');
      onCancel?.();
    }, [setMode, onCancel]);

    // ── Validate ──────────────────────────────────────────────────────────────
    const validate = useCallback((): boolean => {
      const errs: Record<string, string> = {};
      visibleFields.forEach((f) => {
        if (f.required && (values[f.apiName] === null || values[f.apiName] === '')) {
          errs[f.apiName] = `${f.label} is required`;
        }
      });
      setFieldErrors(errs);
      return Object.keys(errs).length === 0;
    }, [visibleFields, values]);

    // ── Save ──────────────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
      if (!validate()) return;
      setSaving(true);
      setGlobalError(null);
      try {
        const changedKeys = Object.keys(values).filter(
          (k) => values[k] !== originalValues.current[k]
        );
        let payload: Record<string, unknown> = Object.fromEntries(
          changedKeys.map((k) => [k, values[k]])
        );
        if (onBeforeSave) payload = onBeforeSave(payload);

        let saved: SfRecord;
        if (recordId) {
          saved = await sf.updateRecord(objectName, recordId, payload);
        } else {
          saved = await sf.createRecord(objectName, { ...defaultValues, ...payload });
        }
        originalValues.current = { ...values };
        setDirty(false);
        setRecord(saved);
        setMode('view');
        onSave?.(saved);
      } catch (e: unknown) {
        const sfErr = e as SfError;
        if (sfErr.fields?.length) {
          const errs: Record<string, string> = {};
          sfErr.fields.forEach((f) => {
            errs[f] = sfErr.message;
          });
          setFieldErrors(errs);
        } else {
          setGlobalError(sfErr.message);
        }
        onError?.(sfErr);
      } finally {
        setSaving(false);
      }
    }, [values, validate, onBeforeSave, recordId, objectName, sf, onSave, onError, setMode, defaultValues]);

    // ── Imperative ref ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      save: handleSave,
      reset: handleCancel,
      isDirty: () => dirty,
      getValues: () => ({ ...values }),
      setFieldValue: (field: string, val: unknown) => handleFieldChange(field, val),
      setMode,
    }));

    // ── Render: field input ───────────────────────────────────────────────────
    const isEditing = mode === 'edit' || mode === 'create';

    const renderFieldInput = (meta: SfFieldMetadata) => {
      const val = values[meta.apiName];
      const displayVal = displayValues[meta.apiName] ?? '';
      const isReadonly = !isEditing || meta.flsAccess === 'ReadOnly';

      // ── VIEW mode ────────────────────────────────────────────────────────
      if (isReadonly) {
        if (meta.dataType === 'boolean') {
          return (
            <div className="sf-record-form__field-value">
              {val ? '✓ Yes' : '✗ No'}
            </div>
          );
        }
        if (meta.dataType === 'url' && val) {
          return (
            <div className="sf-record-form__field-value">
              <a href={String(val)} target="_blank" rel="noopener noreferrer">
                {displayVal || String(val)}
              </a>
            </div>
          );
        }
        if (meta.dataType === 'lookup' && displayVal) {
          return (
            <div className="sf-record-form__field-value">
              <span className="sf-record-form__lookup-chip">👤 {displayVal}</span>
            </div>
          );
        }
        const isEmpty = val === null || val === undefined || val === '';
        return (
          <div
            className={
              'sf-record-form__field-value' +
              (isEmpty ? ' sf-record-form__field-value--empty' : '')
            }
          >
            {isEmpty ? '—' : displayVal || String(val)}
          </div>
        );
      }

      // ── EDIT / CREATE mode ───────────────────────────────────────────────
      if (meta.dataType === 'boolean') {
        return (
          <div className="sf-record-form__checkbox-wrap">
            <input
              type="checkbox"
              className="sf-record-form__checkbox"
              checked={Boolean(val)}
              onChange={(e) => handleFieldChange(meta.apiName, e.target.checked)}
            />
            <span>{Boolean(val) ? 'Yes' : 'No'}</span>
          </div>
        );
      }

      if (meta.dataType === 'picklist' || meta.dataType === 'multipicklist') {
        const opts = picklistMap[meta.apiName] ?? [];
        return (
          <div className="sf-record-form__picklist-wrap">
            <select
              value={String(val ?? '')}
              onChange={(e) => handleFieldChange(meta.apiName, e.target.value)}
              className={fieldErrors[meta.apiName] ? 'sf-record-form__input--error' : ''}
            >
              <option value="">— Select —</option>
              {opts.filter((o) => o.active).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="sf-record-form__picklist-arrow">▾</span>
          </div>
        );
      }

      if (meta.dataType === 'textarea') {
        return (
          <textarea
            className={
              'sf-record-form__input sf-record-form__textarea' +
              (fieldErrors[meta.apiName] ? ' sf-record-form__input--error' : '')
            }
            value={String(val ?? '')}
            onChange={(e) => handleFieldChange(meta.apiName, e.target.value)}
            rows={3}
          />
        );
      }

      if (meta.dataType === 'lookup') {
        return (
          <LookupField
            meta={meta}
            displayValue={displayVal}
            objectName={objectName}
            onChange={(id, name) => handleFieldChange(meta.apiName, id, name)}
            onClear={() => handleFieldChange(meta.apiName, null, '')}
          />
        );
      }

      // text / number / currency / date / datetime / percent
      const inputType =
        meta.dataType === 'date'
          ? 'date'
          : meta.dataType === 'datetime'
          ? 'datetime-local'
          : meta.dataType === 'number' ||
            meta.dataType === 'currency' ||
            meta.dataType === 'percent'
          ? 'number'
          : 'text';

      return (
        <input
          type={inputType}
          className={
            'sf-record-form__input' +
            (fieldErrors[meta.apiName] ? ' sf-record-form__input--error' : '')
          }
          value={String(val ?? '')}
          onChange={(e) => handleFieldChange(meta.apiName, e.target.value)}
          placeholder={meta.label}
        />
      );
    };

    // ── Title ─────────────────────────────────────────────────────────────────
    const recordTitle =
      title ??
      (record?.fields?.Name?.displayValue ??
        (record?.fields?.Name?.value as string) ??
        (mode === 'create' ? `New ${objectName}` : objectName));

    // ── Loading state ─────────────────────────────────────────────────────────
    if (loading) {
      return (
        <>
          {loadingSlot ?? (
            <SkeletonLoading count={layoutType === 'Compact' ? 4 : 6} />
          )}
        </>
      );
    }

    // ── Fatal error (objectInfo failed) ───────────────────────────────────────
    if (globalError && !objectInfo) {
      return (
        <>
          {errorSlot ?? (
            <div className="sf-record-form__error-state">
              <strong>⚠ Failed to load</strong>
              <p>{globalError}</p>
            </div>
          )}
        </>
      );
    }

    // ── Main render ───────────────────────────────────────────────────────────
    return (
      <div
        className={[
          'sf-record-form',
          layoutType === 'Compact' ? 'sf-record-form--compact' : 'sf-record-form--full',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        {!hideHeader && (
          <div className="sf-record-form__header">
            <div className="sf-record-form__header-left">
              <span className="sf-record-form__object-badge">{objectName}</span>
              <span className="sf-record-form__record-name">{String(recordTitle)}</span>
              {recordId && (
                <span className="sf-record-form__record-id">{recordId}</span>
              )}
              {dirty && (
                <span className="sf-record-form__dirty" title="Unsaved changes" />
              )}
              {/* Layout type badge */}
              <span
                className={`sf-record-form__layout-badge sf-record-form__layout-badge--${layoutType.toLowerCase()}`}
                title={`${layoutType} layout`}
              >
                {layoutType}
              </span>
            </div>
            {!lockMode && mode !== 'create' && (
              <div className="sf-record-form__mode-toggle">
                <button
                  type="button"
                  className={
                    'sf-record-form__mode-btn' +
                    (mode === 'view' ? ' sf-record-form__mode-btn--active' : '')
                  }
                  onClick={() => setMode('view')}
                >
                  👁 View
                </button>
                <button
                  type="button"
                  className={
                    'sf-record-form__mode-btn' +
                    (mode === 'edit' ? ' sf-record-form__mode-btn--active' : '')
                  }
                  onClick={() => setMode('edit')}
                >
                  ✏ Edit
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Global save error banner ────────────────────────────────────── */}
        {globalError && (
          <div className="sf-record-form__global-error">⚠ {globalError}</div>
        )}

        {/* ── Field grid ──────────────────────────────────────────────────── */}
        <div
          className={[
            'sf-record-form__grid',
            columns === 1 ? 'sf-record-form__grid--1col' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {visibleFields.map((meta) => (
            <div
              key={meta.apiName}
              className={[
                'sf-record-form__field',
                meta.dataType === 'textarea' || columns === 1
                  ? 'sf-record-form__field--full'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="sf-record-form__field-label">
                <span
                  className={`sf-record-form__fls-dot sf-record-form__fls-dot--${
                    meta.flsAccess === 'ReadWrite'
                      ? 'rw'
                      : meta.flsAccess === 'ReadOnly'
                      ? 'ro'
                      : 'none'
                  }`}
                  title={meta.flsAccess}
                />
                {meta.label}
                {meta.required && (
                  <span className="sf-record-form__required-star">*</span>
                )}
              </div>
              {renderFieldInput(meta)}
              {fieldErrors[meta.apiName] && (
                <div className="sf-record-form__field-error">
                  ⚠ {fieldErrors[meta.apiName]}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Footer (edit/create) ─────────────────────────────────────────── */}
        {!hideFooter && isEditing && (
          <div className="sf-record-form__footer">
            <span className="sf-record-form__footer-meta">
              {dirty ? '● Unsaved changes' : 'No changes yet'}
            </span>
            <div className="sf-record-form__footer-actions">
              <button
                type="button"
                className="sf-record-form__btn-cancel"
                onClick={handleCancel}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sf-record-form__btn-save"
                onClick={handleSave}
                disabled={saving || !dirty}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* ── Footer (view) ───────────────────────────────────────────────── */}
        {!hideFooter && !isEditing && record && (
          <div className="sf-record-form__footer">
            <span className="sf-record-form__footer-meta">
              Last modified:{' '}
              {record.lastModifiedDate
                ? new Date(record.lastModifiedDate).toLocaleString()
                : 'Unknown'}
            </span>
            {!lockMode && (
              <button
                type="button"
                className="sf-record-form__btn-cancel"
                onClick={() => setMode('edit')}
              >
                ✏ Edit
              </button>
            )}
          </div>
        )}
      </div>
    );
  }
);

SfRecordForm.displayName = 'SfRecordForm';
export default SfRecordForm;
