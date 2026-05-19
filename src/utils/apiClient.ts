/**
 * SalesforceApiClient — UI API wrapper
 *
 * Fixes:
 *  - getRecord: no &layoutTypes= (SF rejects fields + layoutTypes together)
 *  - getRecordLayout: recordTypeId in URL PATH not query string
 *  - getCompactLayout: correct endpoint /ui-api/compact-layouts/:object
 *    NOTE: compact layout endpoint does NOT take recordTypeId in path on all orgs
 *  - All layout fallbacks return graceful empty array
 *  - [FIXED] Added getRelatedListInfo and getRelatedListRecords to satisfy SfContextValue
 */

import type {
  SfObjectInfo, SfRecord, SfPicklistValue, SfError, LookupResult, SfRelatedListInfo,
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

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;

    const res = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
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

  // ── Object Info ──────────────────────────────────────────────────────────────
  async getObjectInfo(objectName: string): Promise<SfObjectInfo> {
    const key = `objectInfo:${objectName}`;
    if (this.cache.has(key)) return this.cache.get(key) as SfObjectInfo;

    const raw = await this.request<Record<string, unknown>>(`/ui-api/object-info/${objectName}`);

    const fields = raw.fields as Record<string, Record<string, unknown>>;
    const normalised: SfObjectInfo = {
      apiName: raw.apiName as string,
      label: raw.label as string,
      labelPlural: raw.labelPlural as string,
      defaultRecordTypeId: raw.defaultRecordTypeId as string,
      recordTypeInfos: raw.recordTypeInfos as SfObjectInfo['recordTypeInfos'],
      fields: Object.fromEntries(
        Object.entries(fields).map(([k, f]) => [k, {
          apiName:          f.apiName as string,
          label:            f.label as string,
          dataType:         (f.dataType as string).toLowerCase() as SfObjectInfo['fields'][string]['dataType'],
          required:         (f.required as boolean) && !(f.nillable as boolean),
          nillable:         f.nillable as boolean,
          updateable:       f.updateable as boolean,
          createable:       f.createable as boolean,
          flsAccess:        f.updateable ? 'ReadWrite' : f.filterable ? 'ReadOnly' : 'NoAccess',
          referenceTo:      f.referenceToInfos
            ? (f.referenceToInfos as Array<{ apiName: string }>).map(r => r.apiName)
            : undefined,
          relationshipName: f.relationshipName as string | undefined,
        }])
      ),
    };

    this.cache.set(key, normalised);
    return normalised;
  }

  // ── Get Record ───────────────────────────────────────────────────────────────
  // FIX: NO &layoutTypes= — Salesforce rejects ?fields= + &layoutTypes= together
  async getRecord(objectName: string, recordId: string, fields: string[]): Promise<SfRecord> {
    const fieldList = fields
      .map(f => f.includes('.') ? f : `${objectName}.${f}`)
      .join(',');

    const raw = await this.request<Record<string, unknown>>(
      `/ui-api/records/${recordId}?fields=${fieldList}`
    );

    const rawFields = raw.fields as Record<string, { value: unknown; displayValue: string | null }>;
    return {
      id:                 raw.id as string,
      apiName:            raw.apiName as string,
      recordTypeId:       (raw.recordTypeInfo as { recordTypeId?: string } | null)?.recordTypeId,
      lastModifiedById:   raw.lastModifiedById as string,
      lastModifiedDate:   raw.lastModifiedDate as string,
      fields:             Object.fromEntries(
        Object.entries(rawFields).map(([k, v]) => [k, {
          value:        v.value as string | number | boolean | null,
          displayValue: v.displayValue,
        }])
      ),
    };
  }

  // ── Full Layout ──────────────────────────────────────────────────────────────
  // FIX: recordTypeId MUST be in path: /ui-api/layout/:object/:recordTypeId
  async getRecordLayout(
    objectName: string,
    recordTypeId: string,
    layoutType: LayoutType = 'Full',
    mode: LayoutMode = 'View'
  ): Promise<string[]> {
    const key = `layout:${objectName}:${recordTypeId}:${layoutType}:${mode}`;
    if (this.cache.has(key)) return this.cache.get(key) as string[];

    try {
      // recordTypeId in PATH — not query string
      const raw = await this.request<Record<string, unknown>>(
        `/ui-api/layout/${objectName}/${recordTypeId}?layoutType=${layoutType}&mode=${mode}`
      );
      const fields = this.extractLayoutFields(raw);
      this.cache.set(key, fields);
      return fields;
    } catch {
      return [];
    }
  }

  // ── Compact Layout ───────────────────────────────────────────────────────────
  // FIX: correct endpoint is /ui-api/compact-layouts/:objectName
  // The per-recordType variant /:objectName/:recordTypeId may 404 on scratch orgs
  // so we try that first then fall back to the object-level endpoint
  async getCompactLayout(objectName: string, recordTypeId: string): Promise<string[]> {
    const key = `compact:${objectName}:${recordTypeId}`;
    if (this.cache.has(key)) return this.cache.get(key) as string[];

    // Try 1: per record-type compact layout
    try {
      const raw = await this.request<Record<string, unknown>>(
        `/ui-api/compact-layouts/${objectName}/${recordTypeId}`
      );
      const fields = this.extractCompactFields(raw);
      if (fields.length > 0) {
        this.cache.set(key, fields);
        return fields;
      }
    } catch { /* fall through */ }

    // Try 2: object-level compact layouts (returns all record types)
    try {
      const raw = await this.request<Record<string, unknown>>(
        `/ui-api/compact-layouts/${objectName}`
      );
      // Response: { recordTypeId: { fieldItems: [...] } } map
      // Find matching record type or use default
      const layouts = raw as Record<string, { fieldItems?: Array<{ fieldApiName?: string }> }>;
      const layout = layouts[recordTypeId] ?? Object.values(layouts)[0];
      if (layout) {
        const fields = this.extractCompactFields(layout);
        if (fields.length > 0) {
          this.cache.set(key, fields);
          return fields;
        }
      }
    } catch { /* fall through */ }

    return [];
  }

  private extractCompactFields(raw: Record<string, unknown>): string[] {
    const items = (raw.fieldItems as Array<{ fieldApiName?: string; layoutComponents?: Array<{ apiName?: string }> }>) ?? [];
    const fields: string[] = [];
    for (const item of items) {
      // Some orgs return fieldApiName directly, others nest in layoutComponents
      const name = item.fieldApiName
        ?? item.layoutComponents?.[0]?.apiName;
      if (name && !fields.includes(name)) fields.push(name);
    }
    return fields;
  }

  private extractLayoutFields(raw: Record<string, unknown>): string[] {
    type Comp    = { componentType: string; apiName?: string };
    type Item    = { layoutComponents?: Comp[] };
    type Row     = { layoutItems?: Item[] };
    type Section = { layoutRows?: Row[] };

    const sections = (raw.sections as Section[]) ?? [];
    const seen     = new Set<string>(['Id']);
    const fields   = ['Id'];

    for (const section of sections) {
      for (const row of section.layoutRows ?? []) {
        for (const item of row.layoutItems ?? []) {
          for (const comp of item.layoutComponents ?? []) {
            if (comp.componentType === 'Field' && comp.apiName && !seen.has(comp.apiName)) {
              seen.add(comp.apiName);
              fields.push(comp.apiName);
            }
          }
        }
      }
    }
    return fields;
  }

  // ── Create Record ────────────────────────────────────────────────────────────
  async createRecord(objectName: string, data: Record<string, unknown>): Promise<SfRecord> {
    const res = await this.request<{ id: string }>('/ui-api/records', {
      method: 'POST',
      body: JSON.stringify({ apiName: objectName, fields: data }),
    });
    return this.getRecord(objectName, res.id, Object.keys(data));
  }

  // ── Update Record ────────────────────────────────────────────────────────────
  async updateRecord(objectName: string, recordId: string, data: Record<string, unknown>): Promise<SfRecord> {
    await this.request<void>(`/ui-api/records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ apiName: objectName, fields: data }),
    });
    return this.getRecord(objectName, recordId, Object.keys(data));
  }

  // ── Picklist Values ──────────────────────────────────────────────────────────
  async getPicklistValues(objectName: string, recordTypeId: string, fieldName: string): Promise<SfPicklistValue[]> {
    const key = `picklist:${objectName}:${recordTypeId}:${fieldName}`;
    if (this.cache.has(key)) return this.cache.get(key) as SfPicklistValue[];

    const raw = await this.request<{
      values: Array<{ label: string; value: string; validFor?: string[] }>;
    }>(`/ui-api/object-info/${objectName}/picklist-values/${recordTypeId}/${fieldName}`);

    const result: SfPicklistValue[] = (raw.values ?? []).map(v => ({
      label: v.label, value: v.value, active: true, validFor: v.validFor,
    }));
    this.cache.set(key, result);
    return result;
  }

  // ── Related List Info ────────────────────────────────────────────────────────
  // [NEW] Uses /ui-api/related-list-info/:parentObjectName/:relatedListId
  async getRelatedListInfo(parentObjectName: string, relatedListId: string): Promise<SfRelatedListInfo> {
    const key = `relatedListInfo:${parentObjectName}:${relatedListId}`;
    if (this.cache.has(key)) return this.cache.get(key) as SfRelatedListInfo;

    const raw = await this.request<Record<string, unknown>>(
      `/ui-api/related-list-info/${parentObjectName}/${relatedListId}`
    );

    const columns = ((raw.displayColumns as Array<{ fieldApiName: string }>) ?? [])
      .map(c => c.fieldApiName)
      .filter(Boolean);

    const info: SfRelatedListInfo = {
      id:      raw.relatedListId as string ?? relatedListId,
      label:   raw.label as string ?? relatedListId,
      columns,
    };

    this.cache.set(key, info);
    return info;
  }

  // ── Related List Records ─────────────────────────────────────────────────────
  // [NEW] Uses /ui-api/related-list-records/:parentRecordId/:relatedListId
  async getRelatedListRecords(
    parentRecordId: string,
    relatedListId: string,
    fields: string[]
  ): Promise<Record<string, unknown>[]> {
    const fieldParam = fields.length > 0 ? `?fields=${fields.join(',')}` : '';
    const raw = await this.request<{
      records: Array<{
        fields: Record<string, { value: unknown; displayValue: string | null }>;
      }>;
    }>(`/ui-api/related-list-records/${parentRecordId}/${relatedListId}${fieldParam}`);

    return (raw.records ?? []).map(r =>
      Object.fromEntries(
        Object.entries(r.fields).map(([k, v]) => [k, v.displayValue ?? v.value])
      )
    );
  }

  // ── Related Records (legacy — SOQL-based) ────────────────────────────────────
  async getRelatedRecords(
    objectName: string,
    recordId: string,
    relatedObjectName: string,
    relationshipField: string,
    fields: string[],
    limit = 10
  ): Promise<SfRecord[]> {
    // Use SOQL via query endpoint
    const fieldList = ['Id', ...fields.filter(f => f !== 'Id')].join(', ');
    const soql = encodeURIComponent(
      `SELECT ${fieldList} FROM ${relatedObjectName} WHERE ${relationshipField} = '${recordId}' LIMIT ${limit}`
    );
    const raw = await this.request<{ records: Array<Record<string, unknown>> }>(
      `/query/?q=${soql}`
    );
    return (raw.records ?? []).map(r => ({
      id:       r.Id as string,
      apiName:  relatedObjectName,
      fields:   Object.fromEntries(
        Object.entries(r)
          .filter(([k]) => k !== 'attributes')
          .map(([k, v]) => [k, { value: v as string | number | boolean | null, displayValue: null }])
      ),
    }));
  }

  // ── SOSL Lookup Search ───────────────────────────────────────────────────────
  async searchRecords(objectName: string, query: string, limit = 10): Promise<LookupResult[]> {
    if (!query || query.length < 2) return [];
    const sosl = encodeURIComponent(
      `FIND {${query}*} IN NAME FIELDS RETURNING ${objectName}(Id, Name LIMIT ${limit})`
    );
    const raw = await this.request<{ searchRecords: Array<{ Id: string; Name: string }> }>(
      `/search/?q=${sosl}`
    );
    return (raw.searchRecords ?? []).map(r => ({ id: r.Id, name: r.Name }));
  }

  clearCache() { this.cache.clear(); }
}