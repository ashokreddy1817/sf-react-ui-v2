# @ourpractice/sf-react-ui

> React component library for Salesforce — drop-in equivalent of `lightning-record-form` for React apps on Salesforce Multi-Framework (LWR).

```bash
npm install @ourpractice/sf-react-ui
```

---

## Contents

- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [SfRecordForm API](#sfrecordform-api)
- [All Usage Patterns](#all-usage-patterns)
- [How to Publish (Maintainer Guide)](#how-to-publish)
- [How to Install in Another Project](#how-to-install-in-another-project)
- [How It Works Internally](#how-it-works-internally)

---

## Architecture Overview

```
Your React App
│
├── <SfProvider orgUrl="...">     ← Auth + API client (wrap app root once)
│   │
│   ├── <SfRecordForm />          ← Main component — view, edit, create
│   ├── <SfDataTable />           ← (coming soon)
│   └── <SfLookupField />         ← (coming soon)
│
└── Hooks (advanced usage)
    ├── useObjectInfo()
    ├── useRecord()
    ├── usePicklistValues()
    └── useLookupSearch()
```

**Data flow:**

```
SfRecordForm
  → calls Salesforce UI API  (/ui-api/object-info, /ui-api/records)
  → enforces FLS             (fields with NoAccess are hidden)
  → fetches picklist values  (record-type-aware via /ui-api/object-info/picklist-values)
  → resolves lookup names    (SOSL search for display values)
  → renders fields           (auto-detects type: text, picklist, lookup, date, …)
  → saves via UI API         (PATCH /ui-api/records/:id or POST /ui-api/records)
```

---

## Quick Start

### 1. Wrap your app

```tsx
// index.tsx or App.tsx
import { SfProvider } from '@ourpractice/sf-react-ui';

root.render(
  <SfProvider
    orgUrl="https://yourorg.my.salesforce.com"
    onAuthError={() => window.location.href = '/login'}
  >
    <App />
  </SfProvider>
);
```

### 2. Drop in SfRecordForm

```tsx
import { SfRecordForm } from '@ourpractice/sf-react-ui';

// View an Account record
<SfRecordForm objectName="Account" recordId="001Xx000003GuABIA0" />

// Edit mode with save callback
<SfRecordForm
  objectName="Opportunity"
  recordId="006Xx000001mzABIAY"
  mode="edit"
  onSave={(rec) => console.log('Saved', rec)}
/>

// Create a new Contact
<SfRecordForm
  objectName="Contact"
  mode="create"
  defaultValues={{ AccountId: parentId }}
  onSave={(rec) => navigate(`/contacts/${rec.id}`)}
/>
```

That's it. No SOQL. No UI API calls. No FLS wrangling.

---

## SfRecordForm API

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `objectName` | `string` | **required** | Salesforce API object name. e.g. `Account`, `My_Obj__c` |
| `recordId` | `string` | — | 18-char record ID. Omit for create mode. |
| `mode` | `'view' \| 'edit' \| 'create'` | `'view'` | Initial form mode. |
| `lockMode` | `boolean` | `false` | Disables in-form mode toggle. |
| `fields` | `string[]` | auto (compact layout) | Specific field API names to display. |
| `columns` | `1 \| 2` | `2` | Grid columns. |
| `defaultValues` | `Record<string, unknown>` | `{}` | Pre-fill values for create mode. |
| `recordTypeId` | `string` | auto-detected | Override the record type (affects picklists). |
| `title` | `string` | record Name field | Custom header title. |
| `hideHeader` | `boolean` | `false` | Hide the form header. |
| `hideFooter` | `boolean` | `false` | Hide the Save/Cancel footer. |
| `className` | `string` | — | Extra CSS class on the form container. |
| `loading` | `ReactNode` | skeleton shimmer | Custom loading state. |
| `error` | `ReactNode` | error card | Custom error state. |
| `onSave` | `(record: SfRecord) => void` | — | Fires after successful save. |
| `onBeforeSave` | `(data) => data` | — | Transform payload before sending to Salesforce. |
| `onError` | `(error: SfError) => void` | — | Fires on save/load errors. |
| `onModeChange` | `(mode) => void` | — | Fires when mode toggles. |
| `onCancel` | `() => void` | — | Fires when user cancels edit. |

### Ref methods (via `useRef`)

```tsx
const ref = useRef<SfRecordFormRef>(null);
<SfRecordForm ref={ref} ... />

ref.current.save()                   // trigger save programmatically
ref.current.reset()                  // revert all unsaved changes
ref.current.isDirty()                // boolean — has user changed anything?
ref.current.getValues()              // current field values object
ref.current.setFieldValue(f, v)      // set a specific field value
ref.current.setMode('edit')          // switch mode externally
```

---

## All Usage Patterns

### View mode (default)
```tsx
<SfRecordForm objectName="Account" recordId={id} />
```

### Edit mode with save handler
```tsx
<SfRecordForm
  objectName="Account"
  recordId={id}
  mode="edit"
  onSave={(rec) => toast.success('Saved!')}
  onError={(err) => toast.error(err.message)}
/>
```

### Create mode
```tsx
<SfRecordForm
  objectName="Contact"
  mode="create"
  defaultValues={{ AccountId: parentId }}
  onSave={(rec) => navigate(`/contacts/${rec.id}`)}
/>
```

### Custom field list
```tsx
<SfRecordForm
  objectName="Opportunity"
  recordId={id}
  fields={['Name', 'StageName', 'Amount', 'CloseDate', 'OwnerId']}
  columns={1}
/>
```

### Enrich payload before save (onBeforeSave)
```tsx
<SfRecordForm
  objectName="Account"
  recordId={id}
  mode="edit"
  onBeforeSave={(data) => ({
    ...data,
    CustomField__c: computeSomething(data),
  })}
/>
```

### External Save button (imperative ref)
```tsx
const ref = useRef<SfRecordFormRef>(null);

<button onClick={() => ref.current?.save()}>Save from outside</button>
<SfRecordForm
  ref={ref}
  objectName="Account"
  recordId={id}
  mode="edit"
  lockMode
  hideFooter
/>
```

### Locked view-only (no edit toggle)
```tsx
<SfRecordForm objectName="Account" recordId={id} lockMode hideFooter />
```

### Custom loading and error states
```tsx
<SfRecordForm
  objectName="Account"
  recordId={id}
  loading={<MySpinner />}
  error={<MyErrorCard />}
/>
```

---

## How to Publish

### Prerequisites
- Node.js 18+
- npm account at [npmjs.com](https://npmjs.com)
- Org scope access to `@ourpractice` (or change the scope to your own)

### Step-by-step

```bash
# 1. Clone the repo
git clone https://github.com/yourorg/sf-react-ui.git
cd sf-react-ui

# 2. Install dev dependencies
npm install

# 3. Build the dist output
npm run build
# → creates dist/index.js, dist/index.esm.js, dist/index.d.ts

# 4. Login to npm (first time only)
npm login
# Enter username, password, and OTP

# 5. Publish
npm publish --access public
# → publishes to https://www.npmjs.com/package/@ourpractice/sf-react-ui

# 6. Bump version for future releases (use semver)
npm version patch    # 1.0.0 → 1.0.1  (bug fix)
npm version minor    # 1.0.0 → 1.1.0  (new feature)
npm version major    # 1.0.0 → 2.0.0  (breaking change)
npm publish --access public
```

### Publishing to a private registry (e.g. Verdaccio / GitHub Packages)

```bash
# GitHub Packages
npm publish --registry https://npm.pkg.github.com

# Verdaccio (on-prem)
npm publish --registry http://your-verdaccio-server:4873
```

Add to `package.json` to make it permanent:
```json
{
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

---

## How to Install in Another Project

### From npm (after publishing)

```bash
npm install @ourpractice/sf-react-ui
```

### From GitHub (before publishing, or for internal use)

```bash
npm install github:yourorg/sf-react-ui
# or a specific branch/tag:
npm install github:yourorg/sf-react-ui#v1.0.0
```

### From local disk (for development / testing)

```bash
# In the sf-react-ui directory
npm run build
npm link

# In the consumer project
npm link @ourpractice/sf-react-ui
```

### From a private registry

```bash
# Tell npm where to find the @ourpractice scope
echo "@ourpractice:registry=http://your-verdaccio:4873" >> .npmrc

# Then install normally
npm install @ourpractice/sf-react-ui
```

### TypeScript setup (auto, no extra config needed)

Types ship with the package in `dist/index.d.ts`. No `@types/` package needed.

---

## How It Works Internally

### FLS (Field-Level Security)
The component calls `/ui-api/object-info/:objectName` on mount. Every field's `updateable`, `createable`, and `filterable` flags are used to derive `ReadWrite`, `ReadOnly`, or `NoAccess`. Fields with `NoAccess` are never rendered, even if you list them in the `fields` prop.

### Record-type-aware picklists
When a record loads (or you set `recordTypeId`), the component calls `/ui-api/object-info/:objectName/picklist-values/:recordTypeId/:fieldName` for every picklist field. This is the same API Lightning Data Service uses — your picklist values are always filtered to the correct record type.

### Lookup resolution
Lookup fields (e.g. `OwnerId`, `AccountId`) display the *name* of the related record, not the raw 18-char ID. As users type in edit mode, a debounced SOSL search queries the referenced object and shows a dropdown. The component stores both the ID (the field value sent to Salesforce) and the display name.

### Save flow
1. Diff changed fields only (never re-sends unchanged data)
2. Calls `onBeforeSave` if provided (lets you enrich the payload)
3. PATCH `/ui-api/records/:id` (update) or POST `/ui-api/records` (create)
4. On success: updates internal state, fires `onSave`, switches to view mode
5. On error: maps `fields[]` from error response to field-level inline errors

### Caching
`getObjectInfo` and `getPicklistValues` results are cached in memory on the API client instance (scoped to `SfProvider`). Records are not cached (always fresh). Call `client.clearCache()` via the provider if you need to bust it.

---

## Roadmap

- `<SfDataTable query="SELECT..." />` — data table with inline editing
- `<SfLookupField objectName="Contact" />` — standalone lookup field
- `<SfRelatedList objectName="Account" relatedObject="Contact" />` — related list
- Dark mode support
- LWC Design System CSS token mapping

---

## License

MIT © Our Practice
