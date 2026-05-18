import { useState, useEffect, useCallback } from 'react';
import { useSfContext } from '../components/SfProvider/SfProvider';
import type {
  SfObjectInfo,
  SfRecord,
  SfPicklistValue,
  SfError,
  LookupResult,
} from '../types';

// ─── useObjectInfo ─────────────────────────────────────────────────────────────
export function useObjectInfo(objectName: string) {
  const { getObjectInfo } = useSfContext();
  const [data, setData] = useState<SfObjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SfError | null>(null);

  useEffect(() => {
    if (!objectName) return;
    setLoading(true);
    setError(null);
    getObjectInfo(objectName)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [objectName, getObjectInfo]);

  return { data, loading, error };
}

// ─── useRecord ─────────────────────────────────────────────────────────────────
export function useRecord(objectName: string, recordId?: string, fields?: string[]) {
  const { getRecord, config } = useSfContext();
  const [data, setData] = useState<SfRecord | null>(null);
  const [loading, setLoading] = useState(!!recordId);
  const [error, setError] = useState<SfError | null>(null);

  const fieldList = fields ?? ['Id', 'Name'];

  const refetch = useCallback(() => {
    if (!recordId || !objectName) return;
    setLoading(true);
    setError(null);
    getRecord(objectName, recordId, fieldList)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [objectName, recordId, fieldList.join(','), getRecord]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

// ─── usePicklistValues ─────────────────────────────────────────────────────────
export function usePicklistValues(
  objectName: string,
  recordTypeId: string,
  fieldName: string
) {
  const { getPicklistValues } = useSfContext();
  const [values, setValues] = useState<SfPicklistValue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!objectName || !recordTypeId || !fieldName) return;
    setLoading(true);
    getPicklistValues(objectName, recordTypeId, fieldName)
      .then(setValues)
      .finally(() => setLoading(false));
  }, [objectName, recordTypeId, fieldName, getPicklistValues]);

  return { values, loading };
}

// ─── useLookupSearch ──────────────────────────────────────────────────────────
export function useLookupSearch(objectName: string) {
  const { searchRecords } = useSfContext();
  const [results, setResults] = useState<LookupResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(
    async (query: string) => {
      if (!query || query.length < 2) { setResults([]); return; }
      setLoading(true);
      try {
        const res = await searchRecords(objectName, query);
        setResults(res);
      } finally {
        setLoading(false);
      }
    },
    [objectName, searchRecords]
  );

  const clear = useCallback(() => setResults([]), []);

  return { results, loading, search, clear };
}
