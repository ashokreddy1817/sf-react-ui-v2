/**
 * SfRecordCard — React equivalent of lightning-record-form in view mode,
 *                presented as a card (compact or full layout)
 *
 * Features:
 *  - Fetches compact layout OR full field list from the UI API
 *  - Respects FLS (fields the user can't read are hidden automatically)
 *  - compact layout: icon + title + 4-6 fields in a pill row
 *  - full layout: 2-column grid of all layout fields with labels
 *  - Field type-aware rendering: currency, date, boolean, phone, email, url
 *  - SfStatusBadge for picklist fields
 *  - Inline edit toggle → opens SfRecordForm in edit mode
 *  - Loading skeleton, error state
 */

import { useState, useEffect, useCallback } from 'react';
import { useSfContext } from '../SfProvider/SfProvider';
import { SfStatusBadge } from '../SfStatusBadge/SfStatusBadge';
import type {
  SfRecordCardProps,
  SfObjectInfo,
  SfRecord,
  SfFieldMetadata,
} from '../../types';
import './SfRecordCard.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatFieldValue(
  meta: SfFieldMetadata | undefined,
  value: unknown,
  displayValue: string | null
): React.ReactNode {
  if (value === null || value === undefined || value === '') return <span className="sf-card__empty">—</span>;

  const type = meta?.dataType ?? 'string';

  if (type === 'boolean') {
    return (
      <span className={`sf-card__bool sf-card__bool--${value ? 'true' : 'false'}`}>
        {value ? '✓ Yes' : '✗ No'}
      </span>
    );
  }
  if (type === 'picklist' || type === 'multipicklist') {
    return <SfStatusBadge value={String(value)} />;
  }
  if (displayValue) return displayValue;
  if (type === 'currency') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
      .format(Number(value));
  }
  if (type === 'percent') return `${Number(value).toFixed(1)}%`;
  if (type === 'date') {
    return new Date(String(value)).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }
  if (type === 'datetime') {
    return new Date(String(value)).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
  if (type === 'email') {
    return <a className="sf-card__link" href={`mailto:${value}`}>{String(value)}</a>;
  }
  if (type === 'phone') {
    return <a className="sf-card__link" href={`tel:${value}`}>{String(value)}</a>;
  }
  if (type === 'url') {
    const url = String(value).startsWith('http') ? String(value) : `https://${value}`;
    return <a className="sf-card__link" href={url} target="_blank" rel="noopener noreferrer">{String(value)}</a>;
  }
  return String(value);
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function CardSkeleton({ layout }: { layout: 'compact' | 'full' }) {
  return (
    <div className={`sf-card sf-card--skeleton sf-card--${layout}`}>
      <div className="sf-card__header">
        <div className="sf-card__skeleton-icon" />
        <div>
          <div className="sf-card__skeleton-line sf-card__skeleton-line--title" />
          <div className="sf-card__skeleton-line sf-card__skeleton-line--sub" />
        </div>
      </div>
      {layout === 'full' && (
        <div className="sf-card__body sf-card__body--grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="sf-card__field">
              <div className="sf-card__skeleton-line sf-card__skeleton-line--label" />
              <div className="sf-card__skeleton-line sf-card__skeleton-line--value" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Object icon map ───────────────────────────────────────────────────────────
const OBJECT_ICONS: Record<string, string> = {
  Account: '🏢', Contact: '👤', Opportunity: '💰', Lead: '📋',
  Case: '🎫', Task: '✅', Event: '📅', User: '👤',
  Campaign: '📣', Contract: '📄', Order: '📦',
};

// ── Main component ────────────────────────────────────────────────────────────
export function SfRecordCard({
  objectName,
  recordId,
  fields: fieldsProp,
  layout = 'compact',
  title: titleProp,
  showEditButton = true,
  showRefreshButton = false,
  onEdit,
  onError,
  className = '',
}: SfRecordCardProps) {
  const sf = useSfContext();

  const [objectInfo,  setObjectInfo]  = useState<SfObjectInfo | null>(null);
  const [record,      setRecord]      = useState<SfRecord | null>(null);
  const [fieldList,   setFieldList]   = useState<string[]>(fieldsProp ?? []);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  // ── 1. Load object info → resolve layout fields ───────────────────────────
  useEffect(() => {
    if (!objectName) return;
    sf.getObjectInfo(objectName)
      .then((info) => {
        setObjectInfo(info);
        if (!fieldsProp || fieldsProp.length === 0) {
          // Use compact or full layout from UI API
          const rtId = info.defaultRecordTypeId ?? '012000000000000AAA';
          const layoutProm = layout === 'compact'
            ? sf.getCompactLayout(objectName, rtId)
            : sf.getRecordLayout(objectName, rtId, 'Full', 'View');
          return layoutProm.then((cols) => {
            const safe = cols.length > 0 ? cols : Object.keys(info.fields).slice(0, 8);
            setFieldList(safe);
          });
        }
      })
      .catch((e: { message: string }) => {
        setError(e.message);
        onError?.(e);
      });
  }, [objectName, layout]);

  // ── 2. Fetch the record once fieldList is resolved ────────────────────────
  const fetchRecord = useCallback(() => {
    if (!recordId || fieldList.length === 0) return;
    setLoading(true);
    setError(null);
    const safeFields = fieldList.includes('Id') ? fieldList : ['Id', 'Name', ...fieldList];
    sf.getRecord(objectName, recordId, safeFields)
      .then((rec) => {
        setRecord(rec);
        setLoading(false);
      })
      .catch((e: { message: string }) => {
        setError(e.message);
        onError?.(e);
        setLoading(false);
      });
  }, [objectName, recordId, fieldList.join(',')]);

  useEffect(() => { fetchRecord(); }, [fetchRecord]);

  // ── Render helpers ────────────────────────────────────────────────────────
  if (loading) return <CardSkeleton layout={layout} />;

  if (error) {
    return (
      <div className={`sf-card sf-card--error ${className}`}>
        <span className="sf-card__error-icon">⚠</span>
        <span className="sf-card__error-msg">{error}</span>
      </div>
    );
  }

  if (!record) return null;

  const nameField  = record.fields['Name'] ?? record.fields['Subject'] ?? record.fields['Title'];
  const recordName = nameField?.displayValue ?? String(nameField?.value ?? recordId);
  const icon       = OBJECT_ICONS[objectName] ?? '📄';

  // ── Compact layout ────────────────────────────────────────────────────────
  if (layout === 'compact') {
    const compactFields = fieldList.filter((f) => f !== 'Id' && f !== 'Name').slice(0, 5);
    return (
      <div className={`sf-card sf-card--compact ${className}`}>
        <div className="sf-card__header">
          <div className="sf-card__icon-wrap">
            <span className="sf-card__icon" aria-hidden="true">{icon}</span>
          </div>
          <div className="sf-card__header-info">
            <div className="sf-card__title">
              <span className="sf-card__name">{recordName}</span>
              <span className="sf-card__object-label">{titleProp ?? objectName}</span>
            </div>
            <div className="sf-card__pills">
              {compactFields.map((fieldName) => {
                const fv   = record.fields[fieldName];
                const meta = objectInfo?.fields[fieldName];
                if (!fv) return null;
                return (
                  <div key={fieldName} className="sf-card__pill">
                    <span className="sf-card__pill-label">{meta?.label ?? fieldName}</span>
                    <span className="sf-card__pill-value">
                      {formatFieldValue(meta, fv.value, fv.displayValue)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="sf-card__actions">
            {showRefreshButton && (
              <button type="button" className="sf-card__action-btn" onClick={fetchRecord} title="Refresh">
                ↻
              </button>
            )}
            {showEditButton && (
              <button type="button" className="sf-card__action-btn sf-card__action-btn--edit"
                onClick={() => onEdit?.(record)} title="Edit">
                ✎ Edit
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Full layout ───────────────────────────────────────────────────────────
  const visibleFields = fieldList.filter((f) => f !== 'Id');

  return (
    <div className={`sf-card sf-card--full ${className}`}>
      {/* Card header */}
      <div className="sf-card__header">
        <div className="sf-card__icon-wrap">
          <span className="sf-card__icon" aria-hidden="true">{icon}</span>
        </div>
        <div>
          <h3 className="sf-card__name">{recordName}</h3>
          <span className="sf-card__object-label">{titleProp ?? objectName}</span>
        </div>
        <div className="sf-card__actions">
          {showRefreshButton && (
            <button type="button" className="sf-card__action-btn" onClick={fetchRecord} title="Refresh">
              ↻
            </button>
          )}
          {showEditButton && (
            <button type="button" className="sf-card__action-btn sf-card__action-btn--edit"
              onClick={() => onEdit?.(record)}>
              ✎ Edit
            </button>
          )}
        </div>
      </div>

      {/* Field grid */}
      <div className="sf-card__body sf-card__body--grid">
        {visibleFields.map((fieldName) => {
          const fv   = record.fields[fieldName];
          const meta = objectInfo?.fields[fieldName];
          if (!fv) return null;
          return (
            <div key={fieldName} className="sf-card__field">
              <dt className="sf-card__field-label">{meta?.label ?? fieldName}</dt>
              <dd className="sf-card__field-value">
                {formatFieldValue(meta, fv.value, fv.displayValue)}
              </dd>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SfRecordCard;
