# Nandini CRM — API Plan

> **Status:** living document. Lists every endpoint of `backend-crm` as of 2026-11-21 plus the planned ones.
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
| Body limits | 1 MB default; `/import` 10 MB; `/pdf-templates`, `/pdf-assets`, `/pdf-saved-items` 2 MB |
| Validation | Zod; unknown sort fields fall back to the default instead of erroring |
| IDs | UUID strings (users: integer) |
| Deletes | Soft deletes for business records (`isDeleted`), hard deletes only for personal / config data where noted |
| Updates | `PUT /:id` takes a **partial** record merged onto the stored one; `PATCH /:id` is an alias |
| Time zone | Wall-clock inputs (ticket due dates) and audit display times use `BUSINESS_TIMEZONE` (default `Asia/Kolkata`) |

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
| `/leads` | CRUD | `GET /check-duplicates?mobile&emails&excludeId&excludeType` — informational matches in leads/contacts/organizations · `POST /:id/convert` — atomic conversion → `{ organization, contact, opportunity, organizationCreated, contactCreated }`; body also takes `extraFields: { contacts, organizations, opportunities }` (fieldKey → value) for the other fields an admin shows on Convert Lead (`isVisibleInConvert`; custom fields included, saved on the new records). Every field shown there is checked by its record's form rules, with Convert Lead's own "required" (`convertIsRequired`) where set (`400` with the convert form's field name, or `extraFields.<module>.<fieldKey>`, in `errors[].path`), except for a contact or organization that already exists and is linked as it is | `status`, `excludeStatus`, `leadType`, `rating` (Hot / Warm / Cold), `leadSource`, `organizationName`, `assignedTo`, `nextFollowupDate` |
| `/opportunities` | CRUD | – (line-item totals computed server-side; line items replaced only when sent) | `salesStage`, `excludeSalesStage`, `organizationId`, `contactId`, `productId`, `assignedTo`, `minGrandTotal`, `nextFollowupDate` |
| `/quotations` | CRUD | `GET /:id/pdf?templateId&disposition=inline\|attachment` → `application/pdf` (30/min/user, Redis-cached). Creating a quotation advances the linked opportunity's stage | `status`, `quoteStage`, `opportunityId`, `organizationId`, `contactId`, `productId`, `assignedTo` |
| `/organizations` | CRUD | `GET /check-unique?organizationName&gstNumber&excludeId` → `{ exists, field?, accountCode?, message? }` · `PATCH /bulk-status` `{ ids, status: 'Active'\|'Inactive', inactivityReason? }`. `GET /:id` records a "recently viewed" entry | `accountStatus`, `customerType`, `natureOfBusiness`, `assignedTo`, `parentOrganizationId`, `recent` |
| `/contacts` | CRUD | – | `organizationId`, `assignedTo`, `isPrimaryContact` |

### 2.3 Support, catalogue and partners

| Base | Type | Notes | List filters |
| --- | --- | --- | --- |
| `/tickets` | CRUD | Nature of Call must exist in the master | `ticketStatus`, `excludeStatus`, `ticketPriority`, `supportType`, `supportMode`, `organizationId`, `contactId`, `assignedTo`, `overdue` |
| `/products` | CRUD | Not row-scoped | `category`, `type`, `isActive` |
| `/partner-companies` | CRUD | Company name globally unique | `natureOfPartner`, `assignedTo` |

### 2.4 Search, lookups and audit

| Method | Path | Cache | Description |
| --- | --- | --- | --- |
| GET | `/search?q&limit=5` | 30 s, per access scope | `{ organizations, contacts, leads, opportunities }`, each `[{ id, category, title, subtitle, meta?, href }]` |
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
| GET | `/audit-logs/:entityType/:entityId?limit=100` | – | `{ entries, revisions }` newest first. `entityType` ∈ organizations, contacts, leads, opportunities, quotations, products, tickets, partner-companies, users, form-configs (`entityId` = module key, `shared` or `all`) |

### 2.5 Personal state

| Method | Path | Description |
| --- | --- | --- |
| GET | `/table-filters?module=leads` | `{ recent (max 10), saved }` for the caller |
| POST | `/table-filters/recent` | `{ module, criteria }` — record an applied filter |
| POST | `/table-filters/saved` | `{ module, name, criteria }` — same name overwrites |
| DELETE | `/table-filters/:id` | Hard delete one of the caller's filters |

### 2.5a Scorecards (list-screen summary cards)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/scorecards` | `{ [module]: { module, fieldKey, currencyFieldKey, options: [{ value, color, hidden? }], listViewColor, drawerViewColor, updatedBy, updatedAt } }` for configured modules (any signed-in user) |
| PUT | `/scorecards/:module` | Admin only. `{ fieldKey, currencyFieldKey?, options, listViewColor, drawerViewColor }`. **400** when `fieldKey` isn't an active `select` field of the module, `currencyFieldKey` isn't an active `amount` / `number` field, an option isn't in the field's dropdown, or a color isn't `#RRGGBB` |
| DELETE | `/scorecards/:module` | Admin only. Back to the screen's built-in cards |

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
| POST | `/actions` | `{ action: accept | markBounced | remove, emails }` → `{ affectedRecords }`. `accept` = status `valid` (reason `admin_accepted`); `markBounced` ticks "Invalid Bounce"; `remove` deletes the address from every record (next address becomes primary). `markBounced` / `remove` write an UPDATE to each record's audit log |

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
| POST | `/pdf-assets` | 🔐 | `{ fileName, mimeType, data (base64), key? }`, PNG/JPEG/WebP ≤ 1 MB |
| GET | `/pdf-assets/:key` | ✔ | The image (long private cache) |
| DELETE | `/pdf-assets/:key` | 🔐 | Blocked while a template uses it |
| GET | `/pdf-saved-items?module=QUOTATION` | 🔐 | Builder library, newest first |
| POST | `/pdf-saved-items` | 🔐 | `{ module, name, content: { kind: 'section'\|'block', … } }` |
| DELETE | `/pdf-saved-items/:id` | 🔐 | Soft delete |

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
