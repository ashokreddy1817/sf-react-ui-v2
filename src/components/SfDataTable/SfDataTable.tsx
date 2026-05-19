/**
 * SfDataTable — React equivalent of lightning-datatable
 *
 * Usage:
 *   <SfDataTable
 *     objectApiName="Account"
 *     title="Accounts"
 *     columns={[
 *       { label: "Name",    fieldName: "Name",          primary: true, sortable: true },
 *       { label: "Revenue", fieldName: "AnnualRevenue", type: "currency" },
 *       { label: "Type",    fieldName: "Type",
 *         badge: { Customer: "success", Partner: "info" } },
 *     ]}
 *     records={accounts}
 *     keyField="Id"
 *     sortable filterable
 *     actions={[{ label: "Edit", name: "edit" }]}
 *     onRowAction={(action, row) => handleAction(action, row)}
 *   />
 */

import { useState, useMemo } from 'react';
import type { SfDataTableProps, SfColumnDef } from '../../types';
import './SfDataTable.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

// FIX: `notation: 'compact'` requires ES2020 lib types but tsconfig targets ES2019.
// Manual abbreviation produces identical output ($1.2M, $450K) with no lib change.
function abbreviateCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const fmt = (n: number, suffix: string) =>
    sign +
    '$' +
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n) +
    suffix;

  if (abs >= 1_000_000_000) return fmt(value / 1_000_000_000, 'B');
  if (abs >= 1_000_000)     return fmt(value / 1_000_000, 'M');
  if (abs >= 1_000)         return fmt(value / 1_000, 'K');

  return (
    sign +
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(abs)
  );
}

function formatCell(value: unknown, col: SfColumnDef): { text: string; raw: unknown } {
  if (value == null || value === '') return { text: '—', raw: value };
  switch (col.type) {
    case 'currency':
      return { text: abbreviateCurrency(Number(value)), raw: value };
    case 'number':
      return {
        text: new Intl.NumberFormat('en-US').format(Number(value)),
        raw: value,
      };
    case 'date':
      return {
        text: new Date(String(value)).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        raw: value,
      };
    case 'datetime':
      return {
        text: new Date(String(value)).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        raw: value,
      };
    case 'boolean':
      return { text: value ? '✓' : '—', raw: value };
    default:
      return { text: String(value), raw: value };
  }
}

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default';

function getBadgeVariant(value: unknown, col: SfColumnDef): BadgeVariant | null {
  if (!col.badge) return null;
  if (typeof col.badge === 'function') return col.badge(value);
  return (col.badge as Record<string, BadgeVariant>)[String(value)] ?? 'default';
}

