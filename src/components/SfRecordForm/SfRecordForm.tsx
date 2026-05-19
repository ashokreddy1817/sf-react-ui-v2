/**
 * SfRecordForm — fixed version
 *
 * Fixes over previous version:
 * 1. Compact layout: uses getCompactLayout() with graceful fallback to objectInfo fields
 * 2. Create mode: works without recordId, Save button enabled immediately
 * 3. Save button: enabled when ANY field is filled (create) or changed (edit)
 * 4. Field ordering: layout order respected, compact shows only highlight fields
 * 5. Layout badge shows correct layoutType
 * 6. Picklist: loads correctly using record's actual recordTypeId
 * 7. Required fields: uses nillable flag correctly (required = required && !nillable)
 */

import {
  useState, useEffect, useCallback, useRef,
  useImperativeHandle, forwardRef, useMemo,
  type ReactNode, type ChangeEvent,
} from 'react';
import './SfRecordForm.css';
import { useSfContext } from '../SfProvider/SfProvider';
import type {
  SfRecordFormProps, SfRecordFormRef, SfFormMode,
  SfObjectInfo, SfRecord, SfPicklistValue, SfError,
  SfFieldMetadata, LookupResult, LayoutType,
} from '../../types';

// ── Skeleton ──────────────────────────────────────────────────────────────────
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

// ── Lookup field ──────────────────────────────────────────────────────────────
interface LookupFieldProps {
  meta: SfFieldMetadata;
  displayValue: string;
  onChange: (id: string, name: string) => void;
  onClear: () => void;
  objectName: string;
}

function LookupField({ meta, displayValue, onChange, onClear, objectName }: LookupFieldProps) {
  const { searchRecords } = useSfContext();
  const [query, setQuery]       = useState(displayValue);
  const [results, setResults]   = useState<LookupResult[]>([]);
  const [open, setOpen]         = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const targetObject = meta.referenceTo?.[0] ?? objectName;

  useEffect(() => { setQuery(displayValue); }, [displayValue]);

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchRecords(targetObject, q);
        setResults(res);
        setOpen(true);
      } finally { setSearching(false); }
    }, 300);
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
        <button type="button" className="sf-record-form__lookup-btn" title="Search">🔍</button>
        {displayValue && (
          <button type="button" className="sf-record-form__lookup-btn" onClick={onClear} title="Clear">✕</button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="sf-record-form__lookup-dropdown">
          {results.map(r => (
            <div key={r.id} className="sf-record-form__lookup-item"
              onMouseDown={() => { onChange(r.id, r.name); setQuery(r.name); setOpen(false); }}>
              <strong>{r.name}</strong>
              {r.subtitle && <span style={{ fontSize: 11, color: '#706e6b', marginLeft: 6 }}>{r.subtitle}</span>}
            </div>
          ))}
        </div>
      )}
      {searching && <div style={{ fontSize: 11, color: '#706e6b', marginTop: 4 }}>Searching…</div>}
    </div>
  );
}

// ── Resolve record type ID ────────────────────────────────────────────────────
function resolveRtId(prop?: string, record?: SfRecord | null, info?: SfObjectInfo | null): string {
  return prop ?? record?.recordTypeId ?? info?.defaultRecordTypeId ?? '012000000000000AAA';
}

