import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { SalesforceApiClient } from '../../utils/apiClient';
import type {
  SfContextValue, SfObjectInfo, SfRecord,
  SfPicklistValue, LookupResult, LayoutType, LayoutMode, SfRelatedListInfo,
} from '../../types';

const SfContext = createContext<SfContextValue | null>(null);

export function useSfContext(): SfContextValue {
  const ctx = useContext(SfContext);
  if (!ctx) throw new Error('[sf-react-ui] useSfContext must be used inside <SfProvider>.');
  return ctx;
}

interface SfProviderProps {
  orgUrl: string;
  apiVersion?: string;
  accessToken?: string;
  onAuthError?: () => void;
  children: ReactNode;
}

export function SfProvider({
  orgUrl, apiVersion = '59.0', accessToken, onAuthError, children,
}: SfProviderProps) {
  const client = useMemo(
    () => new SalesforceApiClient(orgUrl, apiVersion, accessToken),
    [orgUrl, apiVersion, accessToken]
  );

  const ctx: SfContextValue = useMemo(() => {
    const withAuth = <T,>(p: Promise<T>): Promise<T> =>
      p.catch((e: { statusCode?: number }) => {
        if (e.statusCode === 401) onAuthError?.();
        throw e;
      });

    return {
      config: { orgUrl, apiVersion, accessToken, onAuthError },

      // ── Core record operations ──────────────────────────────────────────────
      getObjectInfo:    o =>          withAuth(client.getObjectInfo(o)),
      getRecord:        (o, id, f) => withAuth(client.getRecord(o, id, f)),
      getRecordLayout:  (o, rt, lt, m) => withAuth(client.getRecordLayout(o, rt, lt as LayoutType, m as LayoutMode)),
      getCompactLayout: (o, rt) =>    withAuth(client.getCompactLayout(o, rt)),
      createRecord:     (o, d) =>     withAuth(client.createRecord(o, d)),
      updateRecord:     (o, id, d) => withAuth(client.updateRecord(o, id, d)),
      getPicklistValues:(o, rt, f) => client.getPicklistValues(o, rt, f),
      searchRecords:    (o, q, l) =>  client.searchRecords(o, q, l),

      // ── Related list ────────────────────────────────────────────────────────
      getRelatedListInfo:    (parentObj, listId) =>
        withAuth(client.getRelatedListInfo(parentObj, listId)),
      getRelatedListRecords: (parentId, listId, fields) =>
        withAuth(client.getRelatedListRecords(parentId, listId, fields)),

      // ── FIX: Generic query endpoint ─────────────────────────────────────────
      // Exposes the apiClient's internal request() so components like SfChart
      // can run arbitrary REST API calls (e.g. /query?q=...) through the same
      // transport layer that handles auth headers and credentials:'include'.
      // This avoids each component manually building fetch URLs from orgUrl,
      // which breaks when orgUrl="" inside a UIBundle.
      executeQuery: <T,>(path: string) => withAuth(client.executeQuery<T>(path)),
    };
  }, [client, orgUrl, apiVersion, accessToken, onAuthError]);

  return <SfContext.Provider value={ctx}>{children}</SfContext.Provider>;
}