function SkeletonTable({ cols }: { cols: number }) {
  return (
    <div className="sf-datatable__skeleton">
      {Array.from({ length: 5 }).map((_, r) => (
        <div key={r} className="sf-datatable__skeleton-row">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="sf-datatable__skeleton-cell" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function SfDataTable({
  objectApiName,
  title,
  columns = [],
  records = [],
  keyField = 'Id',
  sortable = true,
  filterable = false,
  striped = true,
  loading = false,
  actions = [],
  onRowAction,
  selectedRows: selectedProp,
  onSelectionChange,
  emptyMessage = 'No records found',
}: SfDataTableProps) {
  const [sortField, setSortField]   = useState<string | null>(null);
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState('');
  const [selected, setSelected]     = useState<Set<string>>(new Set(selectedProp ?? []));

  const handleSort = (fieldName: string) => {
    if (!sortable) return;
    if (sortField === fieldName) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(fieldName); setSortDir('asc'); }
  };

  const filtered = useMemo(() => filterText
    ? records.filter(row =>
        columns.some(col =>
          String(row[col.fieldName] ?? '').toLowerCase().includes(filterText.toLowerCase())
        )
      )
    : records,
  [records, columns, filterText]);

  const sorted = useMemo(() => sortField
    ? [...filtered].sort((a, b) => {
        const va = String(a[sortField] ?? '');
        const vb = String(b[sortField] ?? '');
        const cmp = va.localeCompare(vb, undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : filtered,
  [filtered, sortField, sortDir]);

  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      onSelectionChange?.([...next]);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    const next = checked
      ? new Set(sorted.map(r => String(r[keyField])))
      : new Set<string>();
    setSelected(next);
    onSelectionChange?.([...next]);
  };

  const allSelected =
    sorted.length > 0 && sorted.every(r => selected.has(String(r[keyField])));

  return (
    <div className="sf-datatable">
      {/* Header */}
      <div className="sf-datatable__header">
        <div>
          {title && <h3 className="sf-datatable__title">{title}</h3>}
          {objectApiName && (
            <p className="sf-datatable__subtitle">
              {objectApiName} · {sorted.length} record{sorted.length !== 1 ? 's' : ''}
              {selected.size > 0 && ` · ${selected.size} selected`}
            </p>
          )}
        </div>
        {filterable && (
          <div className="sf-datatable__search-wrap">
            <span className="sf-datatable__search-icon">🔍</span>
            <input
              className="sf-datatable__search"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              placeholder="Filter records…"
            />
            {filterText && (
              <button
                className="sf-datatable__search-clear"
                onClick={() => setFilterText('')}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <SkeletonTable cols={columns.length} />
      ) : (
        <div className="sf-datatable__scroll">
          <table className="sf-datatable__table">
            <thead>
              <tr>
                <th className="sf-datatable__th sf-datatable__th--check">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={e => toggleAll(e.target.checked)}
                  />
                </th>
                {columns.map(col => (
                  <th
                    key={col.fieldName}
                    className={`sf-datatable__th${
                      sortable && col.sortable !== false
                        ? ' sf-datatable__th--sortable'
                        : ''
                    }`}
                    style={{ width: col.width }}
                    onClick={() =>
                      col.sortable !== false && handleSort(col.fieldName)
                    }
                  >
                    <div className="sf-datatable__th-inner">
                      {col.label}
                      {sortable && col.sortable !== false && (
                        <span
                          className={`sf-datatable__sort-icon${
                            sortField === col.fieldName
                              ? ' sf-datatable__sort-icon--active'
                              : ''
                          }`}
                        >
                          {sortField === col.fieldName
                            ? sortDir === 'asc'
                              ? ' ↑'
                              : ' ↓'
                            : ' ↕'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
                {actions.length > 0 && (
                  <th className="sf-datatable__th sf-datatable__th--actions" />
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 2}
                    className="sf-datatable__empty"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                sorted.map((row, idx) => {
                  const rowId = String(row[keyField]);
                  const isSelected = selected.has(rowId);
                  return (
                    <tr
                      key={rowId}
                      className={[
                        'sf-datatable__row',
                        isSelected ? 'sf-datatable__row--selected' : '',
                        striped && idx % 2 === 1 && !isSelected
                          ? 'sf-datatable__row--stripe'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <td className="sf-datatable__td sf-datatable__td--check">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(rowId)}
                        />
                      </td>
                      {columns.map(col => {
                        const { text, raw } = formatCell(row[col.fieldName], col);
                        const badgeVariant  = getBadgeVariant(raw, col);
                        return (
                          <td
                            key={col.fieldName}
                            className={`sf-datatable__td${
                              col.primary ? ' sf-datatable__td--primary' : ''
                            }`}
                          >
                            {badgeVariant ? (
                              <span
                                className={`sf-datatable__badge sf-datatable__badge--${badgeVariant}`}
                              >
                                {text}
                              </span>
                            ) : col.type === 'url' && raw ? (
                              <a
                                href={String(raw)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="sf-datatable__link"
                              >
                                {text}
                              </a>
                            ) : col.type === 'email' && raw ? (
                              <a
                                href={`mailto:${raw}`}
                                className="sf-datatable__link"
                              >
                                {text}
                              </a>
                            ) : col.type === 'phone' && raw ? (
                              <a
                                href={`tel:${raw}`}
                                className="sf-datatable__link"
                              >
                                {text}
                              </a>
                            ) : col.type === 'boolean' ? (
                              <span
                                className={
                                  raw
                                    ? 'sf-datatable__bool--true'
                                    : 'sf-datatable__bool--false'
                                }
                              >
                                {text}
                              </span>
                            ) : (
                              text
                            )}
                          </td>
                        );
                      })}
                      {actions.length > 0 && (
                        <td className="sf-datatable__td sf-datatable__td--actions">
                          {actions.map(action => (
                            <button
                              key={action.name}
                              className={`sf-datatable__action-btn${
                                action.variant === 'destructive'
                                  ? ' sf-datatable__action-btn--destructive'
                                  : ''
                              }`}
                              onClick={() => onRowAction?.(action.name, row)}
                            >
                              {action.label}
                            </button>
                          ))}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="sf-datatable__selection-bar">
          <strong>{selected.size}</strong> row{selected.size > 1 ? 's' : ''} selected
          <button
            className="sf-datatable__selection-clear"
            onClick={() => {
              setSelected(new Set());
              onSelectionChange?.([]);
            }}
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  );
}

export default SfDataTable;
