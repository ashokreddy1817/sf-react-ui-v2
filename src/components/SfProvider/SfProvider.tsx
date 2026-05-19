import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { SalesforceApiClient } from '../../utils/apiClient';
import type {
  SfContextValue, SfProviderConfig, SfObjectInfo, SfRecord,
  SfPicklistValue, LookupResult, LayoutType, LayoutMode,
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

export function SfProvider({ orgUrl, apiVersion = '59.0', accessToken, onAuthError, children }: SfProviderProps) {
  const client = useMemo(
    () => new SalesforceApiClient(orgUrl, apiVersion, accessToken),
    [orgUrl, apiVersion, accessToken]
  );

  const ctx: SfContextValue = useMemo(() => {
    const withAuth = <T,>(p: Promise<T>): Promise<T> =>
      p.catch((e: { statusCode?: number }) => { if (e.statusCode === 401) onAuthError?.(); throw e; });

    return {
      config: { orgUrl, apiVersion, accessToken, onAuthError },
      getObjectInfo:    (o) =>             withAuth(client.getObjectInfo(o)),
      getRecord:        (o, id, f) =>      withAuth(client.getRecord(o, id, f)),
      getRecordLayout:  (o, rt, lt, m) =>  withAuth(client.getRecordLayout(o, rt, lt, m)),
      getCompactLayout: (o, rt) =>         withAuth(client.getCompactLayout(o, rt)),
      createRecord:     (o, d) =>          withAuth(client.createRecord(o, d)),
      updateRecord:     (o, id, d) =>      withAuth(client.updateRecord(o, id, d)),
      getPicklistValues:(o, rt, f) =>      client.getPicklistValues(o, rt, f),
      searchRecords:    (o, q, l) =>       client.searchRecords(o, q, l),
    };
  }, [client, orgUrl, apiVersion, accessToken, onAuthError]);

  return <SfContext.Provider value={ctx}>{children}</SfContext.Provider>;
}