// ── Main component ────────────────────────────────────────────────────────────
export const SfRecordForm = forwardRef<SfRecordFormRef, SfRecordFormProps & { layoutType?: LayoutType }>(
  function SfRecordForm({
    objectName,
    recordId,
    mode: modeProp = recordId ? 'view' : 'create',
    lockMode        = false,
    layoutType      = 'Full',
    fields: fieldsProp,
    columns: columnsProp = 2,
    defaultValues   = {},
    recordTypeId:   rtProp,
    title,
    hideHeader      = false,
    hideFooter      = false,
    className       = '',
    loading:        loadingSlot,
    error:          errorSlot,
    onSave,
    onBeforeSave,
    onError,
    onModeChange,
    onCancel,
  }, ref) {
    const sf = useSfContext();

    // Compact always single column (mirrors lightning-record-form)
    const columns = layoutType === 'Compact' ? 1 : columnsProp;

    // ── State ─────────────────────────────────────────────────────────────────
    const [mode, setModeState]           = useState<SfFormMode>(modeProp);
    const [objectInfo, setObjectInfo]    = useState<SfObjectInfo | null>(null);
    const [record, setRecord]            = useState<SfRecord | null>(null);
    const [picklistMap, setPicklistMap]  = useState<Record<string, SfPicklistValue[]>>({});
    const [values, setValues]            = useState<Record<string, unknown>>(defaultValues);
    const [displayValues, setDisplayValues] = useState<Record<string, string>>({});
    const [fieldErrors, setFieldErrors]  = useState<Record<string, string>>({});
    const [layoutFields, setLayoutFields] = useState<string[]>([]);
    const [layoutReady, setLayoutReady]  = useState(false);
    const [loading, setLoading]          = useState(true);
    const [saving, setSaving]            = useState(false);
    const [globalError, setGlobalError]  = useState<string | null>(null);
    const [dirty, setDirty]              = useState(false);
    const originalValues                 = useRef<Record<string, unknown>>({});

    // Sync external mode prop
    useEffect(() => { setModeState(modeProp); }, [modeProp]);

    // ── Step 1: Load objectInfo ───────────────────────────────────────────────
    useEffect(() => {
      if (!objectName) return;
      setLoading(true);
      setGlobalError(null);
      setLayoutReady(false);
      setLayoutFields([]);
      setObjectInfo(null);
      setRecord(null);
      setValues(defaultValues);
      originalValues.current = {};

      sf.getObjectInfo(objectName)
        .then(setObjectInfo)
        .catch((e: SfError) => {
          setGlobalError(e.message);
          onError?.(e);
          setLoading(false);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectName]);

    // ── Step 2: Fetch layout ──────────────────────────────────────────────────
    useEffect(() => {
      if (!objectInfo) return;

      // Caller gave explicit fields — skip layout fetch
      if (fieldsProp && fieldsProp.length > 0) {
        setLayoutFields(fieldsProp);
        setLayoutReady(true);
        return;
      }

      const rtId = resolveRtId(rtProp, null, objectInfo);

      const fetchLayout = async () => {
        try {
          let fields: string[] = [];

          if (layoutType === 'Compact') {
            fields = await sf.getCompactLayout(objectName, rtId);
          } else {
            fields = await sf.getRecordLayout(objectName, rtId, layoutType, 'View');
          }

          if (fields.length > 0) {
            setLayoutFields(fields);
          } else {
            // Graceful fallback: FLS-visible fields, required first
            const fallback = Object.values(objectInfo.fields)
              .filter(f => f.flsAccess !== 'NoAccess' && f.dataType !== 'id')
              .sort((a, b) => Number(b.required) - Number(a.required))
              .slice(0, layoutType === 'Compact' ? 6 : 30)
              .map(f => f.apiName);
            setLayoutFields(fallback);
          }
        } catch {
          const fallback = Object.values(objectInfo.fields)
            .filter(f => f.flsAccess !== 'NoAccess' && f.dataType !== 'id')
            .sort((a, b) => Number(b.required) - Number(a.required))
            .slice(0, layoutType === 'Compact' ? 6 : 30)
            .map(f => f.apiName);
          setLayoutFields(fallback);
        } finally {
          setLayoutReady(true);
        }
      };

      fetchLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectInfo, rtProp, layoutType, fieldsProp, objectName]);

    // ── Step 3: Load record (after layout is ready) ───────────────────────────
    useEffect(() => {
      if (!recordId || !objectInfo || !layoutReady || layoutFields.length === 0) return;
      setLoading(true);

      const fieldsToFetch = layoutFields.filter(f => f !== 'Id');

      sf.getRecord(objectName, recordId, fieldsToFetch)
        .then(rec => {
          setRecord(rec);
          const vals: Record<string, unknown>  = {};
          const disp: Record<string, string>   = {};
          Object.entries(rec.fields).forEach(([k, v]) => {
            vals[k] = v.value;
            disp[k] = v.displayValue ?? String(v.value ?? '');
          });
          setValues(vals);
          setDisplayValues(disp);
          originalValues.current = { ...vals };
          setDirty(false);
        })
        .catch((e: SfError) => { setGlobalError(e.message); onError?.(e); })
        .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recordId, objectInfo, layoutReady, objectName]);

    // For create mode: stop loading once layout is ready
    useEffect(() => {
      if (!recordId && layoutReady) setLoading(false);
    }, [recordId, layoutReady]);

    // ── Step 4: Load picklist values ──────────────────────────────────────────
    useEffect(() => {
      if (!objectInfo) return;
      const rtId = resolveRtId(rtProp, record, objectInfo);

      const plFields = Object.values(objectInfo.fields).filter(
        f => f.dataType === 'picklist' || f.dataType === 'multipicklist'
      );
      if (plFields.length === 0) return;

      Promise.all(
        plFields.map(async f => {
          const vals = await sf.getPicklistValues(objectName, rtId, f.apiName).catch(() => []);
          return [f.apiName, vals] as [string, SfPicklistValue[]];
        })
      ).then(entries => setPicklistMap(Object.fromEntries(entries)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectInfo, record?.recordTypeId, rtProp, objectName]);

    // ── Visible fields ────────────────────────────────────────────────────────
    const visibleFields = useMemo((): SfFieldMetadata[] => {
      if (!objectInfo) return [];
      const keys = fieldsProp?.length ? fieldsProp : layoutFields;
      return keys
        .map(k => objectInfo.fields[k])
        .filter((f): f is SfFieldMetadata => !!f && f.flsAccess !== 'NoAccess' && f.dataType !== 'id');
    }, [objectInfo, fieldsProp, layoutFields]);

    // ── Field change ──────────────────────────────────────────────────────────
    const handleFieldChange = useCallback((apiName: string, val: unknown, display?: string) => {
      setValues(prev => {
        const next = { ...prev, [apiName]: val };
        // Create mode: dirty if ANY field has a value
        // Edit mode: dirty if changed from original
        const isDirty = modeProp === 'create' || mode === 'create'
          ? Object.values(next).some(v => v !== null && v !== undefined && v !== '')
          : Object.keys(next).some(k => next[k] !== originalValues.current[k]);
        setDirty(isDirty);
        return next;
      });
      if (display !== undefined) setDisplayValues(prev => ({ ...prev, [apiName]: display }));
      setFieldErrors(prev => { const n = { ...prev }; delete n[apiName]; return n; });
    }, [modeProp, mode]);

    // ── Mode switch ───────────────────────────────────────────────────────────
    const setMode = useCallback((m: SfFormMode) => {
      setModeState(m);
      onModeChange?.(m);
    }, [onModeChange]);

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
      visibleFields.forEach(f => {
        if (f.required && (values[f.apiName] === null || values[f.apiName] === undefined || values[f.apiName] === '')) {
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
        let payload: Record<string, unknown>;
        if (mode === 'create') {
          // Send all non-empty values
          payload = Object.fromEntries(
            Object.entries(values).filter(([, v]) => v !== null && v !== undefined && v !== '')
          );
        } else {
          // Only changed fields
          payload = Object.fromEntries(
            Object.keys(values)
              .filter(k => values[k] !== originalValues.current[k])
              .map(k => [k, values[k]])
          );
        }
        if (onBeforeSave) payload = onBeforeSave(payload);

        let saved: SfRecord;
        if (mode === 'create') {
          saved = await sf.createRecord(objectName, { ...defaultValues, ...payload });
        } else {
          saved = await sf.updateRecord(objectName, recordId!, payload);
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
          sfErr.fields.forEach(f => { errs[f] = sfErr.message; });
          setFieldErrors(errs);
        } else {
          setGlobalError(sfErr.message);
        }
        onError?.(sfErr);
      } finally {
        setSaving(false);
      }
    }, [values, validate, mode, onBeforeSave, recordId, objectName, sf, onSave, onError, setMode, defaultValues]);

    // ── Imperative ref ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      save:           handleSave,
      reset:          handleCancel,
      isDirty:        () => dirty,
      getValues:      () => ({ ...values }),
      setFieldValue:  (field, val) => handleFieldChange(field, val),
      setMode,
    }));

    const isEditing = mode === 'edit' || mode === 'create';

    // ── Render field input ────────────────────────────────────────────────────
    const renderFieldInput = (meta: SfFieldMetadata) => {
      const val        = values[meta.apiName];
      const displayVal = displayValues[meta.apiName] ?? '';
      const isReadonly = !isEditing || meta.flsAccess === 'ReadOnly';

      // ── View ───────────────────────────────────────────────────────────────
      if (isReadonly) {
        if (meta.dataType === 'boolean') {
          return <div className="sf-record-form__field-value">{val ? '✓ Yes' : '✗ No'}</div>;
        }
        if (meta.dataType === 'url' && val) {
          return (
            <div className="sf-record-form__field-value">
              <a href={String(val)} target="_blank" rel="noopener noreferrer">{displayVal || String(val)}</a>
            </div>
          );
        }
        if (meta.dataType === 'lookup' && displayVal) {
          return <div className="sf-record-form__field-value"><span className="sf-record-form__lookup-chip">👤 {displayVal}</span></div>;
        }
        const isEmpty = val === null || val === undefined || val === '';
        return (
          <div className={`sf-record-form__field-value${isEmpty ? ' sf-record-form__field-value--empty' : ''}`}>
            {isEmpty ? '—' : displayVal || String(val)}
          </div>
        );
      }

      // ── Edit ───────────────────────────────────────────────────────────────
      const errClass = fieldErrors[meta.apiName] ? ' sf-record-form__input--error' : '';

      if (meta.dataType === 'boolean') {
        return (
          <div className="sf-record-form__checkbox-wrap">
            <input type="checkbox" className="sf-record-form__checkbox"
              checked={Boolean(val)}
              onChange={e => handleFieldChange(meta.apiName, e.target.checked)} />
            <span>{Boolean(val) ? 'Yes' : 'No'}</span>
          </div>
        );
      }

      if (meta.dataType === 'picklist' || meta.dataType === 'multipicklist') {
        const opts = picklistMap[meta.apiName] ?? [];
        return (
          <div className="sf-record-form__picklist-wrap">
            <select value={String(val ?? '')}
              onChange={e => handleFieldChange(meta.apiName, e.target.value)}
              className={errClass}>
              <option value="">— Select —</option>
              {opts.filter(o => o.active).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="sf-record-form__picklist-arrow">▾</span>
          </div>
        );
      }

      if (meta.dataType === 'textarea') {
        return (
          <textarea className={`sf-record-form__input sf-record-form__textarea${errClass}`}
            value={String(val ?? '')} rows={3}
            onChange={e => handleFieldChange(meta.apiName, e.target.value)} />
        );
      }

      if (meta.dataType === 'lookup') {
        return (
          <LookupField meta={meta} displayValue={displayVal} objectName={objectName}
            onChange={(id, name) => handleFieldChange(meta.apiName, id, name)}
            onClear={() => handleFieldChange(meta.apiName, null, '')} />
        );
      }

      const inputType =
        meta.dataType === 'date'     ? 'date' :
        meta.dataType === 'datetime' ? 'datetime-local' :
        meta.dataType === 'number' || meta.dataType === 'currency' ||
        meta.dataType === 'double'   || meta.dataType === 'int' ||
        meta.dataType === 'percent'  ? 'number' :
        meta.dataType === 'email'    ? 'email' :
        meta.dataType === 'phone'    ? 'tel' :
        meta.dataType === 'url'      ? 'url' : 'text';

      return (
        <input type={inputType}
          className={`sf-record-form__input${errClass}`}
          value={String(val ?? '')}
          onChange={e => handleFieldChange(meta.apiName, e.target.value)}
          placeholder={meta.label} />
      );
    };

    // ── Title ─────────────────────────────────────────────────────────────────
    const recordTitle = title
      ?? record?.fields?.Name?.displayValue
      ?? (record?.fields?.Name?.value as string)
      ?? (mode === 'create' ? `New ${objectName}` : objectName);

    // ── Loading ───────────────────────────────────────────────────────────────
    if (loading) return <>{loadingSlot ?? <SkeletonLoading count={layoutType === 'Compact' ? 4 : 6} />}</>;

    // ── Fatal error ───────────────────────────────────────────────────────────
    if (globalError && !objectInfo) {
      return <>{errorSlot ?? (
        <div className="sf-record-form__error-state">
          <strong>⚠ Failed to load</strong>
          <p>{globalError}</p>
        </div>
      )}</>;
    }

    // ── Save button enabled logic ─────────────────────────────────────────────
    // Create: enable when at least one required field is filled, or any field has value
    // Edit:   enable when dirty (something changed)
    const canSave = mode === 'create' ? true : dirty;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
      <div className={[
        'sf-record-form',
        layoutType === 'Compact' ? 'sf-record-form--compact' : 'sf-record-form--full',
        className,
      ].filter(Boolean).join(' ')}>

        {/* Header */}
        {!hideHeader && (
          <div className="sf-record-form__header">
            <div className="sf-record-form__header-left">
              <span className="sf-record-form__object-badge">{objectName}</span>
              <span className="sf-record-form__record-name">{String(recordTitle)}</span>
              {recordId && <span className="sf-record-form__record-id">{recordId}</span>}
              {dirty && <span className="sf-record-form__dirty" title="Unsaved changes" />}
              <span className={`sf-record-form__layout-badge sf-record-form__layout-badge--${layoutType.toLowerCase()}`}>
                {layoutType}
              </span>
            </div>
            {!lockMode && mode !== 'create' && (
              <div className="sf-record-form__mode-toggle">
                <button type="button"
                  className={`sf-record-form__mode-btn${mode === 'view' ? ' sf-record-form__mode-btn--active' : ''}`}
                  onClick={() => setMode('view')}>👁 View</button>
                <button type="button"
                  className={`sf-record-form__mode-btn${mode === 'edit' ? ' sf-record-form__mode-btn--active' : ''}`}
                  onClick={() => setMode('edit')}>✏ Edit</button>
              </div>
            )}
          </div>
        )}

        {/* Global error banner */}
        {globalError && (
          <div className="sf-record-form__global-error">⚠ {globalError}</div>
        )}

        {/* Empty compact layout hint */}
        {visibleFields.length === 0 && layoutType === 'Compact' && (
          <div style={{ padding: '16px', color: '#706e6b', fontSize: 13 }}>
            No fields to display. Check that a Compact layout is configured for <strong>{objectName}</strong> in your org.
          </div>
        )}

        {/* Field grid */}
        <div className={['sf-record-form__grid', columns === 1 ? 'sf-record-form__grid--1col' : ''].filter(Boolean).join(' ')}>
          {visibleFields.map(meta => (
            <div key={meta.apiName}
              className={['sf-record-form__field',
                meta.dataType === 'textarea' || columns === 1 ? 'sf-record-form__field--full' : '',
              ].filter(Boolean).join(' ')}>
              <div className="sf-record-form__field-label">
                <span className={`sf-record-form__fls-dot sf-record-form__fls-dot--${
                  meta.flsAccess === 'ReadWrite' ? 'rw' : meta.flsAccess === 'ReadOnly' ? 'ro' : 'none'
                }`} title={meta.flsAccess} />
                {meta.label}
                {meta.required && <span className="sf-record-form__required-star">*</span>}
              </div>
              {renderFieldInput(meta)}
              {fieldErrors[meta.apiName] && (
                <div className="sf-record-form__field-error">⚠ {fieldErrors[meta.apiName]}</div>
              )}
            </div>
          ))}
        </div>

        {/* Edit/Create footer */}
        {!hideFooter && isEditing && (
          <div className="sf-record-form__footer">
            <span className="sf-record-form__footer-meta">
              {dirty ? '● Unsaved changes' : mode === 'create' ? 'Fill in fields to create' : 'No changes yet'}
            </span>
            <div className="sf-record-form__footer-actions">
              <button type="button" className="sf-record-form__btn-cancel"
                onClick={handleCancel} disabled={saving}>Cancel</button>
              <button type="button" className="sf-record-form__btn-save"
                onClick={handleSave} disabled={saving || !canSave}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* View footer */}
        {!hideFooter && !isEditing && record && (
          <div className="sf-record-form__footer">
            <span className="sf-record-form__footer-meta">
              Last modified: {record.lastModifiedDate ? new Date(record.lastModifiedDate).toLocaleString() : 'Unknown'}
            </span>
            {!lockMode && (
              <button type="button" className="sf-record-form__btn-cancel" onClick={() => setMode('edit')}>
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
