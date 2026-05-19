/**
 * SfPicklistSelect — React equivalent of lightning-combobox
 *
 * FIX: The previous version had a race condition where the picklist values
 * useEffect would fire with resolvedRtId = null (before objectInfo loaded)
 * and then NEVER retry because the dependency array only included resolvedRtId,
 * which didn't change if the objectInfo fetch set it to the same value.
 *
 * FIX: Merged the two effects (resolve RT ID + fetch picklist) into one flow
 * using async/await inside a single effect, so the sequence is guaranteed.
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

  const [options, setOptions]     = useState<SfPicklistValue[]>([]);
  const [loading, setLoading]     = useState(true);
  const [open, setOpen]           = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef      = useRef<HTMLUListElement>(null);

  // Normalise value to array
  const selectedValues: string[] = Array.isArray(value)
    ? value
    : value ? [value] : [];

  // ── FIX: Single effect resolves RT ID then fetches picklist ──────────────────
  // Previously split into 2 effects which caused a race:
  //   Effect 1 sets resolvedRtId (async)
  //   Effect 2 watches resolvedRtId — but fires with null before Effect 1 finishes
  //   Once resolvedRtId is set, Effect 2 doesn't re-run if the value doesn't change
  // Now everything is in one async flow — guaranteed sequential execution.
  useEffect(() => {
    let cancelled = false;

    const loadOptions = async () => {
      setLoading(true);
      try {
        // Step 1: resolve record type ID
        let rtId = recordTypeId;
        if (!rtId) {
          try {
            const info = await getObjectInfo(objectApiName);
            rtId = info.defaultRecordTypeId ?? '012000000000000AAA';
          } catch {
            rtId = '012000000000000AAA';
          }
        }
        if (cancelled) return;

        // Step 2: fetch picklist values with the resolved RT ID
        const vals = await getPicklistValues(objectApiName, rtId, fieldApiName);
        if (cancelled) return;

        let active = vals.filter(v => v.active);

        // Dependent picklist filtering
        if (filterByController !== undefined && filterByController !== null && filterByController !== '') {
          active = active.filter(v =>
            !v.validFor || v.validFor.includes(String(filterByController))
          );
        }

        setOptions(active);
      } catch (e: unknown) {
        if (!cancelled) {
          onError?.(e as { message: string });
          setOptions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadOptions();
    return () => { cancelled = true; };
  // Intentionally include filterByController so dependent picklists re-fetch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectApiName, fieldApiName, recordTypeId, filterByController]);

  // ── Close on outside click ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Toggle selection ──────────────────────────────────────────────────────────
  const toggleOption = useCallback((val: string) => {
    if (multiple) {
      const next = selectedValues.includes(val)
        ? selectedValues.filter(v => v !== val)
        : [...selectedValues, val];
      onChange?.(next, next);
    } else {
      onChange?.(val, [val]);
      setOpen(false);
    }
  }, [multiple, selectedValues, onChange]);

  // ── Keyboard navigation ───────────────────────────────────────────────────────
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
        setActiveIdx(i => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
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

  // ── Trigger label ─────────────────────────────────────────────────────────────
  const triggerLabel = () => {
    if (selectedValues.length === 0) return placeholder;
    if (multiple && selectedValues.length > 1) return `${selectedValues.length} selected`;
    return options.find(o => o.value === selectedValues[0])?.label ?? selectedValues[0];
  };

  const hasValue       = selectedValues.length > 0;
  const isInteractive  = !disabled && !readOnly;

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
        onClick={() => isInteractive && !loading && setOpen(o => !o)}
        onKeyDown={handleKeyDown}
      >
        {loading ? (
          <span className="sf-picklist__loading">Loading…</span>
        ) : (
          <>
            <span className="sf-picklist__trigger-label">{triggerLabel()}</span>
            {multiple && selectedValues.length > 1 && (
              <div className="sf-picklist__chips">
                {selectedValues.slice(0, 3).map(v => (
                  <span key={v} className="sf-picklist__chip">
                    {options.find(o => o.value === v)?.label ?? v}
                    {isInteractive && (
                      <button
                        type="button"
                        className="sf-picklist__chip-remove"
                        onClick={e => { e.stopPropagation(); toggleOption(v); }}
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
              onMouseDown={e => { e.preventDefault(); onChange?.('', []); setOpen(false); }}
            >
              {placeholder}
            </li>
          )}

          {options.length === 0 ? (
            <li className="sf-picklist__option sf-picklist__option--empty">
              No options available
            </li>
          ) : options.map((opt, i) => {
            const isSelected = selectedValues.includes(opt.value);
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                className={`sf-picklist__option ${isSelected ? 'sf-picklist__option--selected' : ''} ${i === activeIdx ? 'sf-picklist__option--active' : ''}`}
                onMouseDown={e => { e.preventDefault(); toggleOption(opt.value); }}
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
          })}
        </ul>
      )}
    </div>
  );
}

export default SfPicklistSelect;
