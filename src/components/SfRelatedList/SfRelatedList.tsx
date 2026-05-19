/**
 * SfRelatedList — React equivalent of lightning-related-list
 *
 * Renders child records related to a parent via a lookup/master-detail field.
 * Uses UI API: /ui-api/related-list-info/:parentObjectName/:relatedListId
 * and           /ui-api/related-list-records/:recordId/:relatedListId
 *
 * Features:
 *  - Fetches related list metadata (columns, label) from UI API
 *  - Fetches related records with correct field list
 *  - Sort, row actions (Edit / Delete / custom)
 *  - Inline "New" record button (calls onNew)
 *  - Collapsed / expanded toggle (like native SF related lists)
 *  - Loading skeleton, empty state, error state
 *  - Pagination (client-side by default; pass pageSize prop)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSfContext } from '../SfProvider/SfProvider';
import type { SfRelatedListProps, SfRowAction } from '../../types';
import './SfRelatedList.css';

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ cols }: { cols: number }) {
  return (
    <div className="sf-rellist__skeleton">
      {Array.from({ length: 3 }).map((_, r) => (
        <div key={r} className="sf-rellist__skeleton-row">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="sf-rellist__skeleton-cell" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Format cell value ─────────────────────────────────────────────────────────
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  // ISO date check
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }
  return String(value);
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
  actions = [{ name: 'edit', label: 'Edit' }, { name: 'delete', label: 'Delete', variant: 'destructive' }],
  showNewButton = true,
  newButtonLabel = 'New',
  onRowAction,
  onNew,
  onError,
  className = '',
}: SfRelatedListProps) {
  const sf = useSfContext();

  const [columns, setColumns]       = useState<string[]>(columnsProp ?? []);
  const [listTitle, setListTitle]   = useState(titleProp ?? relatedListId);
  const [records, setRecords]       = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [collapsed, setCollapsed]   = useState(defaultCollapsed);
  const [sortField, setSortField]   = useState<string | null>(null);
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('asc');
  const [page, setPage]             = useState(0);

  // ── Fetch related list metadata (column order + label) ────────────────────
  useEffect(() => {
    if (columnsProp && titleProp) return; // caller provided everything
    sf.getRelatedListInfo(parentObjectName, relatedListId)
      .then((info) => {
        if (!titleProp)   setListTitle(info.label);
        if (!columnsProp) setColumns(info.columns);
      })
      .catch(() => {
        // Non-fatal — caller may have provided columns manually
      });
  }, [parentObjectName, relatedListId, columnsProp, titleProp]);

  // ── Fetch related records ─────────────────────────────────────────────────
  useEffect(() => {
    if (!parentRecordId || columns.length === 0) return;
    setLoading(true);
    setError(null);

    sf.getRelatedListRecords(parentRecordId, relatedListId, columns)
      .then((recs) => setRecords(recs))
      .catch((e: { message: string }) => {
        setError(e.message);
        onError?.(e);
      })
      .finally(() => setLoading(false));
  }, [parentRecordId, relatedListId, columns]);

  // ── Sort ───────────────────────────────────────────────────────────────────
  const handleSort = useCallback((field: string) => {
    if (!sortable) return;
    setSortField((prev) => {
      if (prev === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
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

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(sorted.length / pageSize);
  const pageRecords = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const firstCol = columns[0] ?? 'Name';

  return (
    <div className={`sf-rellist ${className}`}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="sf-rellist__header">
        <div className="sf-rellist__header-left">
          {collapsible && (
            <button
              type="button"
              className="sf-rellist__collapse-btn"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand' : 'Collapse'}
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

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {!collapsed && (
        <>
          {error ? (
            <div className="sf-rellist__error">⚠ {error}</div>
          ) : loading ? (
            <Skeleton cols={columns.length} />
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
                      {columns.map((col) => (
                        <th
                          key={col}
                          className={`sf-rellist__th${sortable ? ' sf-rellist__th--sortable' : ''}`}
                          onClick={() => handleSort(col)}
                        >
                          <div className="sf-rellist__th-inner">
                            {col.replace(/__c$/i, '').replace(/_/g, ' ')}
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
                          {columns.map((col, ci) => (
                            <td
                              key={col}
                              className={`sf-rellist__td${ci === 0 ? ' sf-rellist__td--primary' : ''}`}
                            >
                              {ci === 0 && typeof row[col] === 'string' ? (
                                // First column rendered as a clickable link
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
                                {(actions as SfRowAction[]).map((action) => (
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
                    onClick={() => setPage((p) => p - 1)}
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
                    onClick={() => setPage((p) => p + 1)}
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
