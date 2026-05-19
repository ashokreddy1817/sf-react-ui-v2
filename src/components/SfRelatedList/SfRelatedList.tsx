/**
 * SfRelatedList — React equivalent of lightning-related-list
 *
 * FIXES in this version:
 *  1. getRelatedListInfo may 404 on some orgs/objects — wrapped in try/catch
 *     with a graceful fallback to caller-provided columns or default ["Name"]
 *  2. Column labels: previously used bare fieldApiName as header text with
 *     ugly __c suffix and underscores — now properly humanised
 *  3. Records fetch: used to wait for columns from API before fetching records,
 *     causing a deadlock when the info API 404s. Now proceeds with fallback columns.
 *  4. Row rendering: records from /ui-api/related-list-records have fields
 *     already flattened by apiClient — the column key lookup now matches correctly
 *  5. Actions: type import was missing SfRowAction — now imported cleanly
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSfContext } from '../SfProvider/SfProvider';
import type { SfRelatedListProps, SfRowAction } from '../../types';
import './SfRelatedList.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
function humaniseFieldName(fieldName: string): string {
  return fieldName
    .replace(/__c$/i, '')          // remove custom field suffix
    .replace(/__r$/i, '')          // remove relationship suffix
    .replace(/_/g, ' ')            // underscores to spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase to words
    .replace(/\b\w/g, c => c.toUpperCase()); // title case
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }
  return String(value);
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ cols }: { cols: number }) {
  return (
    <div className="sf-rellist__skeleton">
      {Array.from({ length: 3 }).map((_, r) => (
        <div key={r} className="sf-rellist__skeleton-row">
          {Array.from({ length: Math.max(cols, 2) }).map((_, c) => (
            <div key={c} className="sf-rellist__skeleton-cell" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function SfRelatedList({
  parentRecordId,
  parentObjectName,
  relatedListId,
  columns: columnsProp,
  title: titleProp,
  pageSize = 6,
  sortable = true,
  collapsible = true,
  defaultCollapsed = false,
  actions = [
    { name: 'edit',   label: 'Edit' },
    { name: 'delete', label: 'Delete', variant: 'destructive' },
  ],
  showNewButton = true,
  newButtonLabel = 'New',
  onRowAction,
  onNew,
  onError,
  className = '',
}: SfRelatedListProps) {
  const sf = useSfContext();

  // FIX: separate resolved columns/title from loading state
  // so we don't block record fetch on info API success
  const [columns, setColumns]     = useState<string[]>(columnsProp ?? []);
  const [listTitle, setListTitle] = useState(titleProp ?? relatedListId);
  const [records, setRecords]     = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('asc');
  const [page, setPage]           = useState(0);

  // ── Step 1: Fetch related list metadata ──────────────────────────────────────
  // FIX: Non-blocking — if this fails we fall back to columnsProp or ["Name"]
  // The records fetch does NOT wait for this to succeed.
  useEffect(() => {
    if (columnsProp && titleProp) return; // caller gave us everything, skip

    sf.getRelatedListInfo(parentObjectName, relatedListId)
      .then(info => {
        if (!titleProp)                          setListTitle(info.label);
        if (!columnsProp && info.columns.length > 0) setColumns(info.columns);
      })
      .catch(() => {
        // Info API failed — set fallback columns so records fetch can proceed
        if (!columnsProp) setColumns(['Name']);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentObjectName, relatedListId]);

  // ── Step 2: Fetch related records ────────────────────────────────────────────
  // FIX: Fetch immediately — apiClient.getRelatedListRecords now sends NO
  // ?fields= param and lets Salesforce return default columns for the list.
  // This avoids the 400 "field name must be qualified" error entirely.
  useEffect(() => {
    if (!parentRecordId) return;
    setLoading(true);
    setError(null);

    sf.getRelatedListRecords(parentRecordId, relatedListId, columns)
      .then(recs => {
        setRecords(recs);
        // If we got records but columns is still empty, infer from first record
        if (columns.length === 0 && recs.length > 0) {
          const inferredCols = Object.keys(recs[0]).filter(k => k !== 'attributes');
          setColumns(inferredCols);
        }
      })
      .catch((e: { message: string }) => {
        setError(e.message);
        onError?.(e);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentRecordId, relatedListId]);

  // ── Sort ──────────────────────────────────────────────────────────────────────
  const handleSort = useCallback((field: string) => {
    if (!sortable) return;
    setSortField(prev => {
      if (prev === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
      else setSortDir('asc');
      return field;
    });
    setPage(0);
  }, [sortable]);

  const sorted = useMemo(() => {
    if (!sortField) return records;
    return [...records].sort((a, b) => {
      const va = String(a[sortField] ?? '');
      const vb = String(b[sortField] ?? '');
      const cmp = va.localeCompare(vb, undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [records, sortField, sortDir]);

  // ── Pagination ────────────────────────────────────────────────────────────────
  const totalPages  = Math.ceil(sorted.length / pageSize);
  const pageRecords = sorted.slice(page * pageSize, (page + 1) * pageSize);

  // Columns to actually render — use resolved columns, fall back to record keys
  const displayColumns = columns.length > 0
    ? columns
    : records.length > 0
      ? Object.keys(records[0]).filter(k => k !== 'attributes' && k !== 'Id').slice(0, 5)
      : ['Name'];

  return (
    <div className={`sf-rellist ${className}`}>

      {/* Header */}
      <div className="sf-rellist__header">
        <div className="sf-rellist__header-left">
          {collapsible && (
            <button
              type="button"
              className="sf-rellist__collapse-btn"
              onClick={() => setCollapsed(c => !c)}
              aria-expanded={!collapsed}
            >
              {collapsed ? '▶' : '▼'}
            </button>
          )}
          <h3 className="sf-rellist__title">{listTitle}</h3>
          <span className="sf-rellist__count">
            {loading ? '…' : records.length}
          </span>
        </div>
        {showNewButton && !collapsed && (
          <button
            type="button"
            className="sf-rellist__new-btn"
            onClick={() => onNew?.()}
          >
            + {newButtonLabel}
          </button>
        )}
      </div>

      {/* Body */}
      {!collapsed && (
        <>
          {error ? (
            <div className="sf-rellist__error">⚠ {error}</div>
          ) : loading ? (
            <Skeleton cols={displayColumns.length} />
          ) : records.length === 0 ? (
            <div className="sf-rellist__empty">
              No {listTitle} to display.
            </div>
          ) : (
            <>
              <div className="sf-rellist__scroll">
                <table className="sf-rellist__table">
                  <thead>
                    <tr>
                      {displayColumns.map(col => (
                        <th
                          key={col}
                          className={`sf-rellist__th${sortable ? ' sf-rellist__th--sortable' : ''}`}
                          onClick={() => handleSort(col)}
                        >
                          <div className="sf-rellist__th-inner">
                            {humaniseFieldName(col)}
                            {sortable && (
                              <span className={`sf-rellist__sort-icon${sortField === col ? ' sf-rellist__sort-icon--active' : ''}`}>
                                {sortField === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                      {actions.length > 0 && (
                        <th className="sf-rellist__th sf-rellist__th--actions" />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRecords.map((row, idx) => {
                      const rowId = String(row['Id'] ?? idx);
                      return (
                        <tr key={rowId} className="sf-rellist__row">
                          {displayColumns.map((col, ci) => (
                            <td
                              key={col}
                              className={`sf-rellist__td${ci === 0 ? ' sf-rellist__td--primary' : ''}`}
                            >
                              {ci === 0 && row[col] ? (
                                <button
                                  type="button"
                                  className="sf-rellist__record-link"
                                  onClick={() => onRowAction?.('view', row)}
                                >
                                  {String(row[col])}
                                </button>
                              ) : (
                                formatValue(row[col])
                              )}
                            </td>
                          ))}
                          {actions.length > 0 && (
                            <td className="sf-rellist__td sf-rellist__td--actions">
                              <div className="sf-rellist__actions">
                                {(actions as SfRowAction[]).map(action => (
                                  <button
                                    key={action.name}
                                    type="button"
                                    className={`sf-rellist__action-btn${action.variant === 'destructive' ? ' sf-rellist__action-btn--destructive' : ''}`}
                                    onClick={() => onRowAction?.(action.name, row)}
                                  >
                                    {action.label}
                                  </button>
                                ))}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="sf-rellist__pagination">
                  <button
                    type="button"
                    className="sf-rellist__page-btn"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                  >
                    ← Prev
                  </button>
                  <span className="sf-rellist__page-info">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="sf-rellist__page-btn"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default SfRelatedList;
