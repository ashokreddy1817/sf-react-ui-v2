/**
 * SfPicklistSelect — React equivalent of lightning-combobox for Salesforce picklist fields
 *
 * Features:
 *  - Loads picklist values dynamically from UI API via useSfContext().getPicklistValues
 *  - Record-type-aware (values change when recordTypeId changes)
 *  - Multi-select mode (multipicklist fields)
 *  - Controlled + uncontrolled modes
 *  - Dependent picklist support via validFor filtering
 *  - Required / disabled / read-only states
 *  - Keyboard navigation in custom dropdown
 *  - Loading skeleton while fetching values
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useId,
  type KeyboardEvent,
} from 'react';
import { useSfContext } from '../SfProvider/SfProvider';
import type { SfPicklistSelectProps, SfPicklistValue } from '../../types';
import './SfPicklistSelect.css';

export function SfPicklistSelect({
  objectApiName,
  fieldApiName,
  recordTypeId,
  label,
  value,
  multiple = false,
  placeholder = '— Select —',
  required = false,
  disabled = false,
  readOnly = false,
  filterByController,
  onChange,
  onError,
  className = '',
}: SfPicklistSelectProps) {
  const { getPicklistValues, getObjectInfo } = useSfContext();
  const selectId = useId();

  const [options, setOptions]       = useState<SfPicklistValue[]>([]);
  const [loading, setLoading]       = useState(true);
  const [open, setOpen]             = useState(false);
  const [activeIdx, setActiveIdx]   = useState(-1);
  const [resolvedRtId, setResolvedRtId] = useState<string | null>(recordTypeId ?? null);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef      = useRef<HTMLUListElement>(null);

  // Normalise value to array for unified handling
  const selectedValues: string[] = Array.isArray(value)
    ? value
    : value
    ? [value]
    : [];

  // ── Resolve recordTypeId if not provided ──────────────────────────────────
  useEffect(() => {
    if (recordTypeId) {
      setResolvedRtId(recordTypeId);
      return;
    }
    getObjectInfo(objectApiName)
      .then((info) => setResolvedRtId(info.defaultRecordTypeId))
      .catch(() => setResolvedRtId('012000000000000AAA'));
  }, [objectApiName, recordTypeId]);

  // ── Load picklist values ───────────────────────────────────────────────────
  useEffect(() => {
    if (!resolvedRtId) return;
    setLoading(true);
    getPicklistValues(objectApiName, resolvedRtId, fieldApiName)
      .then((vals) => {
        let active = vals.filter((v) => v.active);
        // Dependent picklist filtering
        if (filterByController !== undefined && filterByController !== null && filterByController !== '') {
          active = active.filter((v) =>
            !v.validFor || v.validFor.includes(String(filterByController))
          );
        }
        setOptions(active);
      })
      .catch((e: unknown) => {
        onError?.(e as { message: string });
        setOptions([]);
      })
      .finally(() => setLoading(false));
  }, [objectApiName, fieldApiName, resolvedRtId, filterByController]);

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Toggle option (multi) or select (single) ───────────────────────────────
  const toggleOption = useCallback((val: string) => {
    if (multiple) {
      const next = selectedValues.includes(val)
        ? selectedValues.filter((v) => v !== val)
        : [...selectedValues, val];
      onChange?.(next, next);
    } else {
      onChange?.(val, [val]);
      setOpen(false);
    }
  }, [multiple, selectedValues, onChange]);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || readOnly) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) { setOpen(true); setActiveIdx(0); }
        else if (activeIdx >= 0 && options[activeIdx]) toggleOption(options[activeIdx].value);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!open) setOpen(true);
        setActiveIdx((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        break;
      case 'Escape':
        setOpen(false);
        break;
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  // ── Display label for trigger ──────────────────────────────────────────────
  const triggerLabel = () => {
    if (selectedValues.length === 0) return placeholder;
    if (multiple) {
      if (selectedValues.length === 1) {
        return options.find((o) => o.value === selectedValues[0])?.label ?? selectedValues[0];
      }
      return `${selectedValues.length} selected`;
    }
    return options.find((o) => o.value === selectedValues[0])?.label ?? selectedValues[0];
  };

  const hasValue = selectedValues.length > 0;
  const isInteractive = !disabled && !readOnly;

  return (
    <div
      ref={containerRef}
      className={`sf-picklist ${className} ${disabled ? 'sf-picklist--disabled' : ''} ${readOnly ? 'sf-picklist--readonly' : ''}`}
    >
      {/* Label */}
      {label && (
        <label htmlFor={selectId} className="sf-picklist__label">
          {label}
          {required && <span className="sf-picklist__required" aria-hidden="true">*</span>}
        </label>
      )}

      {/* Trigger */}
      <div
        id={selectId}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-required={required}
        aria-disabled={disabled}
        tabIndex={isInteractive ? 0 : -1}
        className={`sf-picklist__trigger ${hasValue ? 'sf-picklist__trigger--has-value' : ''} ${open ? 'sf-picklist__trigger--open' : ''}`}
        onClick={() => isInteractive && setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
      >
        {loading ? (
          <span className="sf-picklist__loading">Loading…</span>
        ) : (
          <>
            <span className="sf-picklist__trigger-label">{triggerLabel()}</span>
            {/* Multi-select chips preview */}
            {multiple && selectedValues.length > 1 && (
              <div className="sf-picklist__chips">
                {selectedValues.slice(0, 3).map((v) => (
                  <span key={v} className="sf-picklist__chip">
                    {options.find((o) => o.value === v)?.label ?? v}
                    {isInteractive && (
                      <button
                        type="button"
                        className="sf-picklist__chip-remove"
                        onClick={(e) => { e.stopPropagation(); toggleOption(v); }}
                        aria-label={`Remove ${v}`}
                      >✕</button>
                    )}
                  </span>
                ))}
                {selectedValues.length > 3 && (
                  <span className="sf-picklist__chip sf-picklist__chip--more">
                    +{selectedValues.length - 3}
                  </span>
                )}
              </div>
            )}
          </>
        )}
        <span className="sf-picklist__arrow" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </div>

      {/* Dropdown */}
      {open && !loading && (
        <ul
          ref={listRef}
          role="listbox"
          aria-multiselectable={multiple}
          className="sf-picklist__dropdown"
        >
          {/* Clear option for single-select non-required */}
          {!multiple && !required && (
            <li
              role="option"
              aria-selected={selectedValues.length === 0}
              className={`sf-picklist__option sf-picklist__option--empty ${selectedValues.length === 0 ? 'sf-picklist__option--selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); onChange?.('', []); setOpen(false); }}
            >
              {placeholder}
            </li>
          )}

          {options.length === 0 ? (
            <li className="sf-picklist__option sf-picklist__option--empty">
              No options available
            </li>
          ) : (
            options.map((opt, i) => {
              const isSelected = selectedValues.includes(opt.value);
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  className={`sf-picklist__option ${isSelected ? 'sf-picklist__option--selected' : ''} ${i === activeIdx ? 'sf-picklist__option--active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); toggleOption(opt.value); }}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  {multiple && (
                    <span className="sf-picklist__check" aria-hidden="true">
                      {isSelected ? '✓' : ''}
                    </span>
                  )}
                  {opt.label}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

export default SfPicklistSelect;
