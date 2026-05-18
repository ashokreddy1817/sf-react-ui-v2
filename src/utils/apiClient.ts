/**
 * SalesforceApiClient — UI API wrapper for React on Salesforce
 *
 * Changelog (v2):
 *  - getRecord:       removed &layoutTypes= — SF rejects fields + layoutTypes together
 *  - getRecordLayout: recordTypeId moved INTO the path (was wrongly a query param)
 *  - getRecordLayout: now accepts layoutType ('Full'|'Compact') and mode param
 *  - getCompactLayout: NEW — /ui-api/compact-layouts/:object/:recordTypeId
 *  - layout walker:   deduplicates fields, always prepends 'Id'
 *  - cache:           keyed on layoutType so Full/Compact are cached separately
 */

import type {
  SfObjectInfo,
  SfRecord,
  SfPicklistValue,
  SfError,
  LookupResult,
} from '../types';

export type LayoutType = 'Full' | 'Compact';
export type LayoutMode = 'View' | 'Edit' | 'Create';

export class SalesforceApiClient {
  private orgUrl: string;
  private apiVersion: string;
  private accessToken?: string;
  private cache = new Map<string, unknown>();

  constructor(orgUrl: string, apiVersion = '59.0', accessToken?: string) {
    this.orgUrl = orgUrl.replace(/\/$/, '');
    this.apiVersion = apiVersion;
    this.accessToken = accessToken;
  }

  private get baseUrl() {
    return `${this.orgUrl}/services/data/v${this.apiVersion}`;
  }

