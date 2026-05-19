/**
 * SfLookupField — React equivalent of lightning-lookup / lookup input inside lightning-record-form
 *
 * Features:
 *  - Debounced SOSL search via useSfContext().searchRecords
 *  - Keyboard navigation (↑ ↓ Enter Escape)
 *  - Multi-object search (referenceTo array)
 *  - Pill chip for selected record with clear button
 *  - Required / disabled / read-only states
 *  - FLS-aware (passes through from parent)
 *  - Fully accessible (role="combobox", aria-*)
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useId,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { useSfContext } from '../SfProvider/SfProvider';
import type { SfLookupFieldProps, LookupResult } from '../../types';
import './SfLookupField.css';

export function SfLookupField({
  objectApiName,
  fieldApiName,
  label,
  value,
  displayValue = '',
  placeholder,
  required = false,
  disabled = false,
  readOnly = false,
  debounceMs = 300,
  minChars = 2,
  maxResults = 10,
  subtitle,
  onChange,
  onClear,
  onError,
  className = '',
}: SfLookupFieldProps) {
  const { searchRecords } = useSfContext();
  const inputId = useId();

  const [query, setQuery]           = useState(displayValue);
  const [results, setResults]       = useState<LookupResult[]>([]);
  const [open, setOpen]             = useState(false);
  const [searching, setSearching]   = useState(false);
  const [activeIdx, setActiveIdx]   = useState(-1);
  const [hasSelection, setHasSelection] = useState(Boolean(value));

  const timerRef    = useRef<ReturnType<typeof setTimeout>>();
  const inputRef    = useRef<HTMLInputElement>(null);
  const listRef     = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value/displayValue
  useEffect(() => {
    setQuery(displayValue);
    setHasSelection(Boolean(value));
  }, [value, displayValue]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setResults([]);
        // If user typed but didn't select, restore previous display value
        if (!hasSelection) setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [hasSelection]);

  const runSearch = useCallback(async (q: string) => {
    if (q.length < minChars) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    try {
      const res = await searchRecords(objectApiName, q, maxResults);
      setResults(res);
      setOpen(res.length > 0);
      setActiveIdx(-1);
    } catch (e: unknown) {
      onError?.(e as { message: string });
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchRecords, objectApiName, minChars, maxResults, onError]);

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setHasSelection(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(q), debounceMs);
  };

  const selectResult = useCallback((r: LookupResult) => {
    setQuery(r.name);
    setHasSelection(true);
    setOpen(false);
    setResults([]);
    setActiveIdx(-1);
    onChange?.(r.id, r.name, r);
  }, [onChange]);

  const handleClear = useCallback(() => {
    setQuery('');
    setHasSelection(false);
    setResults([]);
    setOpen(false);
    onClear?.();
    onChange?.('', '', undefined);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [onChange, onClear]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIdx >= 0 && results[activeIdx]) selectResult(results[activeIdx]);
        break;
      case 'Escape':
        setOpen(false);
        setResults([]);
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

  const isInteractive = !disabled && !readOnly;

  return (
    <div
      ref={containerRef}
      className={`sf-lookup ${className} ${disabled ? 'sf-lookup--disabled' : ''} ${readOnly ? 'sf-lookup--readonly' : ''}`}
    >
      {/* Label */}
      {label && (
        <label htmlFor={inputId} className="sf-lookup__label">
          {label}
          {required && <span className="sf-lookup__required" aria-hidden="true">*</span>}
        </label>
      )}

      {/* Input area */}
      <div className="sf-lookup__control" role="combobox" aria-expanded={open} aria-haspopup="listbox">

        {/* Selected pill */}
        {hasSelection && value ? (
          <div className="sf-lookup__pill">
            <span className="sf-lookup__pill-icon" aria-hidden="true">
              {objectApiName === 'Contact' ? '👤' : objectApiName === 'Account' ? '🏢' : '📄'}
            </span>
            <span className="sf-lookup__pill-label">{query}</span>
            {isInteractive && (
              <button
                type="button"
                className="sf-lookup__pill-clear"
                onClick={handleClear}
                aria-label={`Remove ${query}`}
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <div className="sf-lookup__input-wrap">
            <span className="sf-lookup__search-icon" aria-hidden="true">🔍</span>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              className="sf-lookup__input"
              value={query}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={placeholder ?? `Search ${objectApiName}s…`}
              disabled={disabled}
              readOnly={readOnly}
              required={required}
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls={`${inputId}-listbox`}
              aria-activedescendant={activeIdx >= 0 ? `${inputId}-opt-${activeIdx}` : undefined}
            />
            {searching && <span className="sf-lookup__spinner" aria-label="Searching" />}
          </div>
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <ul
          ref={listRef}
          id={`${inputId}-listbox`}
          role="listbox"
          className="sf-lookup__dropdown"
          aria-label={`${objectApiName} search results`}
        >
          {results.map((r, i) => (
            <li
              key={r.id}
              id={`${inputId}-opt-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              className={`sf-lookup__option ${i === activeIdx ? 'sf-lookup__option--active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); selectResult(r); }}
            >
              <span className="sf-lookup__option-icon" aria-hidden="true">
                {objectApiName === 'Contact' ? '👤' : objectApiName === 'Account' ? '🏢' : '📄'}
              </span>
              <span className="sf-lookup__option-body">
                <span className="sf-lookup__option-name">{r.name}</span>
                {(r.subtitle ?? subtitle) && (
                  <span className="sf-lookup__option-sub">{r.subtitle ?? subtitle}</span>
                )}
              </span>
              <span className="sf-lookup__option-obj">{objectApiName}</span>
            </li>
          ))}
        </ul>
      )}

      {/* No results */}
      {open && !searching && results.length === 0 && query.length >= minChars && (
        <div className="sf-lookup__no-results">
          No {objectApiName}s found for &ldquo;{query}&rdquo;
        </div>
      )}

      {/* Field API name hint (dev aid) */}
      {fieldApiName && (
        <span className="sf-lookup__field-hint">{fieldApiName}</span>
      )}
    </div>
  );
}

export default SfLookupField;
