import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { SalesforceApiClient } from '../../utils/apiClient';
import type {
  SfContextValue,
  SfObjectInfo,
  SfRecord,
  SfPicklistValue,
  LookupResult,
  LayoutType,
  LayoutMode,
} from '../../types';

// ─── Context ──────────────────────────────────────────────────────────────────

const SfContext = createContext<SfContextValue | null>(null);

export function useSfContext(): SfContextValue {
  const ctx = useContext(SfContext);
  if (!ctx) {
    throw new Error(
      '[sf-react-ui] useSfContext must be used inside <SfProvider>. ' +
        'Wrap your app root with <SfProvider orgUrl="https://yourorg.my.salesforce.com" />.'
    );
  }
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface SfProviderProps {
  orgUrl: string;
  apiVersion?: string;
  accessToken?: string;
  onAuthError?: () => void;
  children: ReactNode;
}

export function SfProvider({
  orgUrl,
  apiVersion = '59.0',
  accessToken,
  onAuthError,
  children,
}: SfProviderProps) {
  const client = useMemo(
    () => new SalesforceApiClient(orgUrl, apiVersion, accessToken),
    [orgUrl, apiVersion, accessToken]
  );

  const ctx: SfContextValue = useMemo(() => {
    // withAuth inside useMemo — closes over stable client + onAuthError,
    // no stale closure, no exhaustive-deps suppression needed.
    const withAuth = <T,>(promise: Promise<T>): Promise<T> =>
      promise.catch((e: { statusCode?: number }) => {
        if (e.statusCode === 401) onAuthError?.();
        throw e;
      });

    return {
      config: { orgUrl, apiVersion, accessToken, onAuthError },

      getObjectInfo: (objectName: string): Promise<SfObjectInfo> =>
        withAuth(client.getObjectInfo(objectName)),

      getRecord: (
        objectName: string,
        recordId: string,
        fields: string[]
      ): Promise<SfRecord> =>
        withAuth(client.getRecord(objectName, recordId, fields)),

      getRecordLayout: (
        objectName: string,
        recordTypeId: string,
        layoutType: LayoutType = 'Full',
        mode: LayoutMode = 'View'
      ): Promise<string[]> =>
        withAuth(client.getRecordLayout(objectName, recordTypeId, layoutType, mode)),

      getCompactLayout: (
        objectName: string,
        recordTypeId: string
      ): Promise<string[]> =>
        withAuth(client.getCompactLayout(objectName, recordTypeId)),

      createRecord: (
        objectName: string,
        data: Record<string, unknown>
      ): Promise<SfRecord> =>
        withAuth(client.createRecord(objectName, data)),

      updateRecord: (
        objectName: string,
        recordId: string,
        data: Record<string, unknown>
      ): Promise<SfRecord> =>
        withAuth(client.updateRecord(objectName, recordId, data)),

      getPicklistValues: (
        objectName: string,
        recordTypeId: string,
        fieldName: string
      ): Promise<SfPicklistValue[]> =>
        client.getPicklistValues(objectName, recordTypeId, fieldName),

      searchRecords: (
        objectName: string,
        query: string,
        limit?: number
      ): Promise<LookupResult[]> =>
        client.searchRecords(objectName, query, limit),
    };
  }, [client, orgUrl, apiVersion, accessToken, onAuthError]);

  return <SfContext.Provider value={ctx}>{children}</SfContext.Provider>;
}
