# Nandini CRM — API Plan

> **Status:** living document. Lists every endpoint of `backend-crm` as of 2026-11-26 (through Calendar Phase 2 P2-2:
> `/api/calendar-connections` and the admin connection routes; P2-1: `/api/admin/integrations`, Admin › API
> Integrations; Profile Phase 1: `/api/me` (My Profile), `/api/user-photos` and `POST /api/auth/change-password`; and
> Profile Phase 2: `/api/admin/users` (Admin › Users) with the must-change-password claim; Profile Phase 3:
> `/api/me/preferences` (My Profile › Notifications); Profile Phase 5: `/api/company-formats` (Admin › Company formats))
> plus the planned ones.
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
| Time zone | Wall-clock inputs (ticket due dates, contract renewal reminders) and audit display times use `BUSINESS_TIMEZONE` (default `Asia/Kolkata`). Activities are the exception: their times are true instants, sent and returned as ISO strings with a zone (`…Z` or `+05:30`), and all-day ones as business-timezone days (§2.2a) |
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
| POST | `/auth/login` | – | `{ username, password }` → `{ status: 'ok', message, user }` + sets cookie. `user` has the same shape as `/auth/me` (`{ id, username, role, fullName, firstName, lastName, photoUrl, mustChangePassword }`); the JWT itself stays `{ id, username, role, tracked }`, plus `mcp: true` when the user must change their password (a new user, or after an admin reset): until they do, every other route answers `403 PASSWORD_CHANGE_REQUIRED` (see below). The user row is read again after the session is recorded, so a deactivation or admin reset that commits during the sign-in still applies (`403 ACCOUNT_INACTIVE` / `401 INVALID_CREDENTIALS`, the new session deleted). 429 after `LOGIN_RATE_LIMIT_MAX` failures per IP per window |
| POST | `/auth/logout` | – | Revokes the Redis session (if tracked), clears cookie → `{ status: 'ok', message }` |
| GET | `/auth/me` | ✔ | `{ status: 'ok', user: { id, username, role, fullName, firstName, lastName, photoUrl, mustChangePassword } }`, read from the database (not the JWT) so a name or photo change shows at once; `photoUrl` is `/api/user-photos/<id>` or `null`. `mustChangePassword` is the stored flag **or** the request token's `mcp` claim, so it agrees with the `403 PASSWORD_CHANGE_REQUIRED` gate (a session that still carries the claim after the password was changed on another device stays locked until it changes the password again or signs in again). `firstName` / `lastName` are split from `fullName` when the stored parts are missing or out of date (users created or renamed outside the app). `401` when the account no longer exists; when the database can't answer, `200` with the token's `{ id, username, role }` and `fullName: ''`, `firstName` / `lastName` / `photoUrl` `null`, `mustChangePassword` from the token's `mcp` claim (a database outage never signs the user out) |
| POST | `/auth/change-password` | ✔ | `{ currentPassword, newPassword }` (strings, ≤ 128) → `{ success, data: { passwordChangedAt, mustChangePassword: false, signedOutSessions }, message }`; `signedOutSessions` is `null` when the other sessions could not be signed out (Redis down or failing; the password is still changed, and the UI asks the user to sign them out from My Profile). Checks the current password (bcrypt or a legacy plain-text row), then the password rules (`modules/auth/passwordPolicy.ts`: 8–128 characters, a letter and a digit, not the username in any case, not the current password), stores the bcrypt hash and `passwordChangedAt` under the per-user lock `user:id:<id>` (the stored hash is re-checked inside it, so two concurrent changes from the same old password can't both succeed: the second gets `WRONG_PASSWORD`), audits `PASSWORD_CHANGE` (only the timestamp), then signs out every **other** session of the user (this one stays). It also clears `mustChangePassword` in the same transaction (audited as `passwordChangeRequired: { from: true, to: false }` in the same entry); when the account or the session's token was flagged, the auth cookie is re-issued for the **same** session (same jti, the Redis session's expiry restarted) without the `mcp` claim, with the current role. `403 ACCOUNT_INACTIVE` for a deactivated user whose session is still valid (nothing is changed, no cookie issued); `400 WRONG_PASSWORD` "Current password is incorrect." (path `currentPassword`); `400 WEAK_PASSWORD` with the rule's message (path `newPassword`); 429 after 10 requests per 15 min per user ("Too many password attempts. Please wait a few minutes.") |

The auth endpoints use the older `{ status: 'ok', … }` envelope rather than `{ success, data }`; the frontend's
`auth.service.ts` expects it. `change-password` is the exception: it is newer and uses `{ success, data }`.

**Must change password.** While the token carries `mcp` (`authenticate`, allow-list in
`backend-crm/src/middlewares/passwordChangeGate.ts`, unit tested) only these answer: `GET /auth/me`, `POST /auth/logout`,
`POST /auth/change-password`, `GET /me/profile`, `GET /me/sessions`, `GET /user-photos/:id` (method + whole path,
case-insensitive, query string and a trailing slash ignored). Everything else is `403 PASSWORD_CHANGE_REQUIRED`
"Change your password to continue." (not audited as `ACCESS_DENIED`); the frontend sends the user to
My Profile › Security. Tokens issued before the claim existed stay valid (no claim = not flagged). The preference
routes (`/me/preferences`) are not on the list: they answer `403 PASSWORD_CHANGE_REQUIRED` while locked (the UI hides
the Notifications tab then).

### 2.2 Sales & customer records

| Base | Type | Extra endpoints | List filters |
| --- | --- | --- | --- |
| `/leads` | CRUD | `GET /check-duplicates?mobile&emails&excludeId&excludeType` — informational matches in leads/contacts/organizations · `POST /:id/convert` — atomic conversion → `{ organization, contact, opportunity, organizationCreated, contactCreated }`; the new organization, contact and opportunity are assigned to the lead's own `assignedTo` (the body takes no Assigned To fields); `createOpportunity: false` (default `true`) converts without creating an opportunity — the opportunity fields are then ignored (not validated), `opportunity` is `null` and the lead's `convertedOpportunityId` stays empty; body also takes `extraFields: { contacts, organizations, opportunities }` (fieldKey → value) for the other fields an admin shows on Convert Lead (`isVisibleInConvert`; custom fields included, saved on the new records). Every field shown there is checked by its record's form rules, with Convert Lead's own "required" (`convertIsRequired`) where set (`400` with the convert form's field name, or `extraFields.<module>.<fieldKey>`, in `errors[].path`), except for a contact or organization that already exists and is linked as it is. A new organization with `customerType` Partner needs `natureOfPartner` (`400` on `natureOfPartner`); a new opportunity whose `opportunityLeadSource` is CA / Reference needs `referredBy` (+ `referredById`, an active referral; the lead's own unlinked legacy value is carried over as it is), and Partner needs `opportunityPartnerCompany` (`400` on that field). Leads: `referredBy` is required when `leadSource` is CA or Reference and must be an **Active referral** (`/referrals`): send `referredById` (the API stores the referral's name in `referredBy`), or a `referredBy` that names exactly one active referral (imports); a value typed before the Referrals module existed is accepted only unchanged, and a referral already on the record stays when it goes Inactive (`400` on `referredBy`: "Pick Referred By from the active Referrals." / "This referral is Inactive…" / "The selected referral no longer exists."). Also `partnerCompany` (a partner organization's name, stored uppercase) when it is Partner (`400` on that field; on `PATCH` only when `leadSource`, `referredBy` or `partnerCompany` is sent); `partnerCompany` is cleared for any other Lead Source. The lead import takes `referredBy` and `partnerCompany` columns under the same rule. `followupType` `Task` / `Note` (Activities-only Followup Types) is refused on create and when an update changes it (`400` on `followupType`: "Task and Note can only be used on Activities."; a lead already storing one keeps it); likewise on Convert Lead's new opportunity | `status`, `excludeStatus`, `leadType`, `rating` (Hot / Warm / Cold), `leadSource`, `organizationName`, `assignedTo`, `nextFollowupDate` |
| `/opportunities` | CRUD | – (line-item totals computed server-side; line items replaced only when sent). `tallySerialNo`, when given, must be exactly 9 digits starting with 7 (`400` with `errors[].path` `tallySerialNo`); a value saved before that rule is kept on `PATCH` until the field itself is sent. Documentation: `addDocument` must be `Yes` when `salesStage` is `PO`, and `Yes` needs `documentFile` (an uploaded `/files` id, or the `{ id, … }` object the API returns); `400` with `errors[].path` `addDocument` / `documentFile`. On `PATCH` these are checked when `salesStage`, `addDocument` or `documentFile` is sent. Commission: `commissionType` is not editable (a sent value is ignored; stored as `Self` up to 1,000 and `Other` above), and above 1,000 the payee's `accountName`, `accountNo`, `bankName`, `ifscCode` and `panNumber` are all required (`400` with one `errors[]` entry per empty field; on `PATCH` when a commission or bank field is sent). `documentNo`, `documentDate` and `documentFile` are kept only while `Yes` (stored as the opportunity's `Document`, listed by `/documents`); responses carry `documentFile: { id, fileName, mimeType, sizeBytes, url } \| null`. Lead Source follow-up, as on leads: `referredBy` (+ `referredById`, an active referral, same rules) required for `leadSource` CA / Reference, `partnerCompany` for Partner (`400` on that field; on `PATCH` only when one of the three is sent; `partnerCompany` cleared for other sources). **Customer Response by Sales Stage** (`opportunity.followUp.ts`, Form Builder › Opportunities › Response Rules): a non-empty `customerResponse` sent with the save records a follow-up and must be an active option of the field's list that fits the `salesStage` (option meta `opportunityStages`; none = every open stage), else `400` on `customerResponse`; it then needs `nextFollowupDate` + `nextFollowupTime` later than now (`400` on that field), unless the option has `noFollowUp` (Do Not Contact: kept, follow-up cleared). `salesStage` Closed Won / Closed Lost stores no response and no follow-up (both cleared, also on a stage-only `PATCH`). A `PATCH` without a response keeps the stored one. `followupType` `Task` / `Note` refused as on leads | `salesStage`, `excludeSalesStage`, `organizationId`, `contactId`, `productId`, `assignedTo`, `minGrandTotal`, `nextFollowupDate` |
| `/quotations` | CRUD | `GET /:id/pdf?templateId&disposition=inline\|attachment` → `application/pdf` (30/min/user, Redis-cached). Creating a quotation advances the linked opportunity's stage | `status`, `quoteStage`, `opportunityId`, `organizationId`, `contactId`, `productId`, `assignedTo` |
| `/organizations` | CRUD | `GET /check-unique?organizationName&gstNumber&excludeId` → `{ exists, field?, accountCode?, message? }` · `PATCH /bulk-status` `{ ids, status: 'Active'\|'Inactive', inactivityReason? }`. `GET /:id` records a "recently viewed" entry. `natureOfPartner` is required when `customerType` is Partner (`400`, `errors[].path` `['natureOfPartner']`; on update only when the body sends `customerType` or `natureOfPartner`) and cleared for any other Customer Type | `accountStatus`, `customerType`, `natureOfBusiness`, `assignedTo`, `parentOrganizationId`, `recent` |
| `/contacts` | CRUD | – | `organizationId`, `assignedTo`, `isPrimaryContact` |

### 2.2a Activities (calls, meetings, tasks, notes)

`/activities` — `backend-crm/src/modules/activities` (route header comment = source of truth). Unnumbered records,
not in global search, row-scoped by owner **and** attendance: a user sees activities they own (`assignedTo`), created
or are invited to as a colleague; only the owner, the creator or a global role may change or delete one (`403`
"Only the activity's owner can change it. Invitees can reply to the invitation."). Invitees reply with
`POST /:id/response`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/meta` | `{ timeZone, now, relatedModules: [{ key, label }], durationMinutes: { <Followup Type>: minutes }, fallbackDurationMinutes, reminders: [{ value, minutes }], statuses, maxDurationDays }` for the form and calendar |
| GET | `/calendar?from&to&users&types&sources&status` | `{ timeZone, from, to, truncated, items: CalendarItem[] }`. `from` / `to`: instants with a zone, `to` exclusive, at most 62 days apart (`400` on `to`). `users`: csv of usernames (default the caller; others only within the caller's access); `types`: Followup Types; `sources` ⊆ `activity`, `leadFollowup`, `opportunityFollowup`, `contractRenewal` (default all); `status`: activity statuses (default Planned + Completed). Activities overlap the window; lead / opportunity follow-ups (open records, `nextFollowupDate` + time) and contract renewal reminders (not Expired) are read-only items. Item: `{ key: '<source>:<id>', source, module, recordId, title, followupType, start, end (null for point items), allDay, startDay, endDay (all-day, inclusive), status, assignedTo, relatedModule, relatedId, relatedTo, location, attendeeCount, myResponse, editable, overdue }`, sorted by start. At most 2000 activities and 1000 items per other source; `truncated: true` when a cap was hit |
| GET | `/link-targets?module&search&limit` | Records of one module (`leads`, `opportunities`, `contacts`, `organizations`, `quotations`, `tickets`, `contracts`) the caller can access, for the Related To picker: `[{ module, id, code, label, organizationName, organizationId?, contact, contactId?, assignedTo }]`, newest first; `label` is what a save stores as `relatedTo` (at most 200 characters: a nameless opportunity's product list is cut with `…`); `search` matches the record number (by prefix) or name; `limit` default 20, max 50 |
| GET | `/` | Paginated list (§1.2). Filters: `followupType`, `status`, `excludeStatus` (csv), `assignedTo`, `mine` (owned by the caller), `attending` (invited), `relatedModule` + `relatedId` (a record's Activities tab), `organizationId` / `contactId` (with `rollup=true`: also activities related to that organization, or related to / attended by that contact), `from` + `to` (both or neither; activities overlapping the window plus notes written in it), `overdue` (Planned and already ended), `createdWithinDays`. Search: subject, related record (label or number), organization, contact, location. Sort: `startAt`, `endAt`, `createdAt`, `updatedAt`, `subject`, `followupType`, `status`, `assignedTo`, `relatedTo`, `organizationName` |
| GET | `/:id` | The activity plus `viewer: { canEdit, myResponse }` (the caller's reply when invited, else null). Times are UTC instants (`startAt`, `endAt`, `''` on notes); all-day ones also carry `startDay` / `endDay` (inclusive) and `timeZone`; `attendees: [{ kind, username?, contactId?, email?, name, responseStatus, respondedAt? }]` (blank keys left out) |
| POST | `/` | 201. Required: `followupType` (an option of `shared_followup_type`; `Task` / `Note` in any case), `subject`, `assignedTo` (an active user). **Timed:** `startAt` (required unless Note) / `endAt` as ISO instants with a zone; an omitted `endAt` defaults to the type's duration (`/meta`). **All-day:** `allDay: true` with `startDay` / `endDay` (`YYYY-MM-DD`, inclusive, business timezone; `endDay` defaults to `startDay`); the instants are ignored and stored as midnight → midnight after the last day. `endAt` can't be before `startAt` (`400` "End cannot be before Start.") or more than 31 days after it. A **Planned** activity can't start in the past (5 minutes' grace; all-day: before today) unless the start is unchanged; Completed / Cancelled ones can (log a past call). `relatedModule` + `relatedId` link one record the caller can access (`403` "You can't link an activity to a record you don't have access to."; `relatedTo` alone is refused: "Pick the record this activity is related to."); `organizationId` / `contactId` (or names, linked like contracts) default to the related record's. `attendees`: up to 50 of `{ kind: 'user', username }` (active users; the owner is dropped), `{ kind: 'contact', contactId, email? }` (live contacts), `{ kind: 'email', email, name? }`; `responseStatus` is honoured for contacts / emails (the owner records their replies). `reminder`: an `activity_reminder` label. **Note:** `remarks` required, no schedule / reminder / location / attendees, saved as Completed. **Task:** no attendees or location. `customerResponse`: an option of the list the Activities field is linked to (today `shared_customer_response`, as on leads and opportunities), stored as text; it sets no lead Rating, isn't checked against an opportunity's Sales Stage and clears no follow-up. Custom fields as on other modules |
| PUT / PATCH | `/:id` | Partial update merged onto the stored activity (owner, creator or global role). Sending `startDay` / `endDay` / `allDay` switches between timed and all-day; picking another related record re-derives organization / contact unless they're sent too; clearing it (`relatedModule` / `relatedId` null or `''`) keeps them. Attendees are synced by identity (only the changes are written; replies of attendees who stay are kept). Setting Completed fills `completedAt` / `completedBy`; leaving it clears them. A change of times, type, subject, location, owner, status or the attendee set bumps `revision`; `remindAt` is recomputed on every write, and a changed `remindAt` arms the reminder again |
| DELETE | `/:id` | Soft delete (owner, creator or global role); the reminder is cleared |
| POST | `/bulk-delete` | `{ ids }` → `{ deleted, ids, notFound }` (each id needs edit rights) |
| POST | `/:id/response` | `{ responseStatus: 'accepted' \| 'tentative' \| 'declined' }` → the activity view. Invited colleagues only (`403` "Only invited colleagues can reply to this activity."; also for notes); `404` when missing. Audited as `RSVP` (not undoable) |

Audit: `Activity` entries (`CREATE`, `UPDATE`, `DELETE`, `RESTORE`, `REVERT`, `RSVP`); `GET /audit-logs/activities/:id`
for anyone who can view the activity. Admin › Audit Log can undo updates and restore deleted activities.

### 2.3 Support, catalogue and partners

| Base | Type | Notes | List filters |
| --- | --- | --- | --- |
| `/tickets` | CRUD | Nature of Call must exist in the master | `ticketStatus`, `excludeStatus`, `ticketPriority`, `supportType`, `supportMode`, `organizationId`, `contactId`, `assignedTo`, `overdue` |
| `/contracts` | CRUD | Required: `contractTitle`, `assignedTo` (Contract Manager: an active user, else the caller), `organizationName`, `contact`; `status` defaults to `Not Started`. Organization by `organizationId`, else by name; contact by `contactId`, else by name within that organization; opportunity by `opportunityId`, else the typed label is kept unlinked (unknown / deleted id → 400 on `organizationName` / `contact` / `opportunity`). Dates `YYYY-MM-DD`, `renewalReminderDate` wall clock `YYYY-MM-DDTHH:mm`; start / end / bill dates and the reminder can't be in the past unless unchanged, and `endDate` can't be before `startDate` (400 on that field). `contractValue` / `billAmount` ≥ 0 with ≤ 2 decimals, returned as strings (`''` when empty); `tallySerialNo`, when given, exactly 9 digits starting with 7 (an older value is kept on `PATCH` until the field is sent); `contractType` is a string array. Search: a `CTR-` / series number by prefix, else number, title, organization, contact, opportunity, Tally serial no., bill number. Sort: `createdAt`, `updatedAt`, `contractNumber`, `contractTitle`, `status`, `organizationName`, `assignedTo`, `startDate`, `endDate`, `renewalReminderDate`, `contractValue` | `status`, `excludeStatus`, `organizationId`, `contactId`, `opportunityId`, `assignedTo` |
| `/documents` | Read-only (`GET /`, `GET /:id`) | Activities › Documents: the document each opportunity records in its Documentation section, written only through `/opportunities` (`addDocument`, `documentNo`, `documentDate`, `documentFile`). Row: `{ id, documentNo, documentDate, documentFile: { id, fileName, mimeType, sizeBytes, url } \| null, opportunityId, opportunityCode, opportunity (label), salesStage, organizationName, organizationId?, contact, contactId?, assignedTo (the opportunity's), createdBy, updatedBy, createdAt, updatedAt }`. Only documents of live opportunities, scoped by the opportunity's access (`GET /:id` → 404 / 403 as for the opportunity). Search: an `OPP-` number by prefix, else Document No, file name, opportunity code / name, organization, contact. Sort: `createdAt`, `updatedAt`, `documentNo`, `documentDate` | `opportunityId`, `organizationId`, `contactId`, `assignedTo`, `mine`, `createdWithinDays` |
| `/products` | CRUD | Not row-scoped | `category`, `type`, `isActive` |
| `/partner-companies` | CRUD | Company name globally unique | `natureOfPartner`, `assignedTo` |
| `/referrals` | CRUD | Referred By master. Required: `name`, `mobile` (unique among live referrals, `409`), `organizationName` (by `organizationId`, else by name), `assignedTo`; `status` `Active` / `Inactive` (default `Active`); `emailAddress` like contacts. No record number. Lists are **not row-scoped** (every user picks Referred By from them); changes need the assignee, the creator or a global role. A rename is written through to the leads' and opportunities' `referredBy` | `status`, `organizationId`, `assignedTo`, `mine`, `createdWithinDays` |

### 2.4 Search, lookups and audit

| Method | Path | Cache | Description |
| --- | --- | --- | --- |
| GET | `/search?q&limit=5` | 30 s, per access scope | `results: { leads, opportunities, quotations, organizations, contacts, tickets, contracts, products, partnerCompanies }`, each `[{ id, category, title, subtitle, meta?, href }]` |
| GET | `/lookups/users?includeInactive` | 5 min | User pickers: `[{ id, name, username, department, role, email, status, isGroupUser, onLeave, photoUrl, outOfOffice }]` (`photoUrl` = `/api/user-photos/<id>` or null; only the photo id is read; `outOfOffice` = `{ from, to, message }` (`YYYY-MM-DD`, inclusive) or null when unset or ended when the list was read: the client decides "active" against the business day). Dropped by profile name / photo / out-of-office changes and user writes (`cache:lookups:users*`) |
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
| GET | `/audit-logs/:entityType/:entityId?limit=100` | – | `{ entries, revisions }` newest first (entry `id` is a string). `entityType` ∈ organizations, contacts, leads, opportunities, quotations, products, tickets, contracts, activities, partner-companies, referrals, users, pdf-templates, form-configs (`entityId` = module key, `shared` or `all`; includes drawer layout and drawer piece changes), scorecards (`entityId` = module key). **Access:** admins read every trail. Others: organizations / contacts / leads / opportunities / quotations / tickets / contracts need access to the record (403; 404 if it doesn't exist); activities need view access (owner, creator, invited colleague or global role; 403 / 404 likewise); `users` only their own trail; `pdf-templates`, `form-configs` and `scorecards` admin-only (403); products, partner companies and referrals any signed-in user |

### 2.5 Personal state

| Method | Path | Description |
| --- | --- | --- |
| GET | `/table-filters?module=leads` | `{ recent (max 10), saved }` for the caller. `module`: a CRM module key, `documents` (Activities › Documents) or `audit-log` (Admin › Audit Log) |
| POST | `/table-filters/recent` | `{ module, criteria }` — record an applied filter |
| POST | `/table-filters/saved` | `{ module, name, criteria }` — same name overwrites |
| DELETE | `/table-filters/:id` | Hard delete one of the caller's filters |

**My Profile** (`/me`, `backend-crm/src/modules/profile`, route header comment = source of truth; Profile Phase 1;
preferences Profile Phase 3, `backend-crm/src/modules/preferences`).
The signed-in user's own profile, photo, sessions and notification preferences: every route acts on the caller (there
is no user id in any request). Role, department, work email and username are admin-managed and read-only here. Profile and photo changes
are audited as a User `UPDATE` (category DATA, module `users`, not undoable); signing out sessions as
`SESSION_REVOKE` (SECURITY, NOTICE). Profile and photo writes drop the user lookup caches (`cache:lookups:users:*`).

`ProfileDto`: `{ id, username, firstName, lastName, fullName, email, role, department, jobTitle, reportsTo: { id, name }
| null, mobile, officePhone, photoUrl, mustChangePassword, lastLoginAt, passwordChangedAt, createdAt }` (`jobTitle` and
`reportsTo` are set in Admin › Users and read-only here; `reportsTo.name` is the manager's `fullName`, or username when
blank; `mobile` = the `phone` column; empty values and dates are `null`, dates
ISO). `SessionDto`: `{ id (the session's JWT id), current, ip, userAgent, device ("Chrome on Windows",
`describeUserAgent`), createdAt, expiresAt }` (ISO or `null`).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/me/profile` | `ProfileDto`. `401` when the account no longer exists |
| PATCH | `/me/profile` | `{ firstName?, lastName?, mobile?, officePhone? }` → `ProfileDto`. Keys left out stay as they are; any other key → `400 VALIDATION_ERROR` (unrecognized key). `firstName` is required when sent (≤ 100, name-cased with `formatPersonName`); `lastName` `''` / `null` clears it; `mobile` / `officePhone` are E.164 (national Indian numbers normalized, `''` / `null` clears; "Mobile must be a valid phone number with country code (e.g. +919811234567)."). When a name actually changes, `fullName` is recomputed as `trim(firstName + ' ' + lastName)`; names equal to the ones `ProfileDto` shows (split from `fullName` when the stored parts are missing or out of date) count as unchanged, so a phone-only edit never rewrites `fullName`. `400 VALIDATION_ERROR` "First and last name together cannot exceed 99 characters." / "First Name is required." (a row with no name at all given a last name only). No change → no audit entry |
| PUT | `/me/photo` | `{ mimeType: 'image/png' \| 'image/jpeg' \| 'image/webp', data (base64 or data: URI), fileName? }` → `{ photoUrl }`. ≤ 512 KB decoded; the bytes must be PNG, JPEG or WebP (the detected type is stored). Replaces the old photo with a new row (new id → new URL). `400 INVALID_IMAGE` "Upload a PNG, JPEG or WebP image."; `400 IMAGE_TOO_LARGE` "The photo must be 512 KB or smaller." |
| DELETE | `/me/photo` | `{ photoUrl: null }`; nothing happens (and nothing is audited) when there is no photo |
| GET | `/me/sessions` | `{ tracked, sessions: SessionDto[] }`, the current session first, then newest sign-in. From the Redis rows `session:{userId}:*`; `{ tracked: false, sessions: [] }` while Redis is down; `tracked: false` with a list when the caller's own session was opened while Redis was down |
| DELETE | `/me/sessions/:id` | Signs out one other session → `{ id }`. `id` must be a UUID (`400 VALIDATION_ERROR`). `400 CURRENT_SESSION` "Use Sign out to end this session."; `404 NOT_FOUND` "This session has already ended."; `503 SESSIONS_UNAVAILABLE` while Redis is down. 30 / 10 min per user (with the route below) |
| DELETE | `/me/sessions` | Signs out every other session → `{ signedOutSessions }`. `503 SESSIONS_UNAVAILABLE` (and no audit entry) while Redis is down or when it fails partway |
| GET | `/me/preferences` | `PreferencesDto` (below). `401` "Your account was not found. Please sign in again." when the account no longer exists |
| PATCH | `/me/preferences` | `PreferencesPatch` (below) → `{ success, data: PreferencesDto, message: 'Preferences saved' }`. Rules and errors below |
| GET | `/user-photos/:id` | Any signed-in user. The image bytes with `Content-Type` (detected), `Content-Length`, `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: cross-origin` and an inline `Content-Disposition`. `id` must be a UUID; `404` "Photo not found" |

**My Profile › Notifications** (as of 2026-11-26, Profile Phase 3). One `UserPreference` row per user, written on the
first save that changes something; no row = every default (the behaviour before Phase 3).

```ts
type InAppNotificationKind = 'activity_reminder' | 'activity_assigned' | 'activity_invited' | 'contract_renewal';
interface PreferencesDto {
  inApp: Record<InAppNotificationKind, boolean>;               // false = no bell row of that kind is created
  morningSummaryEmail: boolean;
  defaultReminder: ActivityReminder | 'none' | null;          // null = company default (pre-fills new activities only)
  outOfOffice: { from: string; to: string; message: string | null; active: boolean } | null; // null when none or ended
  onLeave: boolean;                                            // the admin switch, read-only here
  email: string;                                               // '' when the account has none
  mail: { summaryEnabled: boolean; mailEnabled: boolean };     // MORNING_SUMMARY_ENABLED; SMTP configured
  updatedAt: string | null;                                    // null = never saved
}
interface PreferencesPatch {                                   // every key optional; {} changes nothing
  inApp?: Partial<Record<InAppNotificationKind, boolean>>;
  morningSummaryEmail?: boolean;
  defaultReminder?: ActivityReminder | 'none' | null;
  outOfOffice?: { from: string; to: string; message?: string | null } | null; // null clears all three columns
}
```

- Unknown keys (top-level or nested) → `400 VALIDATION_ERROR`. Switches: `"<Row label>" must be on or off.` (row
  labels Activity reminders, Assignments, Invitations, Contract renewals, Morning summary email). `defaultReminder`:
  one of the 8 reminder labels, `'none'` or `null`, else "Pick a reminder from the list.".
- `outOfOffice`: `from` / `to` are `YYYY-MM-DD` ("Start Date must be a valid date (YYYY-MM-DD).", "End Date is
  required."), inclusive business-timezone days; `message` trimmed, ≤ 200 ("Message cannot exceed 200 characters."),
  `''` / `null` clears it, left out keeps the stored one. Then, in order, at most one error per field, path
  `['outOfOffice', 'from' | 'to']`: "End Date cannot be before the Start Date."; "Out of office can be at most 365
  days."; and only when the range differs from the stored one: "End Date cannot be in the past." (a start in the past
  is fine while the end is today or later), "Start Date must be within the next 365 days." (`preferences.rules.ts`,
  contract-tested with `frontend-crm/src/utils/notificationPreferences.ts`).
- Kinds without a switch (`calendar_reconnect`) are not configurable and always deliver. Bell notifications keep
  arriving while out of office; muting a kind stops new rows only (ones already in the bell stay).
- Saves take the per-user lock `user:id:<id>` and are audited as User `UPDATE` with the changed columns (dates as
  `YYYY-MM-DD`); no change → nothing written, no audit entry. An out-of-office change drops `cache:lookups:users:*`.

**Notifications** (`/notifications`, `backend-crm/src/modules/notifications`, route header comment = source of truth;
Calendar Phase 1 PR3). The navbar bell's rows: personal (every query is limited to the caller's username), not
audited, deleted by the nightly retention job. Written by the reminders worker and after activity saves
([system design §5.1](system-design.md#51-reminders-and-notifications-crm-reminders)); there is no endpoint to create
one.

`NotificationDto` (empty values are `''`, never `null`):
`{ id, kind: 'activity_reminder' | 'activity_assigned' | 'activity_invited' | 'contract_renewal' | 'calendar_reconnect',
title, body, entityModule: 'activities' | 'contracts' | 'calendar-connections' | '', entityId, dueAt (ISO or ''), actor
(username, 'system' or ''), readAt (ISO, '' while unread), createdAt (ISO), href }`. `href` is the app route to open:
activities `/calendar?activity=<id>` (the calendar opens the activity drawer), contracts `/contracts/<id>`,
`calendar-connections` (entityId = the connection id) `/profile?tab=connected-accounts` (My Profile › Connected
accounts, Profile Phase 4; computed when read, so older rows follow), otherwise `''`.
`calendar_reconnect` (as of 2026-11-26, P2-2; actor `system`): "Reconnect your <provider>" when a refresh is refused
(`invalid_grant`), the company app changed (`client_changed`) or a time-limited grant ended (`grant_expired`), dedupe
`calendar_reconnect:<connectionId>:<connectedAt ms>:<ISO week>`; "Your <provider> access ends soon" 3 days before a
time-limited Google grant ends, dedupe `calendar_reconnect:<connectionId>:<connectedAt ms>:expiring`. `connectedAt`
is set again by every (re)connect and never by a token refresh, so a reconnect of the same account (same row id) re-arms
both keys.
Titles: `Reminder: <subject>`, `Assigned to you: <subject>`, `Invitation: <subject>`, `Contract renewal due: <title>`;
bodies say when and what it is related to (e.g. "Starts at 10:30 AM (in 15 min) · Related to LD-0012 Ramesh").

| Method | Path | Description |
| --- | --- | --- |
| GET | `/notifications?unreadOnly&limit&before` | `{ success, data: NotificationDto[], nextCursor, unreadCount }`, newest first (keyset on `createdAt`, `id`). `unreadCount` is counted in SQL (not served from the cache) and re-cached, so opening the bell corrects a wrong badge. `unreadOnly`: `true` / `false` / `1` / `0`; `limit`: whole number 1–50 (default 20); `before`: the previous page's `nextCursor` (`<createdAt ISO>\|<id>`; `null` on the last page). `400 VALIDATION_ERROR` "limit must be a whole number from 1 to 50." / "before must be a cursor returned as nextCursor (<createdAt ISO>\|<id>)." / "Must be true or false." |
| GET | `/notifications/unread-count` | `{ count }`. Served from Redis (`cache:notifications:unread:{username}`, 24 h); every write to the user's notifications, marking read, the nightly job and a Redis reconnect clear it, and a count read during a write is never cached ([system design §4.2](system-design.md#42-cache-invalidation)); reads SQL while Redis is down. The bell polls it every minute |
| POST | `/notifications/:id/read` | `{ id, readAt }`. Idempotent (an already-read row keeps its first read time); always clears the caller's cached unread count. `404 NOT_FOUND` "Notification not found" when it doesn't exist or isn't the caller's; `400 VALIDATION_ERROR` for an empty id or one over 50 characters |
| POST | `/notifications/read-all` | `{ updated }` (rows marked read); always clears the caller's cached unread count, even when `updated` is 0 |
| GET | `/notifications/morning-summary/preview` | The caller's morning summary email for today, sent nowhere (works while mail is off): `{ subject, html, text, counts: { todayActivities, overdueActivities, followupsToday, overdueFollowups, contracts }, empty, mailEnabled, email, notSentReason }`. `counts` are full totals, also where the email lists only the first rows. `empty`: nothing is due (by default no email goes out then); `mailEnabled`: outgoing email is on; `email`: the caller's address (`''` = they get no email); `notSentReason`: `'on_leave'` \| `'out_of_office'` \| `'opted_out'` \| `null`, why the caller gets no summary today (in that precedence; null = they get one). `404` "User not found" |
| POST | `/notifications/morning-summary/test` 🔐 | Sends the caller's summary to their own address now (EmailLog `kind = 'morning_summary_test'`, no dedupe; ignores the caller's own opt-out, out of office and on leave) → `{ success, data: { status: 'sent' \| 'failed' \| 'skipped' \| 'duplicate', error?, email, message }, message }`; `message` is "Test email sent to <email>." or "The test email could not be sent: <SMTP error>" (a failed send is still a 200). `403 FORBIDDEN` for non-admin roles; `400 BAD_REQUEST` "Email is turned off on the server (MAIL_ENABLED is false or SMTP_HOST is empty), so nothing can be sent yet." or "Your user account has no email address, so a test email has nowhere to go. Ask an admin to add one." |

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
`tickets`, `contracts`, `partner-companies`, `referrals`. The `lineItems` and `totals` blocks are allowed only on `opportunities` and
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
| PATCH | `/options/:optionId` | `{ label?, meta?, isDefault? }`; a rename rewrites stored values in records and filters. `meta.ratingRule`, `meta.opportunityStages` (array of Sales Stage values) and `meta.noFollowUp` (boolean) on Customer Response options, and `meta.closesLead` on Status options, are validated; renaming a Sales Stage renames it in every `opportunityStages` — [lead-rating-rules.md](lead-rating-rules.md). `isDefault: true` on `Task` / `Note` of `shared_followup_type` is refused (`400` on `isDefault`: "Task and Note are offered on Activities only, so they can't be the default Followup Type.") |
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

**Company formats** — `/company-formats` (Admin › Company formats, Profile Phase 5;
`backend-crm/src/modules/company-formats/companyFormats.routes.ts`, route header comment = source of truth). How dates,
times and numbers are **shown** across the CRM, its quotation PDFs, the morning email, new bell notification texts and
audit times. Display only: stored values and every API field (ISO dates, plain numbers) never change format, nor do
exports. All three routes sit behind the must-change-password gate (403 `PASSWORD_CHANGE_REQUIRED`; the frontend
bootstrap skips the read while the claim is set).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Any signed-in user: `CompanyFormatsDto` (below). No saved setting → the defaults with `customized: false` |
| PUT | `/` 🔐 | `{ dateFormat, timeFormat, numberGrouping }` (all three required, unknown keys refused) → `{ success, data: CompanyFormatsDto, message: 'Company formats saved' }`. Saving the stored values writes and audits nothing. Otherwise upserts the single row and audits `CompanyFormats UPDATE` (the first save records `customized: false → true`) |
| DELETE | `/` 🔐 | Reset to the CRM defaults: deletes the row (screens go back to their pre-Phase-5 styles) → `{ success, data: CompanyFormatsDto, message: 'Company formats reset to the CRM defaults' }`; audited `CompanyFormats UPDATE` (`customized: true → false`). Nothing saved → no write, no audit |

```ts
interface CompanyFormatsDto {
  dateFormat: 'DD-MMM-YYYY' | 'DD MMM YYYY' | 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';
  numberGrouping: 'indian' | 'international';
  customized: boolean;          // false = never saved / reset: every screen keeps its pre-Phase-5 style
  currency: { code: 'INR'; symbol: '₹'; name: 'Indian Rupee'; decimals: 2 }; // informational, not a setting
  timeZone: string;             // BUSINESS_TIMEZONE
  updatedAt: string | null;     // ISO; null while not customized
  updatedBy: string | null;     // username; null while not customized
}
```

Errors: 400 `VALIDATION_ERROR` (`errors[].path` `['dateFormat']` "Pick a date format from the list.", `['timeFormat']`
"Pick 12-hour or 24-hour time.", `['numberGrouping']` "Pick Indian or International number grouping.", or an unknown
key); 401; 403 `FORBIDDEN` (PUT / DELETE by a non-admin role); 403 `PASSWORD_CHANGE_REQUIRED`. The value lists and
formatters are `backend-crm/src/modules/company-formats/core/displayFormats.ts`, copied to
`frontend-crm/src/lib/display-formats` by `npm run sync:display-formats` (checked by `contractSync.test.ts`).

**Holidays** — `/holidays` (Admin › Holidays; `backend-crm/src/modules/holidays`, route header comment = source of truth)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/calendar?from&to` | Any signed-in user: Active holidays on the days `from`–`to` (`YYYY-MM-DD`, both included, at most 400 days apart) → `[{ id, occasion, holidayDate, repeatsYearly }]`, by date. Yearly holidays appear on their day in every year of the range (29 Feb on 28 Feb in other years) with `id` = `<id>@<year>`; a one-off copy of a yearly holiday on the same day is left out. Read by the Calendar page and the activity Start / End fields |
| GET | `/?page&limit&search&year&status&sortBy&sortOrder` 🔐 | `{ success, data: Holiday[], total, page, limit, years }`. `limit` ≤ 200 (default 50); `search` matches the occasion; `sortBy` ∈ holidayDate (default, newest first), occasion, status, updatedAt; `year` also matches every yearly holiday; sorted by `holidayDate` the yearly ones come first; `years` = every year from the earliest to the latest one-off holiday plus the current one, newest first. Holiday: `{ id, occasion, holidayDate (YYYY-MM-DD, or MM-DD when repeatsYearly), repeatsYearly, status, createdBy, updatedBy, createdAt, updatedAt }` |
| GET | `/:id` 🔐 | One holiday |
| POST | `/` 🔐 | `{ occasion (≤ 100), holidayDate (YYYY-MM-DD, years 2000–2100; `MM-DD` when `repeatsYearly`, where a full date is accepted and its year dropped), repeatsYearly? (boolean or Yes / No, default false), status? }` → 201. `status` ∈ Active (default), Inactive (any letter case). 409 `DUPLICATE_HOLIDAY` (on `occasion`) when that occasion is already a holiday on that date (or that yearly day), ignoring letter case, or a one-off date is already covered by a yearly holiday of that occasion. Audited `CREATE` |
| PUT / PATCH | `/:id` 🔐 | Partial; merged onto the stored holiday and validated whole; 409 `DUPLICATE_HOLIDAY`. Audited `UPDATE` (`STATUS_CHANGE` when only the status changed) |
| DELETE | `/:id` 🔐 | Permanent; audited `DELETE` with the holiday's values |
| POST | `/bulk` 🔐 | `{ action: activate \| deactivate \| delete, ids (≤ 500) }` → `{ affected }` (holidays already in that status are left alone) |
| POST | `/import` 🔐 | `{ rows: [{ rowNumber, values: { occasion, holidayDate, repeatsYearly, status } }] (≤ 1,000), fileName?, dryRun? }` → `{ dryRun, total, created, duplicates, failed, rows: [{ rowNumber, outcome: new \| duplicate \| error, occasion, holidayDate, repeatsYearly, status, messages }] }`. Dates are read day first: `15/08/2026`, `15-08-26`, `15 Aug 2026`, `Aug 15, 2026` or `2026-08-15`; a date without a year (`26/01`, `26 Jan`, `Jan 26`) makes a yearly holiday, as does Repeats Every Year = Yes (a row saying No needs a year). A row repeating a saved holiday or an earlier row is a duplicate and is skipped. `dryRun: true` only checks (the wizard's preview); otherwise the new rows are added in one transaction, each audited `CREATE` (source IMPORT) plus an `IMPORT` summary (`entity: holidays`). 409 `DUPLICATE_HOLIDAY` if someone added one of them meanwhile |

**API Integrations** — `/admin/integrations` 🔐 (Admin › API Integrations, Calendar Phase 2 P2-1;
`backend-crm/src/modules/integrations/integration.routes.ts`, route header comment = source of truth). Admin roles
only. Secrets are **write-only**: no response carries one (`secret: { set, readable, last4, updatedAt, updatedBy,
expiresOn, expiresSoon }`).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | `{ ready: { ok, reason: key_missing\|public_url_missing\|null }, keyStatus: ok\|missing\|unreadable, activeKeyId, publicApiUrl, publicApiUrlConfigured, webhooksActive, worker: { lastSeenAt }\|null, providers: ProviderAdminDto[], settings: CalendarSyncSettings, syncTypes: [{ value, label, calendarSync, locked, lockReason? }] }`; `Cache-Control: no-store`. `ProviderAdminDto`: `{ provider: google\|microsoft\|zoom, label, kind: calendar\|video, available, enabled, configured, clientId, secret, webhookSecret (zoom) \| null, settings, redirectUri, webhookUrls, lastTest: { at, ok, message }\|null, clientVersion, counts: { active, reauth, error }, updatedAt, updatedBy }` |
| PUT | `/providers/:provider` | `{ enabled?, clientId?, clientSecret? (≥ 8 chars; omitted = keep), webhookSecret? (zoom), clientSecretExpiresOn? (YYYY-MM-DD \| null; microsoft, zoom), settings? (google `{ scopeProfile: narrow\|broad, pkce }`, microsoft `{ tenantId }` = GUID or tenant domain) }` → `ProviderAdminDto`. Enabling needs a client id + readable secret: 409 `INTEGRATION_NOT_CONFIGURED`; enabling Microsoft without a tenant: 400 `VALIDATION_ERROR` on `settings.tenantId`; Zoom can't be enabled before Phase 3: 409 `INTEGRATION_NOT_AVAILABLE`; a secret without a key: 503 `INTEGRATIONS_NOT_READY`. A changed client id or tenant bumps `clientVersion`; changed credentials clear `lastTest`; a new secret clears its expiry unless one is sent. Audited `IntegrationProvider` CREATE / UPDATE with `secretChanged: true` instead of the secret |
| DELETE | `/providers/:provider/secret` | → `ProviderAdminDto`: secrets removed, provider switched off (audited `secretCleared`) |
| POST | `/providers/:provider/test` | → `{ ok, code, message, testedAt }` with the **saved** credentials (no user involved): Google = a dummy code exchange (`invalid_grant` means the client is accepted), Microsoft = a client-credentials token request (AADSTS codes mapped). `code`: `credentials_ok`, `invalid_client`, `redirect_uri_mismatch`, `secret_expired`, `app_not_in_tenant`, `tenant_not_found`, `not_configured`, `not_available` (zoom), `network`, `provider_error`, `credentials_changed` (the credentials were saved or removed while the probe ran: the result is not stored, test again). Saved as `lastTest` only while the tested client id / secret / `clientVersion` are still the saved ones. 6 / min per admin (§3) |
| PUT | `/settings` | Partial `{ companyDomains (1–10), followUpReminder (activity reminder label \| null), backfillDays: 30\|60\|90, eventVisibility: private\|default, followUpActivities, allowMeetingImport, importFollowupType }` → the whole settings. Stored as the module setting `activities/calendarSync` through Form Customization (validated, audited `ModuleSetting UPDATE`, form-config cache dropped) |
| PUT | `/sync-types` | `{ "<Followup Type>": boolean }` → `syncTypes`. Option meta `calendarSync` on `shared_followup_type` (missing = on); Task / Note refused (400). Audited as option updates |
| GET | `/people` | `?search&issue=any\|missing\|duplicate\|not_company` → active, non-group users `[{ username, fullName, department, role, email, emailIssue: missing\|duplicate\|not_company\|null, connection: { id, provider, status: active\|reauth_required\|error, statusReason, accountEmail, connectedAt, accessEndsAt } \| null }]` (the live calendar connection, never a token; as of 2026-11-26, P2-2) |
| PUT | `/people/:username/email` | `{ email (required; `''` or `null` clears), allowOtherDomain? }` → the person row; a body without `email` is 400 `VALIDATION_ERROR`. `modules/users/userEmail.service.ts` (also used by Admin › Users): trimmed and lower-cased; unique among active non-group users (409 `DUPLICATE_RECORD` on `email`, naming the holder); a company domain unless `allowOtherDomain` (400 on `email`); audited `User UPDATE`; drops `cache:lookups:users*`. 409 `EMAIL_CONNECTED` while the person has a live calendar connection on another address (or the email is being cleared): disconnect it first (P2-2; the write takes the user's `calendar-connection:user:<username>` lock, the one the connect takes, also when clearing) |
| GET | `/connections` | `?provider=google\|microsoft\|fake&status=live (default: active + reauth_required + error)\|all\|active\|reauth_required\|error\|disconnected&search` (unknown values fall back to the default) → `AdminConnectionDto[]` (≤ 1,000): `{ id, username, fullName, provider, kind, accountEmail, status, statusReason, connectedAt, disconnectedAt, disconnectedBy, lastPulledAt, lastPushedAt, lastErrorCode, consecutiveFailures, pendingPushes (0 until P2-3), failedPushes (0), accessEndsAt, webhook: null (until P2-7) }`. Never a token, cursor or lease (as of 2026-11-26, P2-2) |
| POST | `/connections/:id/disconnect` | `{ reason? (≤ 200, any other key → 400) }` → 204. Same as the employee's own disconnect (tokens dropped, Google grant revoked after commit) with `disconnectedBy` = the admin, `statusReason` `by_admin`, audited `CalendarConnection DISCONNECT` with the note. Already disconnected → 204, nothing changes; unknown id → 404 |

**Users** — `/admin/users` 🔐 (Admin › Users, Profile Phase 2; `backend-crm/src/modules/user-admin/userAdmin.routes.ts`,
route header comment = source of truth). Admin roles only (`FORM_CONFIG_ADMIN_ROLES`). Bodies are strict (an unknown
key is `400 VALIDATION_ERROR`). Every write is audited as the acting admin (entity `User`, id = the user's id): `CREATE`
(a snapshot without any password or hash), `UPDATE` (diff), `STATUS_CHANGE` (`isActive`), `PASSWORD_RESET` (SECURITY,
NOTICE: `{ passwordChangeRequired: true, generated }`, never a password); writes drop `cache:lookups:users*`
(`invalidateUserCaches`) and take the per-user lock `user:id:<id>` (shared with My Profile; the People screen's email
write, `PUT /admin/integrations/people/:username/email`, doesn't take it, so `PATCH` writes only the columns that
change and never writes back a column it left alone). Access stays decided by
the role's **name** (`modules/user-admin/roles.ts` reads `FORM_CONFIG_ADMIN_ROLES` and `GLOBAL_ACCESS_ROLES`; mirrored
and contract-tested by `frontend-crm/src/utils/roleAccess.ts`). A typed role or department that matches an existing one
(role: by `normalizeRole`, any case / dash / spacing; department: any case) is stored with the existing spelling.
Temporary passwords: 12 letters and digits (no look-alikes), returned **once** (`Cache-Control: no-store`), never
logged or audited.

`AdminUserDto`: `{ id, username, fullName, firstName, lastName, email, role, roleAccess: admin\|all-records\|own-records
(admin panel first, then "sees all records"), department, jobTitle, reportsTo: { id, name, isActive } \| null,
directReportsCount (active), mobile, officePhone, photoUrl, isActive, isGroupUser, onLeave, outOfOffice: { from, to,
message } \| null, mustChangePassword, lastLoginAt, passwordChangedAt, createdAt, createdBy, deactivatedAt, emailIssue:
missing\|duplicate\|not_company\|null }` (`emailIssue` as on the People table, only for active non-group users; `null` for
the others; `outOfOffice` is set by the user in My Profile, read-only here, `null` when unset or ended).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | `?search&status=active\|inactive\|all (default active)&role&department&page&pageSize (≤ 100, default 25)` → `{ success, data: AdminUserDto[], meta: { total, page, pageSize } }`, by `fullName`, `username`. `search` looks in name, username, email, job title, department and role; `role` / `department` are exact (case-insensitive). Bad values fall back to the defaults |
| GET | `/meta` | `{ roles: [{ name, access, adminPanel, allRecords, userCount, inactiveUserCount }], departments: [{ name, userCount }], managers: [{ id, name, username, photoUrl }], companyDomains }`. Roles = every stored role (grouped case-insensitively, most-used spelling) plus the admin and global-access roles nobody holds yet; departments = every stored one; `userCount` counts active users, `inactiveUserCount` (roles only) inactive ones (the list's Role filter offers the roles held in the chosen status). `managers` = active non-group users. `adminPanel` / `allRecords` are separate because "Administrator" and "Super Admin" open the admin panel but see only their own records |
| GET | `/:id` | `AdminUserDto`; `404` "User not found." |
| POST | `/` | `{ username, firstName, lastName?, email?, allowOtherDomain?, role, department?, jobTitle?, reportsToId?, mobile?, officePhone?, isGroupUser?, password? }` → `201 { user: AdminUserDto, temporaryPassword: string \| null }`. `username` trimmed and lower-cased, 3–50, `^[a-z0-9][a-z0-9._-]*$`, not a reserved name (`system`, the actor background jobs and seeds write) (`modules/user-admin/username.ts`, contract-tested with `frontend-crm/src/utils/username.ts`), unique case-insensitively (`409 DUPLICATE_RECORD` on `username`), never changes afterwards. Names / phones as My Profile (`formatPersonName`, E.164, "First and last name together cannot exceed 99 characters."). `role` ≤ 50 (required), `department` ≤ 50, `jobTitle` ≤ 100 (inner spaces collapsed). Email: the company email rule (`users/userEmail.service.ts`): company domain unless `allowOtherDomain` (400 on `email`), unique among active non-group users (409 on `email`). `password` omitted → a temporary one is generated and returned; typed → the password rules with the username (`400 WEAK_PASSWORD` on `password`). The user is active with `mustChangePassword: true`, `createdBy` = the admin |
| PATCH | `/:id` | `{ firstName?, lastName?, email?, allowOtherDomain?, role?, department?, jobTitle?, reportsToId?, mobile?, officePhone?, isGroupUser?, onLeave? }` → `AdminUserDto` (keys left out stay; `''` / `null` clears an optional one; no change → no audit entry). `reportsToId`: an existing, active, non-group user, not the user, not anyone below them (chain walked up to 50 levels) → else `400 INVALID_MANAGER` on `reportsToId`; an unchanged manager is kept even if inactive. Taking admin access away: `400 SELF_LOCKOUT` (your own) / `400 LAST_ADMIN` (the only active admin), on `role`. A changed email (or a group login becoming a normal user) goes through the email rule; a changed email of a user with a live calendar connection on another address is `409 EMAIL_CONNECTED` on `email` (disconnect the calendar first; Calendar P2-2, as of 2026-11-26). A **role change signs the user out** of every tracked session (their token carries the role) and the answer adds `signedOutSessions` (`null` when Redis is down); the acting admin's own sessions are left alone (their new role applies at next sign-in) |
| POST | `/:id/deactivate` | → `AdminUserDto & { signedOutSessions }`: `isActive = false`, `deactivatedAt` = now, every tracked session revoked (`null` when Redis is down). Records, username and direct reports stay (their `reportsTo.isActive` turns false). `400 SELF_LOCKOUT` (your own account) / `400 LAST_ADMIN`. Already inactive: no change, no audit entry, but the sessions are revoked again (the UI's **Sign out all sessions** for an inactive user, to retry a revocation that failed while Redis was down) |
| POST | `/:id/activate` | → `AdminUserDto & { signedOutSessions: null }`: `isActive = true`, `deactivatedAt = null`. `409 DUPLICATE_RECORD` on `email` when another active non-group user took the address meanwhile. Already active: no change |
| POST | `/:id/reset-password` | `{ password? }` → `{ temporaryPassword: string \| null, signedOutSessions }`: new hash (typed password checked with the rules and the username, else generated), `mustChangePassword = true` (`passwordChangedAt` unchanged), every tracked session revoked. `400 BAD_REQUEST` for your own account ("Change your own password from My Profile › Security."); `400 WEAK_PASSWORD` on `password`; 20 / 10 min per admin (§3) |

**Calendar connections** — `/calendar-connections` (any signed-in user, own rows only; Calendar Phase 2 P2-2, as of
2026-11-26; `backend-crm/src/modules/calendar-sync/connection.routes.ts`, route header comment = source of truth).
OAuth authorization code + PKCE (S256) + `state` + `nonce`; tokens are sealed in `CalendarConnection` and **never**
leave the server or reach a log. Providers stay off until an admin switches one on (the `fake` provider exists only with
`CALENDAR_FAKE_PROVIDER=true` outside production). One calendar per person.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | `{ ready, providers: [{ provider: google\|microsoft\|fake, label, kind: 'calendar', available, canRevoke }], connections: OwnConnectionDto[], email, publicApiUrl, webhooksActive: false, syncHours: null (P2-5), syncActive: false (P2-3) }`; `Cache-Control: no-store`. A provider that is not available is left out unless the user is connected with it. `OwnConnectionDto`: `{ id, provider, kind, accountEmail, status: active\|reauth_required\|error, statusReason, connectedAt, lastPulledAt, lastPushedAt, backfilledAt, backfillCount, importMeetings, importAllowed: false, pendingPushes: 0, failedPushes: 0, accessEndsAt }` (live rows only) |
| POST | `/:provider/start` | → `{ authUrl }` and the sealed httpOnly cookie `crm_oauth` (AES-GCM, AAD `oauth:<provider>:<userId>`, 10 min, `SameSite=Lax`, path `/api/calendar-connections/oauth`; holds state, PKCE verifier, nonce and the CRM origin to return to). `503 INTEGRATIONS_NOT_READY` (no key / no `PUBLIC_API_URL`); `409 PROVIDER_DISABLED`; `409 CALENDAR_ALREADY_CONNECTED` (another provider is live: disconnect it first; reconnecting the same provider is allowed); `403 FORBIDDEN` for a group / shared or inactive login; `400` the fake provider without a company email; 10 / min per user (§3) |
| GET | `/oauth/:provider/callback` | The provider's redirect (not behind `authenticate`; it reads the session cookie itself). Always a **302** to My Profile › Connected accounts: `<origin>/profile?tab=connected-accounts&calendar=connected&provider=<key>` or `…&calendar=error&reason=<code>&provider=<key>` (the old `/connected-calendars` page only redirects there, keeping its query), where `<origin>` is the CRM origin that started the flow (from the cookie, checked with `isAppOrigin`, else `APP_PUBLIC_URL`); no session, or one that must change its password first (the `mcp` claim) → `APP_PUBLIC_URL/login?next=%2Fprofile%3Ftab%3Dconnected-accounts` (start answers such a token `403 PASSWORD_CHANGE_REQUIRED`, like every route outside the allow-list). `reason` is a fixed code: `denied`, `expired` (no / old / other user's cookie), `invalid` (state, id_token or account checks), `scope_denied`, `email_mismatch`, `email_too_long`, `domain_not_allowed` (not a company Google Workspace `hd` / another Entra tenant), `account_in_use` (that account is connected for another CRM user), `provider_error`, `not_configured`, `already_connected`, `server_error`. Clears `crm_oauth`; `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. On a refusal the new grant is revoked at Google unless it is live for someone. An empty CRM email is filled from the verified company account (audited `User UPDATE`; `cache:lookups:users*` dropped after commit, as every email write does). Audited `CalendarConnection CONNECT` `{ provider, accountEmail, by, reconnected?, emailFilled?, replaced? }` |
| POST | `/:id/disconnect` | → 204 (own connection; another user's id → 404; already disconnected → 204). Tokens dropped, `status = disconnected`, `statusReason = by_user`; the Google grant is revoked after commit (5 s, never fails the request; Microsoft has no per-app revoke: remove the app at myapps.microsoft.com). Events already in the calendar stay. Audited `CalendarConnection DISCONNECT` |

Planned: `POST /sync` (P2-5), `PATCH /:id { importMeetings }` (P2-8).

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
| GET | `/users?from&to` | Users tab: `{ from, to, users: [{ username, name, role, department, email, status, onLeave, isGroupUser, photoUrl, lastLoginAt, lastLogin, lastActivityAt, lastActivity, lastActivityLabel, total, data, config, security, signIns, failedSignIns }] }`. Every user in the user list (inactive ones too; group accounts only once they have entries), `system` (background jobs) once it has entries, and any other username with entries in the range (`status`: `active` / `inactive` / `system` / `unknown`). `total` / `data` / `config` / `security` / `signIns` / `failedSignIns` count the range (default the last 30 days, max 366); `lastActivity*` is the user's newest entry any time (`lastActivityLabel` e.g. `Updated · Leads`), `lastLogin*` the user's last successful sign-in; `lastLogin` / `lastActivity` in the business timezone; `photoUrl` is `/api/user-photos/<id>` or null (always null for `system` / `unknown`). Most active first. A user's own entries are `GET /?user=<username>`; their report is `POST /exports` with that filter |
| GET | `/stats?from&to` | Summary strip: `{ from, to, today, failedSignIns24h, accessDenied24h, deletes7d, total, mostActiveUsers: [{ username, label, count }] (top 5, jobs left out), eventsPerDay: [{ date, total, data, config, security }] }`. `today` / `24h` / `7d` are fixed windows; the rest follow the range (default the last 30 days, max 366); every day of the range is listed, empty ones as 0 |
| GET | `/:id` | `{ entry, changes, fields, details, related, relatedCount }`: `entry` = list item plus `sessionId`, `httpMethod`, `route`, `userAgent`; `changes` = the stored JSON; `fields` = `[{ key, label, before, after }]` labelled from the form configuration (custom fields included; `before` null for a create, `after` null for a delete); `details` = `[{ key, label, value }]` for everything else the entry recorded (sign-in IP, refused path, import counts, reason, follow-up); `related` = the first 100 other entries of the same request (`relatedCount` = all of them; filter `requestId` for the rest); `actions` = `{ undo, restore }`, each `{ available, reason? }` or null when the entry doesn't offer it; `reversedBy` / `reverses` = the REVERT / RESTORE entry that undid this one, or the entry this one undid (list items, or null). 404 when there's no such entry |
| GET | `/:id/undo` | Undo preview of an UPDATE / STATUS_CHANGE of a CRM record (the 11 record modules: leads, contacts, organizations, opportunities, quotations, products, tickets, contracts, activities, partner companies, referrals): `{ id, canUndo, fields: [{ key, label, from, to, current, status }] }` (values as shown on screen). `status`: `ready` (still holds the entry's `to`, can be put back), `conflict` (changed again since), `already` (already holds the earlier value), `blocked` (not editable through the record's update, e.g. a system field). 409 `NOT_UNDOABLE` (any other entry, incl. CONVERT, IMPORT and Form Customization) or `ALREADY_REVERSED`; 404 when the record is deleted or gone |
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
| Change password (`ratelimit:change-password`) | 10 / 15 min (every request) | user | 429 "Too many password attempts. Please wait a few minutes." |
| Sign out sessions (`ratelimit:session-revoke`, both `DELETE /me/sessions` routes) | 30 / 10 min | user | 429 |
| Calendar connect start (`ratelimit:calendar-connect`) | 10 / 60 s | user | 429 "Too many connect attempts. Wait a minute and try again." |
| Admin password reset (`ratelimit:admin-password-reset`) | 20 / 10 min (every request) | admin | 429 "Too many password resets. Please wait a few minutes." |
| Integration connection test | 6 / 60 s | admin | 429 `RATE_LIMITED` + `Retry-After` (in-memory per process whenever Redis can't count it: down, or a command failing while it reports ready; this one never fails open) |

Limited responses carry `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. All limits except the integration connection test fail open when Redis is down.

## 4. Error codes

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Zod failure; `errors[].path` points at the form field |
| 400 | `INVALID_JSON`, `BAD_REQUEST`, `VALUE_TOO_LONG` | Malformed body / oversized value |
| 400 | `WRONG_PASSWORD` | Change password: the current password is wrong (`errors[].path` `currentPassword`) |
| 400 | `WEAK_PASSWORD` | Change password: the new password breaks a password rule (`errors[].path` `newPassword`, message = the rule) |
| 400 | `INVALID_IMAGE`, `IMAGE_TOO_LARGE` | Profile photo: not a PNG / JPEG / WebP image; over 512 KB |
| 400 | `CURRENT_SESSION` | My Profile: signing out the request's own session from the sessions list (use Sign out) |
| 400 | `WEAK_PASSWORD` (`password`) | Admin › Users: a typed initial / reset password breaks a password rule |
| 400 | `INVALID_MANAGER` | Admin › Users: "Reports to" is the user, someone below them, missing, inactive or a group login (`errors[].path` `reportsToId`) |
| 400 | `SELF_LOCKOUT` | Admin › Users: an admin removing their own admin role or deactivating themselves |
| 400 | `LAST_ADMIN` | Admin › Users: demoting or deactivating the only active admin-role user |
| 401 | (none) / `INVALID_CREDENTIALS` | Missing, invalid, expired or revoked session; wrong password |
| 403 | `ACCOUNT_INACTIVE` / (none) | Deactivated user; role or row-level access denied |
| 403 | `PASSWORD_CHANGE_REQUIRED` | The token carries `mcp` (must change password) and the route isn't on the allow-list (§2.1): "Change your password to continue." |
| 404 | `NOT_FOUND` | Missing or soft-deleted record; unknown route |
| 409 | `DUPLICATE_RECORD` | Unique violation (organization name, codes, partner name, a user's username or email …) |
| 409 | `WRITE_CONFLICT` | Concurrent write after retries were exhausted |
| 409 | `RELATED_RECORD_CONSTRAINT` | FK violation |
| 409 | `VERSION_CONFLICT` | Stale PDF template version |
| 409 | `CITY_IN_USE` | Deleting a city still used by records |
| 409 | `DUPLICATE_HOLIDAY` | Holidays: that occasion is already a holiday on that date |
| 409 | `INTEGRATION_NOT_CONFIGURED` | API Integrations: enabling a provider without a client id or a readable secret (Microsoft without a tenant is 400 `VALIDATION_ERROR` on `settings.tenantId`) |
| 409 | `INTEGRATION_NOT_AVAILABLE` | API Integrations: Zoom before video meetings ship (Phase 3) |
| 409 | `PROVIDER_DISABLED` | Calendar connect: the provider is switched off or not configured |
| 409 | `CALENDAR_ALREADY_CONNECTED` | Calendar connect: another calendar provider is connected (one per person) |
| 409 | `EMAIL_CONNECTED` | Company email change / clear while the person has a live calendar connection on another address |
| 409 | `NOT_UNDOABLE`, `NOT_RESTORABLE`, `ALREADY_REVERSED` | Audit log: the entry can't be undone / restored, or was already |
| 410 | `EXPORT_EXPIRED` | Audit log export older than 24 h |
| 413 | – | Body over its limit |
| 429 | `RATE_LIMITED` | See §3 |
| 503 | `SERVER_BUSY` | Lock timeout / DB couldn't start a transaction (`Retry-After: 2`) |
| 503 | `INTEGRATIONS_NOT_READY` | API Integrations: storing a secret while `INTEGRATIONS_ENCRYPTION_KEY` is not set; calendar connect without the key or `PUBLIC_API_URL` |
| 503 | `IMPORT_QUEUE_UNAVAILABLE` | Large import or status poll without Redis |
| 503 | `SESSIONS_UNAVAILABLE` | Signing out one session while Redis is down |
| 503 | `PDF_RENDERER_UNAVAILABLE`, `SHUTTING_DOWN` | Chromium can't start; server stopping |
| 500 | – | Unhandled; message hidden in production |

## 5. Frontend integration

- `frontend-crm/src/services/<entity>.service.ts` builds each client with `createCrudService('/<endpoint>')`, which
  gives `list`, `getAll` (walks pages of 100, capped at 10,000 rows), `getById`, `create`, `update`, `delete`,
  `deleteBulk`. Every write calls `notifyCrmUpdate(endpoint)` for cross-tab cache invalidation.
- React Query hooks in `hooks/queries/` wrap those services; query keys in `queryKeys.ts`.
- DTO types live in `frontend-crm/src/types/*.types.ts`; the backend mappers must return exactly those shapes.
- Admin › Users is not a `createCrudService` module (the list answers `{ data, meta }`); its constants the forms check
  live in `utils/username.ts` and `utils/roleAccess.ts`, contract-tested against `modules/user-admin/username.ts` and
  `roles.ts` (`backend-crm/src/validators/contractSync.test.ts`). The frontend handles `403 PASSWORD_CHANGE_REQUIRED`
  from any call by sending the user to My Profile › Security.
- My Profile is not a CRUD module: `services/profile.service.ts` (profile, photo, sessions, preferences) and
  `auth.service.ts` `changePassword`, hooks in `hooks/queries/useProfile.ts`, types in `types/profile.types.ts`; the
  password rules in `utils/passwordPolicy.ts` and the out-of-office rules in `utils/notificationPreferences.ts` are
  contract-tested against the API's copies.
- Notifications are not a CRUD module: `services/notification.service.ts` (list, unread count, read, read all,
  morning summary preview / test), hooks in `hooks/queries/useNotifications.ts`, `CrmNotification` and the preview
  types in `types/notification.types.ts`. Read / read all broadcast `notifyCrmUpdate('/api/notifications')`.
- Calendar connections are self-contained in `components/integrations/` (as of 2026-11-26, P2-2):
  `calendarConnections.service.ts`, `useCalendarConnections.ts` (query key `calendarConnections`),
  `calendarConnections.types.ts` (contract-tested against the API constants), `CalendarConnectionsCard.tsx` and
  `CalendarReconnectAlert.tsx`, so the card can move into My Profile unchanged. Disconnect broadcasts
  `notifyCrmUpdate('/api/calendar-connections')`; QueryProvider also refreshes the `integrations` keys on it (and the
  `calendarConnections` keys on admin integration writes).

## 6. Adding an endpoint — checklist

1. Zod schema in `<module>.validator.ts` (mirror the frontend schema in `frontend-crm/src/validations`).
2. Service function: use `runInTransaction`; lock existing records with `lockRecords`; check scope with
   `assertRecordAccess`; write `auditService.record(tx, …)` in the same transaction; call
   `cacheService.invalidateEntityCaches` after commit. Cache a read of data that writes invalidate with
   `cacheService.getOrSetGuarded`, not `getOrSet` ([system design §4.2](system-design.md#42-cache-invalidation)).
3. Route: `authenticate` (router-level), `requireRole(...FORM_CONFIG_ADMIN_ROLES)` for admin features,
   `validateRequest({ params, query, body })`. Register custom paths **before** `registerCrudRoutes` so `/:id` doesn't
   capture them.
4. Frontend service method + React Query hook + `notifyCrmUpdate` on writes.
5. Update the route file's header comment and this document.

## 7. Planned / missing endpoints

| Endpoint | Purpose | Notes |
| --- | --- | --- |
| `GET /dashboard/*` | KPI aggregates (pipeline value by stage, follow-ups due, open tickets, conversion rate) | Use the reserved `cache:dashboard:*` namespace, already invalidated on every entity write; read it with `cacheService.getOrSetGuarded` |
| `GET /opportunities/:id/pdf` etc. | PDFs for other modules | Follow the README "Adding a module" steps |
| Export (`GET /<entity>/export`) | CSV/XLSX export of a filtered list | Stream; respect row-level scope |
