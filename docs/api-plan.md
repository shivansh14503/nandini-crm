# Nandini CRM — API Plan

> **Status:** living document. Lists every endpoint of `backend-crm` as of 2026-11-25 plus the planned ones.
> When you add, change or remove a route, update this file in the same change (the route files'
> header comments are the per-module source of truth; keep them in step too).
> Related: [System design](system-design.md) · [Database design](database-design.md) · [Build plan](build-plan.md)

---

## 1. Conventions

| Topic | Rule |
| --- | --- |
| Base URL | `http(s)://<host>:8008/api` (frontend: `NEXT_PUBLIC_API_URL` or page host + `NEXT_PUBLIC_API_PORT`) |
| Format | JSON in and out. PDFs and images are binary |
| Auth | httpOnly cookie `token` (JWT) set by login; `Authorization: Bearer <jwt>` also accepted. All routes except `/auth/login`, `/auth/logout` and `/health` require it |
| Roles | 🔐 = admin only (`Admin`, `Administrator`, `Super Admin`). Data on core entities is row-scoped for non-global roles (see [system design §3.6](system-design.md#36-security-model)) |
| Body limits | 1 MB default; `/import` 10 MB; `/files` 15 MB (10 MB files as base64); `/pdf-templates`, `/pdf-assets`, `/pdf-saved-items` 2 MB |
| Validation | Zod; unknown sort fields fall back to the default instead of erroring |
| IDs | UUID strings (users: integer) |
| Deletes | Soft deletes for business records (`isDeleted`), hard deletes only for personal / config data where noted |
| Updates | `PUT /:id` takes a **partial** record merged onto the stored one; `PATCH /:id` is an alias |
| Time zone | Wall-clock inputs (ticket due dates, contract renewal reminders) and audit display times use `BUSINESS_TIMEZONE` (default `Asia/Kolkata`) |
| Request id | Every response carries `X-Request-Id` (exposed to the browser); the same id is the log line's `req.id` and every audit entry the request wrote |
| Audit headers | The web app sends `X-CRM-Client: web` (audit `source` = `UI`, otherwise `API`) and `X-CRM-Page: <screen path>` (audit `page`; path only, no query string) |

### 1.1 Response envelopes

```jsonc
// Single item / mutation
{ "success": true, "data": { … }, "message": "Lead updated successfully" }

// Paginated list
{ "success": true, "data": [ … ], "total": 412, "page": 1, "limit": 25 }

// Error (any status ≥ 400)
{ "status": "error", "code": "VALIDATION_ERROR", "message": "GST No is required.",
  "errors": [ { "message": "GST Number is required.", "path": ["gstNumber"] } ] }
```

### 1.2 List query parameters (all CRUD lists)

| Param | Default | Notes |
| --- | --- | --- |
| `page` | 1 | |
| `limit` | 25 | max 100 |
| `search` | – | ≤ 100 chars; entity codes, phone numbers and GSTINs are detected and matched by prefix / equality |
| `sortBy` | `createdAt` | whitelisted per module (`createdAt`, `updatedAt`, code, name, …) |
| `sortOrder` | `desc` | `asc` / `desc` |
| `mine` | – | only records assigned to the caller |
| `createdWithinDays` | – | created in the last N days |

Plus module filters listed below. Multi-value filters accept repeated params or comma lists.

### 1.3 Standard CRUD block

Modules marked **CRUD** expose (`modules/shared/crud.ts` → `registerCrudRoutes`):

| Method | Path | Result |
| --- | --- | --- |
| GET | `/` | paginated list |
| GET | `/:id` | one record (404 when missing or deleted, 403 outside the caller's scope) |
| POST | `/` | 201 created record |
| PUT / PATCH | `/:id` | updated record |
| DELETE | `/:id` | `{ id }` (soft delete) |
| POST | `/bulk-delete` | body `{ ids }` → `{ deleted, ids, notFound }` |

## 2. Endpoint catalogue

### 2.1 System & auth

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | – | `{ status: 'ok', redis: 'connected' \| 'unavailable' }` |
| POST | `/auth/login` | – | `{ username, password }` → `{ status: 'ok', message, user }` + sets cookie. 429 after `LOGIN_RATE_LIMIT_MAX` failures per IP per window |
| POST | `/auth/logout` | – | Revokes the Redis session (if tracked), clears cookie → `{ status: 'ok', message }` |
| GET | `/auth/me` | ✔ | `{ status: 'ok', user: { id, username, role } }` |

The auth endpoints use the older `{ status: 'ok', … }` envelope rather than `{ success, data }`; the frontend's
`auth.service.ts` expects it.

### 2.2 Sales & customer records

| Base | Type | Extra endpoints | List filters |
| --- | --- | --- | --- |
| `/leads` | CRUD | `GET /check-duplicates?mobile&emails&excludeId&excludeType` — informational matches in leads/contacts/organizations · `POST /:id/convert` — atomic conversion → `{ organization, contact, opportunity, organizationCreated, contactCreated }`; the new organization, contact and opportunity are assigned to the lead's own `assignedTo` (the body takes no Assigned To fields); `createOpportunity: false` (default `true`) converts without creating an opportunity — the opportunity fields are then ignored (not validated), `opportunity` is `null` and the lead's `convertedOpportunityId` stays empty; body also takes `extraFields: { contacts, organizations, opportunities }` (fieldKey → value) for the other fields an admin shows on Convert Lead (`isVisibleInConvert`; custom fields included, saved on the new records). Every field shown there is checked by its record's form rules, with Convert Lead's own "required" (`convertIsRequired`) where set (`400` with the convert form's field name, or `extraFields.<module>.<fieldKey>`, in `errors[].path`), except for a contact or organization that already exists and is linked as it is. A new organization with `customerType` Partner needs `natureOfPartner` (`400` on `natureOfPartner`) | `status`, `excludeStatus`, `leadType`, `rating` (Hot / Warm / Cold), `leadSource`, `organizationName`, `assignedTo`, `nextFollowupDate` |
| `/opportunities` | CRUD | – (line-item totals computed server-side; line items replaced only when sent). `tallySerialNo`, when given, must be exactly 9 digits starting with 7 (`400` with `errors[].path` `tallySerialNo`); a value saved before that rule is kept on `PATCH` until the field itself is sent. Documentation: `addDocument` must be `Yes` when `salesStage` is `PO`, and `Yes` needs `documentFile` (an uploaded `/files` id, or the `{ id, … }` object the API returns); `400` with `errors[].path` `addDocument` / `documentFile`. On `PATCH` these are checked when `salesStage`, `addDocument` or `documentFile` is sent. `documentNo`, `documentDate`, `documentRemarks` and `documentFile` are kept only while `Yes`; responses carry `documentFile: { id, fileName, mimeType, sizeBytes, url } \| null` | `salesStage`, `excludeSalesStage`, `organizationId`, `contactId`, `productId`, `assignedTo`, `minGrandTotal`, `nextFollowupDate` |
| `/quotations` | CRUD | `GET /:id/pdf?templateId&disposition=inline\|attachment` → `application/pdf` (30/min/user, Redis-cached). Creating a quotation advances the linked opportunity's stage | `status`, `quoteStage`, `opportunityId`, `organizationId`, `contactId`, `productId`, `assignedTo` |
| `/organizations` | CRUD | `GET /check-unique?organizationName&gstNumber&excludeId` → `{ exists, field?, accountCode?, message? }` · `PATCH /bulk-status` `{ ids, status: 'Active'\|'Inactive', inactivityReason? }`. `GET /:id` records a "recently viewed" entry. `natureOfPartner` is required when `customerType` is Partner (`400`, `errors[].path` `['natureOfPartner']`; on update only when the body sends `customerType` or `natureOfPartner`) and cleared for any other Customer Type | `accountStatus`, `customerType`, `natureOfBusiness`, `assignedTo`, `parentOrganizationId`, `recent` |
| `/contacts` | CRUD | – | `organizationId`, `assignedTo`, `isPrimaryContact` |

### 2.3 Support, catalogue and partners

| Base | Type | Notes | List filters |
| --- | --- | --- | --- |
| `/tickets` | CRUD | Nature of Call must exist in the master | `ticketStatus`, `excludeStatus`, `ticketPriority`, `supportType`, `supportMode`, `organizationId`, `contactId`, `assignedTo`, `overdue` |
| `/contracts` | CRUD | Required: `contractTitle`, `assignedTo` (Contract Manager: an active user, else the caller), `organizationName`, `contact`; `status` defaults to `Not Started`. Organization by `organizationId`, else by name; contact by `contactId`, else by name within that organization; opportunity by `opportunityId`, else the typed label is kept unlinked (unknown / deleted id → 400 on `organizationName` / `contact` / `opportunity`). Dates `YYYY-MM-DD`, `renewalReminderDate` wall clock `YYYY-MM-DDTHH:mm`; start / end / bill dates and the reminder can't be in the past unless unchanged, and `endDate` can't be before `startDate` (400 on that field). `contractValue` / `billAmount` ≥ 0 with ≤ 2 decimals, returned as strings (`''` when empty); `tallySerialNo`, when given, exactly 9 digits starting with 7 (an older value is kept on `PATCH` until the field is sent); `contractType` is a string array. Search: a `CTR-` / series number by prefix, else number, title, organization, contact, opportunity, Tally serial no., bill number. Sort: `createdAt`, `updatedAt`, `contractNumber`, `contractTitle`, `status`, `organizationName`, `assignedTo`, `startDate`, `endDate`, `renewalReminderDate`, `contractValue` | `status`, `excludeStatus`, `organizationId`, `contactId`, `opportunityId`, `assignedTo` |
| `/products` | CRUD | Not row-scoped | `category`, `type`, `isActive` |
| `/partner-companies` | CRUD | Company name globally unique | `natureOfPartner`, `assignedTo` |

### 2.4 Search, lookups and audit

| Method | Path | Cache | Description |
| --- | --- | --- | --- |
| GET | `/search?q&limit=5` | 30 s, per access scope | `results: { leads, opportunities, quotations, organizations, contacts, tickets, contracts, products, partnerCompanies }`, each `[{ id, category, title, subtitle, meta?, href }]` |
| GET | `/lookups/users?includeInactive` | 5 min | User pickers |
| GET | `/lookups/organizations?search&limit` | 5 min (no search) | Compact organization list |
| GET | `/lookups/contacts?search&limit&organizationId` | 5 min (no search/filter) | |
| GET | `/lookups/products?search&limit&category` | 5 min (no search/filter) | Active products |
| GET | `/lookups/nature-of-calls` | 1 h | |
| GET | `/lookups/partner-companies` | 1 h | |
| GET | `/lookups/partner-contacts?partnerCompany` | 1 h | |
| GET | `/lookups/address-master?country=IN` | 24 h | `{ countries, subdivisions }` |
| GET | `/lookups/cities?country&state&search&limit` | 24 h (no search) | City picker |
| GET | `/lookups/form-configs?includeInactive` | 1 h | Same payload as `GET /form-configs` |
| GET | `/lookups/tax-id-holders?owner&gstNumber&panNumber&excludeId` | never | "Is this GSTIN / PAN already used?" |
| GET | `/lookups/email-check?email` | never (DB is the record) | Form's on-blur check → `{ email, status, reason, message, suggestion }`. An address already saved on any record returns its stored result (no provider call); otherwise free checks, then the provider. Rate limited per user |
| GET | `/audit-logs/:entityType/:entityId?limit=100` | – | `{ entries, revisions }` newest first (entry `id` is a string). `entityType` ∈ organizations, contacts, leads, opportunities, quotations, products, tickets, contracts, partner-companies, users, pdf-templates, form-configs (`entityId` = module key, `shared` or `all`; includes drawer layout and drawer piece changes), scorecards (`entityId` = module key). **Access:** admins read every trail. Others: organizations / contacts / leads / opportunities / quotations / tickets / contracts need access to the record (403; 404 if it doesn't exist); `users` only their own trail; `pdf-templates`, `form-configs` and `scorecards` admin-only (403); products and partner companies any signed-in user |

### 2.5 Personal state

| Method | Path | Description |
| --- | --- | --- |
| GET | `/table-filters?module=leads` | `{ recent (max 10), saved }` for the caller. `module`: a CRM module key, or `audit-log` (Admin › Audit Log) |
| POST | `/table-filters/recent` | `{ module, criteria }` — record an applied filter |
| POST | `/table-filters/saved` | `{ module, name, criteria }` — same name overwrites |
| DELETE | `/table-filters/:id` | Hard delete one of the caller's filters |

### 2.5a Scorecards (list-screen summary cards)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/scorecards` | `{ [module]: { module, fieldKey, currencyFieldKey, options: [{ value, color, hidden? }], listViewColor, drawerViewColor, enabled, allLabel, version, updatedBy, updatedAt } }` for configured modules (any signed-in user). `enabled: false` = the list shows no cards (the list column / drawer colors still follow their own switches); `allLabel` null = the screen's own "All" wording |
| PUT | `/scorecards/:module` | Admin only. `{ fieldKey, currencyFieldKey?, options, listViewColor, drawerViewColor, enabled? (default true), allLabel? (≤ 60 chars, empty = default), version }` where `version` is the saved version the admin edited (null when nothing was saved). Returns the saved scorecard with `version` + 1 (1 on create). **409** when another admin saved (or reset) the scorecard since that version. **400** when `fieldKey` isn't an active `select` field of the module, `currencyFieldKey` isn't an active `amount` / `number` field or one of the module's built-in totals, an option isn't in the field's dropdown, or a color isn't `#RRGGBB`. Built-in totals are `builtin.*` keys the list works out from its line items (`BUILT_IN_SCORECARD_AMOUNTS` in `scorecard.validator.ts`; Opportunities: `builtin.totalAmount`, `builtin.subtotal`, `builtin.totalDiscount`, `builtin.totalTax`, `builtin.grandTotal`, `builtin.subtotalPlusTax`, `builtin.commissionAmount`, `builtin.lumpSumDiscount`; Quotations: the same without `builtin.grandTotal` and `builtin.commissionAmount`). No `currencyFieldKey` = the screen's default total (Opportunities: Actual (Before Tax); Quotations: Grand Total) |
| DELETE | `/scorecards/:module` | Admin only. Back to the screen's built-in cards (Leads, Opportunities, Quotations, Contracts) or no cards (the other lists) |

Saves and resets are audited as entity type `Scorecard` with `entityId` = module key (read with `GET /audit-logs/scorecards/:module`). Set up under Admin › List Scorecards (`/admin/scorecards?module=…`).

### 2.5b Record drawer layouts (Form Customization › Drawer Layout)

`/drawer-layouts` (`GET /` any signed-in user; changes admin only) and `/drawer-pieces` (admin only). The layout
document schema is `backend-crm/src/modules/drawer-layouts/document/schema.ts` (copied to the frontend by
`npm run sync:drawer-layout`). Modules: `leads`, `contacts`, `organizations`, `opportunities`, `quotations`, `products`,
`tickets`, `contracts`, `partner-companies`. The `lineItems` and `totals` blocks are allowed only on `opportunities` and
`quotations` (**400** elsewhere, also for pieces).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/drawer-layouts` | `{ [module]: { module, layout, version, updatedBy, updatedAt } }` for modules with a saved layout (missing = built-in layout) |
| PUT | `/drawer-layouts/:module` | Admin only. `{ layout, version }` (`version` = the one edited, `null` when there was none). Goes live straight away; audited (`DrawerLayout`, readable per-part diff). **400** for an invalid document or a field / address the module's form doesn't have (inactive fields count as missing); **409** when another admin saved or reset it since `version` |
| DELETE | `/drawer-layouts/:module` | Admin only. Back to the built-in layout (audited) |
| GET | `/drawer-pieces?module=leads` | Admin only. The builder's saved pieces, newest first: `[{ id, module, name, section, createdBy, createdAt }]` |
| POST | `/drawer-pieces` | Admin only. `{ module, name, section }` → 201 with the piece. **400** for an invalid section or when the module already has 100 pieces |
| DELETE | `/drawer-pieces/:id` | Admin only. Permanent; layouts that used it keep their copy. **404** when unknown |

### 2.6 Bulk import

| Method | Path | Description |
| --- | --- | --- |
| POST | `/import/:entity` | `entity` ∈ organizations, contacts, products, leads, opportunities, tickets, partner-companies. Body `{ rows: [{ rowNumber, values }], fileName? }`, 1–5,000 rows, cells ≤ 5,000 chars. **202** `{ status: 'queued', importId, total }` or, without Redis and ≤ 500 rows, **200** `{ status: 'completed', importId, result }` |
| GET | `/import/jobs/:importId` | Owner only: `{ state, progress, total, result?: { created, failed: [{ rowNumber, errors }] }, failedReason? }` |

### 2.7 Administration 🔐

**Form & dropdown customisation** — `/form-configs` (`GET /` is open to every signed-in user)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | `{ categories, fieldsByModule, moduleTabs, moduleSettings }` (`?includeInactive`); `moduleSettings.leads.ratingNewLead` = new-lead Rating limits (missing = default) |
| POST | `/categories` | `{ label, module, description?, options? }`; key derived from label |
| PATCH | `/categories/:categoryKey` | `{ label?, description?, module? }` |
| DELETE | `/categories/:categoryKey` | Hard delete (admin-created only; removes options + linked custom fields) |
| POST | `/categories/:categoryKey/options` | `{ value, meta? }`; an existing value is a 409 |
| PUT | `/categories/:categoryKey/options/reorder` | `{ optionIds }` |
| PATCH | `/options/:optionId` | `{ label?, meta?, isDefault? }`; a rename rewrites stored values in records and filters. `meta.ratingRule` (Customer Response options) and `meta.closesLead` (Status options) are validated — [lead-rating-rules.md](lead-rating-rules.md) |
| DELETE | `/options/:optionId` | Permanent; blocked for system options |
| POST | `/fields` | Add a custom field (key = label in snake_case). On contacts / organizations / opportunities it also shows on Convert Lead (`isVisibleInConvert: true`) |
| PATCH | `/fields/:fieldId` | Update; core-locked fields can't be hidden or made optional. `isVisibleInConvert` (contacts / organizations / opportunities): refused for fields Convert Lead can't draw (pickers, the ones the conversion fills) and, off, for core fields it has inputs for. `convertIsRequired` (boolean) / `convertFieldSize` (`xs`…`full` or `auto`): Convert Lead's own settings, leaving the form's `isRequired` / `fieldSize` as they are; `null` → back to the form's. `convertSectionKey`: the field's Convert Lead section (a form section key or a `convertSections` key; `null` → its form section). Contacts / organizations / opportunities only; `convertIsRequired: false` refused for core-locked fields |
| DELETE | `/fields/:fieldId` | Permanent; custom fields only |
| PUT | `/modules/:module/fields/reorder` | `{ fieldIds }` |
| PUT | `/modules/:module/fields/convert-order` | `{ fieldIds }`: Convert Lead's own order (contacts / organizations / opportunities); the form keeps its order. Listed fields fill, in that order, the places they hold on the form; the rest keep theirs. `[]` → Convert Lead follows the form order again |
| PATCH | `/modules/:module/sections/:sectionKey` | `{ sectionLabel }` |
| PUT | `/modules/:module/settings/:settingKey` | `{ value }` — a module setting: `leads/ratingNewLead` `{ hot, warm }`, and `contacts` / `organizations` / `opportunities` `/convertSections` `[{ key, label, custom?, deleted? }]` (Convert Lead's own sections; keys unique, lowercase snake_case) (unknown setting → 404). Audited in the Form Builder trail |

**Lead Rating** ([lead-rating-rules.md](lead-rating-rules.md)) — `rating`, `ratingReason`, `unansweredCalls` are
read-only on the lead DTO (a `rating` sent by a client is ignored).

- `POST /leads`: `nextFollowupDate` + `nextFollowupTime` required and later than now (IST) → `400` on
  `nextFollowupDate` / `nextFollowupTime`. Rated by the new-lead rule.
- `PATCH /leads/:id`: with a non-blank `customerResponse` the edit records a follow-up and needs
  `followUpDecision: 'keep' | 'new'` (`400` on `followUpDecision`; not needed when the new status closes the lead).
  `keep`: the saved follow-up must still be later than now and unchanged; `new`: date + time later than now.
  Writes a `FOLLOW_UP` audit row (field diff + `followUp` summary). Without a response the edit changes details only:
  `customerResponse` / `remarks` are ignored, and changing the follow-up, closing or reopening the lead is a `400` on
  `customerResponse`. A closing status ("Closes the lead") keeps the Rating and clears the follow-up.
- `POST /leads/:id/convert` keeps the lead's Rating as it is that day and clears the lead's own follow-up.

**Document series** — `/document-series`

| Method | Path | Description |
| --- | --- | --- |
| GET | `/shown-modules` | Any user: `{ modules }` whose numbers the UI shows |
| GET | `/` 🔐 | Settings, every module's rule, current FY, each module's next number |
| PUT | `/` 🔐 | `{ companyPrefix, separator, fyStartMonth, fyFormat, series: [...] }` |

**Email validation** — `/email-validation` 🔐 (Settings › Email Validation)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/summary` | `{ counts: { total, unchecked, valid, risky, invalid }, enabled, providerConfigured, providerAvailable, maxRunSize, listApiMin, activeRun }` (distinct addresses of live records) |
| GET | `/addresses?status&search&sort&page&pageSize` | `status` ∈ all, unchecked, valid, risky, invalid, attention (risky + invalid); `sort` ∈ oldest (never / longest unchecked first), newest, email; `pageSize` ≤ 100 → `{ items: [{ email, status, reason, lastCheckedAt, isBounced, records: { leads, contacts, organizations } }], total, page, pageSize }` |
| GET | `/runs` | Last 10 bulk checks |
| GET | `/runs/:id` | One bulk check (progress) |
| POST | `/runs` | `{ emails }` (≤ 10,000) or `{ filter: { status, search, sort }, limit }` (≤ 50,000) → 202 queued run (`mode` = `list` when it has at least `EMAIL_VERIFICATION_LIST_API_MIN` addresses and a provider key is set, else `single`; list runs report `phase`, `providerProgress`, `providerTotal`). 409 while another check is active; 400 when none of the addresses are saved on a record |
| POST | `/runs/:id/cancel` | Stops before the next address; results so far stay |
| POST | `/actions` | `{ action: accept | markBounced | remove, emails }` → `{ affectedRecords }`. `accept` = status `valid` (reason `admin_accepted`); `markBounced` ticks "Invalid Bounce"; `remove` deletes the address from every record (next address becomes primary). Each action writes an UPDATE to each affected record's audit log (`accept`: one per record whose result changed) |

**Cities** — `/cities` 🔐

| Method | Path | Description |
| --- | --- | --- |
| GET | `/?country&state&search&page&limit` | Paginated admin list |
| GET | `/:id/usage` | Live records using the city |
| POST | `/` | `{ countryIso2, subdivisionCode?, cityName }` |
| PATCH | `/:id` | `{ cityName }` — written through to every record using it |
| DELETE | `/:id` | `{ action?: 'move' \| 'clear', targetCityId? }`; `409 CITY_IN_USE` when records use it and no action given |

**PDF templates** — `/pdf-templates`, `/pdf-assets`, `/pdf-saved-items`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/pdf-templates?module=QUOTATION&includeInactive` | ✔ | List without documents |
| GET | `/pdf-templates/fields?module=QUOTATION` | ✔ | Printable field registry + line-item columns |
| GET | `/pdf-templates/context?module&recordId?` | 🔐 | Record (or sample) context for the builder canvas |
| POST | `/pdf-templates/preview` | 🔐 | `{ module, document, recordId? }` → PDF of an unsaved document (20/min/user) |
| GET | `/pdf-templates/:id` | 🔐 | Full template |
| POST | `/pdf-templates` | 🔐 | Create |
| PUT | `/pdf-templates/:id` | 🔐 | `{ version, … }`; `409 VERSION_CONFLICT` when stale; system templates: `isActive`/`isDefault` only |
| POST | `/pdf-templates/:id/duplicate` | 🔐 | `{ name? }` |
| POST | `/pdf-templates/:id/set-default` | 🔐 | |
| PATCH | `/pdf-templates/:id/active` | 🔐 | `{ isActive }`; the default can't be deactivated |
| DELETE | `/pdf-templates/:id` | 🔐 | Soft delete (not system / default) |
| POST | `/files` | ✔ | `{ module: 'opportunities', fileName, mimeType, data (base64) }`: PDF, PNG/JPEG/WebP, Word or Excel ≤ 10 MB, content checked against the type → `{ id, fileName, mimeType, sizeBytes, url }` (link it from the record, e.g. `documentFile`) |
| GET | `/files/:id` | ✔ | The file: PDF and images inline, others as a download (long private cache) |
| POST | `/pdf-assets` | 🔐 | `{ fileName, mimeType, data (base64), key? }`, PNG/JPEG/WebP ≤ 1 MB |
| GET | `/pdf-assets/:key` | ✔ | The image (long private cache) |
| DELETE | `/pdf-assets/:key` | 🔐 | Blocked while a template uses it |
| GET | `/pdf-saved-items?module=QUOTATION` | 🔐 | Builder library, newest first |
| POST | `/pdf-saved-items` | 🔐 | `{ module, name, content: { kind: 'section'\|'block', … } }` |
| DELETE | `/pdf-saved-items/:id` | 🔐 | Soft delete |

**Audit log** — `/admin/audit-logs` 🔐 (Admin › Audit Log; every change, sign-in and refused access in the CRM)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/?from&to&user&module&action&category&severity&source&entityType&entityId&entityCode&entityLabel&field&ip&requestId&q&cursor&limit` | `{ items: AuditListItem[], nextCursor, limit }`, newest first. **Keyset paging** on `id`: pass `nextCursor` back as `cursor` (null on the last page); there is no `total`. `limit` default 50, max 200. Filters are AND-ed; multi-value filters (`user`, `module`, `action`, `category`, `severity`, `source`, `entityType`, `field`) take repeated params or comma lists. `from` / `to`: `YYYY-MM-DD` (a whole business-timezone day, `to` included) or an ISO date-time with a timezone; either end may be left open. `category` ∈ DATA, CONFIG, SECURITY; `severity` ∈ INFO, NOTICE, WARNING, CRITICAL; `source` ∈ UI, API, IMPORT, JOB; `entityType` = stored type (`Lead`) or route name (`leads`); `entityCode` / `entityLabel` match anywhere in the record number / name at the time; `field` = changed field keys or `customFields.<key>` (any of them); `ip` exact, or a prefix ending in `*`; `q` = free text over record name / number / id, user, IP, request id and the stored values (send a date range with it). Item: `{ id, createdAt, time, category, action, actionLabel, severity, module, moduleLabel, entityType, entityId, entityCode, entityLabel, recordStatus, summary, changedFields, changedBy, actorId, actorRole, source, ipAddress, requestId, page, revertsId }` — `entityCode` only for modules with a document series; `recordStatus` = `live` / `deleted` / `missing` for CRM records, null otherwise; `changedFields` lists custom fields as `customFields.<key>` |
| GET | `/facets?from&to` | Filter options with counts for the range (default the last 30 days, max 366): `{ from, to, total, users, modules, actions, categories, severities, sources }`, each `[{ value, label, count }]`, most used first (`users[].label` = full name) |
| GET | `/users?from&to` | Users tab: `{ from, to, users: [{ username, name, role, department, email, status, onLeave, isGroupUser, lastLoginAt, lastLogin, lastActivityAt, lastActivity, lastActivityLabel, total, data, config, security, signIns, failedSignIns }] }`. Every user in the user list (inactive ones too; group accounts only once they have entries), `system` (background jobs) once it has entries, and any other username with entries in the range (`status`: `active` / `inactive` / `system` / `unknown`). `total` / `data` / `config` / `security` / `signIns` / `failedSignIns` count the range (default the last 30 days, max 366); `lastActivity*` is the user's newest entry any time (`lastActivityLabel` e.g. `Updated · Leads`), `lastLogin*` the user's last successful sign-in; `lastLogin` / `lastActivity` in the business timezone. Most active first. A user's own entries are `GET /?user=<username>`; their report is `POST /exports` with that filter |
| GET | `/stats?from&to` | Summary strip: `{ from, to, today, failedSignIns24h, accessDenied24h, deletes7d, total, mostActiveUsers: [{ username, label, count }] (top 5, jobs left out), eventsPerDay: [{ date, total, data, config, security }] }`. `today` / `24h` / `7d` are fixed windows; the rest follow the range (default the last 30 days, max 366); every day of the range is listed, empty ones as 0 |
| GET | `/:id` | `{ entry, changes, fields, details, related, relatedCount }`: `entry` = list item plus `sessionId`, `httpMethod`, `route`, `userAgent`; `changes` = the stored JSON; `fields` = `[{ key, label, before, after }]` labelled from the form configuration (custom fields included; `before` null for a create, `after` null for a delete); `details` = `[{ key, label, value }]` for everything else the entry recorded (sign-in IP, refused path, import counts, reason, follow-up); `related` = the first 100 other entries of the same request (`relatedCount` = all of them; filter `requestId` for the rest); `actions` = `{ undo, restore }`, each `{ available, reason? }` or null when the entry doesn't offer it; `reversedBy` / `reverses` = the REVERT / RESTORE entry that undid this one, or the entry this one undid (list items, or null). 404 when there's no such entry |
| GET | `/:id/undo` | Undo preview of an UPDATE / STATUS_CHANGE of a CRM record (the 9 record modules): `{ id, canUndo, fields: [{ key, label, from, to, current, status }] }` (values as shown on screen). `status`: `ready` (still holds the entry's `to`, can be put back), `conflict` (changed again since), `already` (already holds the earlier value), `blocked` (not editable through the record's update, e.g. a system field). 409 `NOT_UNDOABLE` (any other entry, incl. CONVERT, IMPORT and Form Customization) or `ALREADY_REVERSED`; 404 when the record is deleted or gone |
| POST | `/:id/undo` | `{ fields?: string[] }` (default: every `ready` field) → `{ id, revertId, undone, conflicts, notReverted }` (same field shape). Puts the `from` values back through the module's own update (validation, field locking, name write-through); the module's UPDATE entry is written as `REVERT` with `revertsId` = this entry. An entry can be undone once (409 `ALREADY_REVERSED`); 409 `CONFLICT` with one `errors[]` item per field when none can be put back; the module's own `400 VALIDATION_ERROR` / `DUPLICATE_RECORD` pass through |
| POST | `/:id/restore` | Brings back the soft-deleted record of a DELETE entry → `{ id, restoreId, entityType, entityId, module }`; writes `RESTORE` with `revertsId`. Name / tax-id uniqueness is checked again (409 `DUPLICATE_RECORD`); 409 `NOT_RESTORABLE` (not a record delete), `ALREADY_REVERSED`, or `CONFLICT` (the record isn't deleted any more) |
| POST | `/exports` | `{ format: 'csv' \| 'xlsx', filters }` (`filters` = the `GET /` query, without `cursor` / `limit`) → `AuditExport { id, format, status: queued\|running\|completed\|failed\|expired, rowCount, truncated, cap, fileName, fileSize, message, createdAt, finishedAt, expiresAt }`. Up to 5,000 entries the file is written at once and the export comes back `completed`; larger ones run in the `crm-audit-export` queue (in-process when Redis is off): poll `GET /exports/:id`. Newest first, capped at 1,000,000 entries (CSV) / 500,000 (Excel) with `truncated: true`. 25 columns (time in the business timezone and UTC, user, role, category, action, severity, module, record type / id / number / name, summary, changes, details, source, IP, screen, route, request id, session id, browser, undoes entry). CSV: UTF-8 BOM, CRLF, cells starting `= + - @` prefixed with `'`. Every export writes an `EXPORT` entry (filters, format, row count). File name `audit-log-YYYY-MM-DD-HHmm.csv`; with exactly one `user` in the filter `audit-log-<username>-YYYY-MM-DD-HHmm.csv` (username lower-cased, letters / digits / `.` / `-` only) |
| GET | `/exports/:id` | The export's status (only the admin who asked for it; others get 404) |
| GET | `/exports/:id/download` | The file (`text/csv; charset=utf-8` or `.xlsx`, `Cache-Control: no-store`); 409 `CONFLICT` while not ready; 410 `EXPORT_EXPIRED` after 24 h. The browser downloads it with the session cookie |
| GET | `/integrity` | `{ digestDirConfigured, schedule, digests: { count, latest: { id, blockId, digestTime, time, source, createdBy } \| null }, lastCheck: { entryId, time, result: verified\|failed\|error, message, digests, upToBlock, durationMs, changedBy } \| null, running: { by, startedAt } \| null }` |
| POST | `/integrity/digest` | `{ digest, status }`: saves `sys.sp_generate_database_ledger_digest` now (file under `AUDIT_DIGEST_DIR` + an `AuditDigest` row) |
| POST | `/integrity/verify` | Starts "Verify integrity" in the background (`crm-audit-ledger` queue, job id `ledger-verify`, so one at a time) and returns the status with `running` set; poll `GET /integrity`. The check saves a fresh digest, runs `sys.sp_verify_database_ledger` against every digest file and writes a `LEDGER_VERIFY` entry: `verified` (INFO), `failed` (CRITICAL: a ledger error 37360–37399, i.e. a row, block or transaction doesn't match) or `error` (WARNING: the check couldn't run, e.g. permissions or a timeout; not evidence of tampering). About 100 s per million entries |

Invalid filter values return `400 VALIDATION_ERROR` (never silently widened); a range over 366 days on `/facets` /
`/stats` / `/users`, or `from` after `to`, returns `400 BAD_REQUEST`. Date-ranged queries first read the range's first and last
`id` from the `createdAt` index, then seek the clustered key, so a page costs the same at any depth; nothing counts
the whole range for the list. Performance check: `npm run perf:audit` (scratch database only; results in
[build plan Phase 11](build-plan.md)). Free text (`q`) also reads the stored values, so a search that matches nothing
scans the whole range: send a date range with it.

## 3. Rate limits

| Key | Limit | Scope | On exceed |
| --- | --- | --- | --- |
| Failed logins | `LOGIN_RATE_LIMIT_MAX` (10) per `LOGIN_RATE_LIMIT_WINDOW_SECONDS` (900 s) | IP | 429 `RATE_LIMITED` + `Retry-After` |
| Record PDF | 30 / 60 s | user | 429 |
| Template preview | 20 / 60 s | user | 429 |

Limited responses carry `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. All limits fail open when Redis is down.

## 4. Error codes

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Zod failure; `errors[].path` points at the form field |
| 400 | `INVALID_JSON`, `BAD_REQUEST`, `VALUE_TOO_LONG` | Malformed body / oversized value |
| 401 | (none) / `INVALID_CREDENTIALS` | Missing, invalid, expired or revoked session; wrong password |
| 403 | `ACCOUNT_INACTIVE` / (none) | Deactivated user; role or row-level access denied |
| 404 | `NOT_FOUND` | Missing or soft-deleted record; unknown route |
| 409 | `DUPLICATE_RECORD` | Unique violation (organization name, codes, partner name …) |
| 409 | `WRITE_CONFLICT` | Concurrent write after retries were exhausted |
| 409 | `RELATED_RECORD_CONSTRAINT` | FK violation |
| 409 | `VERSION_CONFLICT` | Stale PDF template version |
| 409 | `CITY_IN_USE` | Deleting a city still used by records |
| 409 | `NOT_UNDOABLE`, `NOT_RESTORABLE`, `ALREADY_REVERSED` | Audit log: the entry can't be undone / restored, or was already |
| 410 | `EXPORT_EXPIRED` | Audit log export older than 24 h |
| 413 | – | Body over its limit |
| 429 | `RATE_LIMITED` | See §3 |
| 503 | `SERVER_BUSY` | Lock timeout / DB couldn't start a transaction (`Retry-After: 2`) |
| 503 | `IMPORT_QUEUE_UNAVAILABLE` | Large import or status poll without Redis |
| 503 | `PDF_RENDERER_UNAVAILABLE`, `SHUTTING_DOWN` | Chromium can't start; server stopping |
| 500 | – | Unhandled; message hidden in production |

## 5. Frontend integration

- `frontend-crm/src/services/<entity>.service.ts` builds each client with `createCrudService('/<endpoint>')`, which
  gives `list`, `getAll` (walks pages of 100, capped at 10,000 rows), `getById`, `create`, `update`, `delete`,
  `deleteBulk`. Every write calls `notifyCrmUpdate(endpoint)` for cross-tab cache invalidation.
- React Query hooks in `hooks/queries/` wrap those services; query keys in `queryKeys.ts`.
- DTO types live in `frontend-crm/src/types/*.types.ts`; the backend mappers must return exactly those shapes.

## 6. Adding an endpoint — checklist

1. Zod schema in `<module>.validator.ts` (mirror the frontend schema in `frontend-crm/src/validations`).
2. Service function: use `runInTransaction`; lock existing records with `lockRecords`; check scope with
   `assertRecordAccess`; write `auditService.record(tx, …)` in the same transaction; call
   `cacheService.invalidateEntityCaches` after commit.
3. Route: `authenticate` (router-level), `requireRole(...FORM_CONFIG_ADMIN_ROLES)` for admin features,
   `validateRequest({ params, query, body })`. Register custom paths **before** `registerCrudRoutes` so `/:id` doesn't
   capture them.
4. Frontend service method + React Query hook + `notifyCrmUpdate` on writes.
5. Update the route file's header comment and this document.

## 7. Planned / missing endpoints

| Endpoint | Purpose | Notes |
| --- | --- | --- |
| `/users` (CRUD, 🔐) | Create, edit, deactivate users; reset password | `ROUTES.ADMIN_USERS` already reserved in the frontend. Deactivation and password change must call `sessionService.revokeAll(userId)` and invalidate `cache:lookups:users*` |
| `POST /auth/change-password` | Self-service password change | Revoke other sessions |
| `GET /dashboard/*` | KPI aggregates (pipeline value by stage, follow-ups due, open tickets, conversion rate) | Use the reserved `cache:dashboard:*` namespace, already invalidated on every entity write |
| `GET /opportunities/:id/pdf` etc. | PDFs for other modules | Follow the README "Adding a module" steps |
| Export (`GET /<entity>/export`) | CSV/XLSX export of a filtered list | Stream; respect row-level scope |
| Activity / follow-up log | Calls, meetings, notes against a record | New tables; would also feed the dashboard |