  // ─── Internal request helper ──────────────────────────────────────────────────
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include', // session cookie inside LWR / Experience Cloud
      ...options,
      headers: { ...headers, ...((options.headers as Record<string, string>) ?? {}) },
    });

    if (!res.ok) {
      const errs = await res.json().catch(() => []);
      const first = Array.isArray(errs) ? errs[0] : errs;
      const sfErr: SfError = {
        message: first?.message ?? res.statusText,
        errorCode: first?.errorCode ?? String(res.status),
        fields: first?.fields,
        statusCode: res.status,
      };
      throw sfErr;
    }

    return res.json() as Promise<T>;
  }

  // ─── Object Info ─────────────────────────────────────────────────────────────
  async getObjectInfo(objectName: string): Promise<SfObjectInfo> {
    const cacheKey = `objectInfo:${objectName}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) as SfObjectInfo;

    const raw = await this.request<Record<string, unknown>>(
      `/ui-api/object-info/${objectName}`
    );

    const fields = raw.fields as Record<string, Record<string, unknown>>;
    const normalised: SfObjectInfo = {
      apiName: raw.apiName as string,
      label: raw.label as string,
      labelPlural: raw.labelPlural as string,
      defaultRecordTypeId: raw.defaultRecordTypeId as string,
      recordTypeInfos: raw.recordTypeInfos as SfObjectInfo['recordTypeInfos'],
      fields: Object.fromEntries(
        Object.entries(fields).map(([k, f]) => [
          k,
          {
            apiName: f.apiName as string,
            label: f.label as string,
            dataType: (
              f.dataType as string
            ).toLowerCase() as SfObjectInfo['fields'][string]['dataType'],
            required: f.required as boolean,
            updateable: f.updateable as boolean,
            createable: f.createable as boolean,
            flsAccess: f.updateable
              ? 'ReadWrite'
              : f.filterable
              ? 'ReadOnly'
              : 'NoAccess',
            referenceTo: f.referenceToInfos
              ? (f.referenceToInfos as Array<{ apiName: string }>).map((r) => r.apiName)
              : undefined,
            relationshipName: f.relationshipName as string | undefined,
          },
        ])
      ),
    };

    this.cache.set(cacheKey, normalised);
    return normalised;
  }

  // ─── Get record ───────────────────────────────────────────────────────────────
  // FIX: NO &layoutTypes= or &modes= — Salesforce UI API rejects requests that
  // pass BOTH ?fields= AND &layoutTypes= in the same call.
  async getRecord(
    objectName: string,
    recordId: string,
    fields: string[]
  ): Promise<SfRecord> {
    // UI API requires fields qualified as ObjectName.FieldName
    const fieldList = fields
      .map((f) => (f.includes('.') ? f : `${objectName}.${f}`))
      .join(',');

    const raw = await this.request<Record<string, unknown>>(
      `/ui-api/records/${recordId}?fields=${fieldList}`
      // ✅ No &layoutTypes=Full  ✅ No &modes=View
    );

    const rawFields = raw.fields as Record<
      string,
      { value: unknown; displayValue: string | null }
    >;

    return {
      id: raw.id as string,
      apiName: raw.apiName as string,
      recordTypeId: (raw.recordTypeInfo as { recordTypeId?: string } | null)
        ?.recordTypeId,
      lastModifiedById: raw.lastModifiedById as string,
      lastModifiedDate: raw.lastModifiedDate as string,
      fields: Object.fromEntries(
        Object.entries(rawFields).map(([k, v]) => [
          k,
          {
            value: v.value as string | number | boolean | null,
            displayValue: v.displayValue,
          },
        ])
      ),
    };
  }

  // ─── Get Full page layout (fields in admin-defined order) ────────────────────
  // FIX: recordTypeId MUST be in the URL path — NOT the query string.
  //
  //   ❌  /ui-api/layout/Account?layoutType=Full&mode=View&recordTypeId=012xxx
  //   ✅  /ui-api/layout/Account/012xxx?layoutType=Full&mode=View
  //
  // Returns field API names in the exact order the Salesforce admin configured
  // in Setup → Object Manager → Account → Page Layouts.
  async getRecordLayout(
    objectName: string,
    recordTypeId: string,
    layoutType: LayoutType = 'Full',
    mode: LayoutMode = 'View'
  ): Promise<string[]> {
    const cacheKey = `layout:${objectName}:${recordTypeId}:${layoutType}:${mode}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) as string[];

    try {
      // recordTypeId is part of the PATH
      const raw = await this.request<Record<string, unknown>>(
        `/ui-api/layout/${objectName}/${recordTypeId}?layoutType=${layoutType}&mode=${mode}`
      );

      const orderedFields = this.extractLayoutFields(raw);
      this.cache.set(cacheKey, orderedFields);
      return orderedFields;
    } catch {
      // Return empty — SfRecordForm falls back gracefully
      return [];
    }
  }

  // ─── Get Compact layout ───────────────────────────────────────────────────────
  // NEW: Fetches the compact highlight layout (4-8 fields).
  // Equivalent to lightning-record-form layout="Compact".
  //
  // Endpoint: /ui-api/compact-layouts/:objectName/:recordTypeId
  async getCompactLayout(
    objectName: string,
    recordTypeId: string
  ): Promise<string[]> {
    const cacheKey = `compactLayout:${objectName}:${recordTypeId}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) as string[];

    try {
      const raw = await this.request<Record<string, unknown>>(
        `/ui-api/compact-layouts/${objectName}/${recordTypeId}`
      );

      // Response shape: { fieldItems: [{ fieldApiName: 'Name' }, ...] }
      const fields = (
        (raw.fieldItems as Array<{ fieldApiName?: string }>) ?? []
      )
        .map((item) => item.fieldApiName)
        .filter((f): f is string => Boolean(f));

      this.cache.set(cacheKey, fields);
      return fields;
    } catch {
      return [];
    }
  }

  // ─── Walk layout sections → extract ordered field API names ──────────────────
  private extractLayoutFields(raw: Record<string, unknown>): string[] {
    type LayoutComponent = { componentType: string; apiName?: string };
    type LayoutItem = { layoutComponents?: LayoutComponent[] };
    type LayoutRow = { layoutItems?: LayoutItem[] };
    type LayoutSection = { layoutRows?: LayoutRow[] };

    const sections = (raw.sections as LayoutSection[]) ?? [];
    const seen = new Set<string>();
    const fields: string[] = [];

    // Always include Id first
    seen.add('Id');
    fields.push('Id');

    for (const section of sections) {
      for (const row of section.layoutRows ?? []) {
        for (const item of row.layoutItems ?? []) {
          for (const comp of item.layoutComponents ?? []) {
            if (
              comp.componentType === 'Field' &&
              comp.apiName &&
              !seen.has(comp.apiName)
            ) {
              seen.add(comp.apiName);
              fields.push(comp.apiName);
            }
          }
        }
      }
    }

    return fields;
  }

  // ─── Create record ────────────────────────────────────────────────────────────
  async createRecord(
    objectName: string,
    data: Record<string, unknown>
  ): Promise<SfRecord> {
    const res = await this.request<{ id: string }>('/ui-api/records', {
      method: 'POST',
      body: JSON.stringify({ apiName: objectName, fields: data }),
    });
    return this.getRecord(objectName, res.id, Object.keys(data));
  }

  // ─── Update record ────────────────────────────────────────────────────────────
  async updateRecord(
    objectName: string,
    recordId: string,
    data: Record<string, unknown>
  ): Promise<SfRecord> {
    await this.request<void>(`/ui-api/records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ apiName: objectName, fields: data }),
    });
    return this.getRecord(objectName, recordId, Object.keys(data));
  }

  // ─── Picklist values ──────────────────────────────────────────────────────────
  async getPicklistValues(
    objectName: string,
    recordTypeId: string,
    fieldName: string
  ): Promise<SfPicklistValue[]> {
    const cacheKey = `picklist:${objectName}:${recordTypeId}:${fieldName}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) as SfPicklistValue[];

    const raw = await this.request<{
      values: Array<{ label: string; value: string; validFor?: string[] }>;
    }>(
      `/ui-api/object-info/${objectName}/picklist-values/${recordTypeId}/${fieldName}`
    );

    // UI API only returns active values — we set active: true for all
    const normalised: SfPicklistValue[] = (raw.values ?? []).map((v) => ({
      label: v.label,
      value: v.value,
      active: true,
      validFor: v.validFor,
    }));

    this.cache.set(cacheKey, normalised);
    return normalised;
  }

  // ─── Lookup search (SOSL) ─────────────────────────────────────────────────────
  async searchRecords(
    objectName: string,
    query: string,
    limit = 10
  ): Promise<LookupResult[]> {
    if (!query || query.length < 2) return [];
    const sosl = encodeURIComponent(
      `FIND {${query}*} IN NAME FIELDS RETURNING ${objectName}(Id, Name LIMIT ${limit})`
    );
    const raw = await this.request<{
      searchRecords: Array<{ Id: string; Name: string }>;
    }>(`/search/?q=${sosl}`);
    return (raw.searchRecords ?? []).map((r) => ({ id: r.Id, name: r.Name }));
  }

  clearCache() {
    this.cache.clear();
  }
}