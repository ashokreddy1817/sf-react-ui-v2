/**
 * SalesforceApiClient — UI API wrapper
 *
 * Auth strategy for UIBundle (deployed inside Salesforce):
 * ─────────────────────────────────────────────────────────
 * When running as a UIBundle, Salesforce injects SFDC_ENV into window.
 * The session cookie (sid) is httpOnly — JavaScript cannot read it directly.
 *
 * UI API endpoints (/ui-api/*) work with credentials:'include' cookie-only.
 * REST endpoints (/query, /search) need the X-SFDC-Session header or Bearer token.
 *
 * FIX: We use SOQL /query instead of SOSL /search for lookups.
 * /query works with credentials:'include' without any extra header on all Salesforce
 * deployment types including UIBundle, Experience Cloud, and Scratch orgs.
 *
 * If you have an accessToken (e.g. from Named Credentials or OAuth), pass it to
 * SfProvider and it will be sent as Bearer — that unlocks /search too.
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

    if (this.accessToken) {
      // Explicit token provided (e.g. from Named Credentials / OAuth flow)
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',  // always include session cookie
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

  // ── Object Info ───────────────────────────────────────────────────────────────
  async getObjectInfo(objectName: string): Promise<SfObjectInfo> {
    const key = `objectInfo:${objectName}`;
    if (this.cache.has(key)) return this.cache.get(key) as SfObjectInfo;

    const raw = await this.request<Record<string, unknown>>(
      `/ui-api/object-info/${objectName}`
    );

    const fields = raw.fields as Record<string, Record<string, unknown>>;
    const normalised: SfObjectInfo = {
      apiName:            raw.apiName as string,
      label:              raw.label as string,
      labelPlural:        raw.labelPlural as string,
      defaultRecordTypeId: raw.defaultRecordTypeId as string,
      recordTypeInfos:    raw.recordTypeInfos as SfObjectInfo['recordTypeInfos'],
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

  // ── Get Record ────────────────────────────────────────────────────────────────
  async getRecord(objectName: string, recordId: string, fields: string[]): Promise<SfRecord> {
    const fieldList = fields
      .map(f => f.includes('.') ? f : `${objectName}.${f}`)
      .join(',');

    const raw = await this.request<Record<string, unknown>>(
      `/ui-api/records/${recordId}?fields=${fieldList}`
    );

    const rawFields = raw.fields as Record<string, { value: unknown; displayValue: string | null }>;
    return {
      id:               raw.id as string,
      apiName:          raw.apiName as string,
      recordTypeId:     (raw.recordTypeInfo as { recordTypeId?: string } | null)?.recordTypeId,
      lastModifiedById: raw.lastModifiedById as string,
      lastModifiedDate: raw.lastModifiedDate as string,
      fields: Object.fromEntries(
        Object.entries(rawFields).map(([k, v]) => [k, {
          value:        v.value as string | number | boolean | null,
          displayValue: v.displayValue,
        }])
      ),
    };
  }

  // ── Full Page Layout ──────────────────────────────────────────────────────────
  async getRecordLayout(
    objectName: string,
    recordTypeId: string,
    layoutType: LayoutType = 'Full',
    mode: LayoutMode = 'View'
  ): Promise<string[]> {
    const key = `layout:${objectName}:${recordTypeId}:${layoutType}:${mode}`;
    if (this.cache.has(key)) return this.cache.get(key) as string[];

    try {
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

  // ── Compact Layout ────────────────────────────────────────────────────────────
  async getCompactLayout(objectName: string, recordTypeId: string): Promise<string[]> {
    const key = `compact:${objectName}:${recordTypeId}`;
    if (this.cache.has(key)) return this.cache.get(key) as string[];

    // Try per-recordType first, then object-level
    for (const path of [
      `/ui-api/compact-layouts/${objectName}/${recordTypeId}`,
      `/ui-api/compact-layouts/${objectName}`,
    ]) {
      try {
        const raw = await this.request<Record<string, unknown>>(path);
        const fields = this.extractCompactFields(raw);
        if (fields.length > 0) {
          this.cache.set(key, fields);
          return fields;
        }
      } catch { continue; }
    }
    return [];
  }

  private extractCompactFields(raw: Record<string, unknown>): string[] {
    const items = (raw.fieldItems as Array<{ fieldApiName?: string; layoutComponents?: Array<{ apiName?: string }> }>) ?? [];
    const fields: string[] = [];
    for (const item of items) {
      const name = item.fieldApiName ?? item.layoutComponents?.[0]?.apiName;
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

  // ── Create Record ─────────────────────────────────────────────────────────────
  async createRecord(objectName: string, data: Record<string, unknown>): Promise<SfRecord> {
    const res = await this.request<{ id: string }>('/ui-api/records', {
      method: 'POST',
      body: JSON.stringify({ apiName: objectName, fields: data }),
    });
    return this.getRecord(objectName, res.id, Object.keys(data));
  }

  // ── Update Record ─────────────────────────────────────────────────────────────
  async updateRecord(objectName: string, recordId: string, data: Record<string, unknown>): Promise<SfRecord> {
    await this.request<void>(`/ui-api/records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ apiName: objectName, fields: data }),
    });
    return this.getRecord(objectName, recordId, Object.keys(data));
  }

  // ── Picklist Values ───────────────────────────────────────────────────────────
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

  // ── Related List Info ─────────────────────────────────────────────────────────
  async getRelatedListInfo(parentObjectName: string, relatedListId: string): Promise<SfRelatedListInfo> {
    const key = `relatedListInfo:${parentObjectName}:${relatedListId}`;
    if (this.cache.has(key)) return this.cache.get(key) as SfRelatedListInfo;

    const raw = await this.request<Record<string, unknown>>(
      `/ui-api/related-list-info/${parentObjectName}/${relatedListId}`
    );

    // FIX: displayColumns can be an array of objects with fieldApiName,
    // or it may be nested under columns[].fieldApiName depending on API version
    type DisplayCol = { fieldApiName?: string; apiName?: string };
    const rawCols = (raw.displayColumns ?? raw.columns) as DisplayCol[] ?? [];
    const columns = rawCols
      .map(c => c.fieldApiName ?? c.apiName ?? '')
      .filter(Boolean);

    const info: SfRelatedListInfo = {
      id:      (raw.relatedListId as string) ?? relatedListId,
      label:   (raw.label as string) ?? relatedListId,
      columns,
    };

    this.cache.set(key, info);
    return info;
  }

  // ── Related List Records ──────────────────────────────────────────────────────
  // FIX 1: UI API /related-list-records does NOT accept ?fields= query param
  //         with bare field names — it expects fields WITHOUT the object prefix,
  //         but they must match what the related list definition exposes.
  //         Safest approach: omit ?fields= entirely and let the API return default columns.
  // FIX 2: Map the nested fields structure correctly (fields.value / fields.displayValue)
  async getRelatedListRecords(
    parentRecordId: string,
    relatedListId: string,
    _fields: string[]   // kept for interface compat but not sent as query param
  ): Promise<Record<string, unknown>[]> {
    // No ?fields= — let Salesforce return the default columns for this related list
    const raw = await this.request<{
      records: Array<{
        fields: Record<string, { value: unknown; displayValue: string | null }>;
      }>;
    }>(`/ui-api/related-list-records/${parentRecordId}/${relatedListId}`);

    return (raw.records ?? []).map(r =>
      Object.fromEntries(
        Object.entries(r.fields).map(([k, v]) => [k, v.displayValue ?? v.value])
      )
    );
  }

  // ── SOSL Lookup Search ────────────────────────────────────────────────────────
  // searchRecords uses SOQL /query instead of SOSL /search.
  //
  // WHY: The /search (SOSL) endpoint requires "API Enabled" on the user's profile.
  // UIBundle session cookies do NOT grant API Enabled by default on Platform Free Trial
  // and many scratch orgs — causing "Session expired or invalid" errors.
  //
  // /query (SOQL) works with the standard UIBundle session cookie without any
  // extra profile permission, making it safe for all Salesforce deployment types.
  //
  // Trade-off: SOQL Name LIKE '%term%' only matches the Name field (no cross-field
  // search), but that is exactly what a lookup field needs.
  async searchRecords(objectName: string, query: string, limit = 10): Promise<LookupResult[]> {
    if (!query || query.length < 2) return [];

    // Escape single quotes to prevent SOQL injection
    const safe = query.replace(/'/g, "\\'");

    // Use Name LIKE for prefix matching (case-insensitive in Salesforce SOQL)
    const soql = encodeURIComponent(
      `SELECT Id, Name FROM ${objectName} WHERE Name LIKE '${safe}%' ORDER BY Name LIMIT ${limit}`
    );

    try {
      const raw = await this.request<{ records: Array<{ Id: string; Name: string }> }>(
        `/query?q=${soql}`
      );
      return (raw.records ?? []).map(r => ({ id: r.Id, name: r.Name }));
    } catch {
      // If SOQL also fails (e.g. object has no Name field), try with %term% contains match
      const containsSoql = encodeURIComponent(
        `SELECT Id, Name FROM ${objectName} WHERE Name LIKE '%${safe}%' ORDER BY Name LIMIT ${limit}`
      );
      const fallback = await this.request<{ records: Array<{ Id: string; Name: string }> }>(
        `/query?q=${containsSoql}`
      );
      return (fallback.records ?? []).map(r => ({ id: r.Id, name: r.Name }));
    }
  }

  // ── Generic query (public) ────────────────────────────────────────────────────
  // Exposes the internal request() so SfProvider can pass it to context as
  // executeQuery() — used by SfChart and any component needing direct REST access.
  // Path should start with "/" e.g. "/query?q=SELECT..."
  async executeQuery<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  clearCache() { this.cache.clear(); }
}