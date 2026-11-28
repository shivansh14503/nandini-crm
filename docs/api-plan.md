# Nandini CRM — API Plan

> **Status:** living document. Lists every endpoint of `backend-crm` as of 2026-11-27 (Products: `GET /products/manufacturers`, `category` → `productCategory`, no `taxType`, new manufacturers join the Manufacturer dropdown; Referrals: Company Name replaces Organization Name; through Calendar Phase 2 P2-2b, admin-managed calendar
> connections: `/api/calendar-connections` is read-only own status, the per-user OAuth routes and the admin connection
> routes are gone, People gained the calendar routes; P2-4: lead / opportunity follow-ups create activities
> (`origin`, `lockedFields`, `409 FOLLOW_UP_ACTIVITY_LOCKED`, the follow-up side effects of lead / opportunity saves); P2-3b: `ActivityView.calendar`, the
> `calendar_sync_error` / `calendar_invites_held` / `integration_secret_expiring` notifications, the calendar worker's heartbeat; P2-3c: the activity calendar actions (`/calendar-sync/retry`, `/calendar-sync/send-invites`), `CalendarItem.syncState`, own calendar `backfill`, admin `workerStatus` / `syncEnabled`; P2-1: `/api/admin/integrations`, Admin › API
> Integrations; Profile Phase 1: `/api/me` (My Profile), `/api/user-photos` and `POST /api/auth/change-password`; and
> Profile Phase 2: `/api/admin/users` (Admin › Users) with the must-change-password claim; Profile Phase 3:
> `/api/me/preferences` (My Profile › Notifications); Profile Phase 5: `/api/company-formats` (Admin › Company formats), with PR5b's audit field values in the company formats; P2-6: `GET /api/activities/busy`, colleagues' busy times; Calendar Phase 4: booking links, `/api/booking-links` and the public
> `/api/public/booking`; P2-5: calendar changes come back (`POST /api/calendar-connections/sync`, admin
> `POST /api/admin/integrations/people/:username/calendar/sync`, own calendar `syncHours`); P2-7: calendar webhooks `/api/webhooks/*` and the admin webhook status fields; P2-8: customer meetings from the calendar, replies both ways, `EXTERNAL_EVENT_LOCKED`, the per-person `importMeetings`; Calendar Phase 3 P3-1: video meetings, `videoMeeting` on activity writes, `GET /api/activities/video-options`, `POST /api/activities/:id/conference/retry`; Calendar Phase 4: recurring activities, `repeat` on activity writes, `?scope=this|following|all`,
> `ActivityView.series`, `CalendarItem.seriesId`; P2-8 merged with P3-1 and recurring activities (`videoMeeting` locked on meetings organized outside the CRM, imported meetings never repeat); Calendar Phase 4
> email logging: `/api/email-logs` and `/api/admin/email-logging`; booking links' default video meeting: `videoMeeting` on
> `/api/booking-links`, `videoMeeting` / `video` on the public booking page, as of 2026-11-27)
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
| Auth | httpOnly cookie `token` (JWT) set by login; `Authorization: Bearer <jwt>` also accepted. All routes except `/auth/login`, `/auth/logout`, `/health`, the public booking page (`/public/booking`) and the calendar webhooks (`/webhooks/*`, P2-7: no session, no CSRF, but **signature-verified**, §2.8) require it |
| Roles | 🔐 = roles with the admin panel only (Admin › Roles). Each module route needs the role's permission for its action, and at **Own** data is row-scoped to the records the user is assigned to or created; a "global role" below means a role at **All** for that action (see §2.7 Roles and [system design §3.6](system-design.md#36-security-model)) |
| Body limits | 1 MB default; `/webhooks/microsoft/*` 256 KB JSON, `/webhooks/google/calendar` 16 KB (no body read); `/import` 10 MB; `/files` 15 MB (10 MB files as base64); `/pdf-templates`, `/pdf-assets`, `/pdf-saved-items` 2 MB |
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

### 1.1a Long text

Long text fields (descriptions, remarks, notes, terms, reasons, line item Description / Note, ticket case notes,
admin-added Long Text fields) take **any length**: no `400` for length, NVARCHAR(MAX) columns. The 1 MB JSON body
limit is the only cap. Other text fields keep their `FIELD_MAX_LENGTH` limits.

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
| POST | `/auth/login` | – | `{ username, password }` → `{ status: 'ok', message, user }` + sets cookie. `user` has the same shape as `/auth/me`; the JWT is `{ id, username, role, tracked, jti }`. A user who hasn't set a password from their invite link yet (`Users.invitePending`) gets `403 INVITE_PENDING` "Your account isn’t set up yet. Use the link in your invite email to set your password, or ask your administrator to send a new invite." (only after a correct password; audited as `LOGIN_FAILED`). The user row is read again after the session is recorded, so a deactivation that commits during the sign-in still applies (`403 ACCOUNT_INACTIVE` / `401 INVALID_CREDENTIALS`, the new session deleted). Tokens that still carry the retired `mcp` claim (temporary-password sessions) are refused (`401`). 429 after `LOGIN_RATE_LIMIT_MAX` failures per IP per window. **Account lockout**: 5 wrong passwords in a row (within 15 min of each other) lock the account for 15 min (`auth/accountLockout.ts`, `DEFAULT_LOCKOUT_POLICY`); the fifth and every attempt while locked answer `423 ACCOUNT_LOCKED` "Too many wrong passwords. This account is locked for N more minutes. Try again later, use “Forgot password?” to choose a new one, or ask your administrator to unlock it." (the password isn't checked while locked). The lock is audited `ACCOUNT_LOCKED`; a successful sign-in resets the count |
| POST | `/auth/logout` | – | Revokes the Redis session (if tracked), clears cookie → `{ status: 'ok', message }` |
| GET | `/auth/me` | ✔ | `{ status: 'ok', user: { id, username, role, fullName, firstName, lastName, photoUrl, access } }`, with `access` = `{ adminPanel, superAdmin, permissions, teammates }`: what the role allows (Admin › Roles; `permissions` = `{ <module>: { <action>: all\|group\|own\|none } }`, see §2.7 Roles; `teammates` = the usernames a Group level covers, Admin › Security Groups, the user included). The app hides what it doesn't allow; the API enforces the same rules. Read read from the database (not the JWT) so a name or photo change shows at once; `photoUrl` is `/api/user-photos/<id>` or `null`. `firstName` / `lastName` are split from `fullName` when the stored parts are missing or out of date (users created or renamed outside the app). `401` when the account no longer exists; when the database can't answer, `200` with the token's `{ id, username, role }`, that role's `access` and `fullName: ''`, `firstName` / `lastName` / `photoUrl` `null` (a database outage never signs the user out) |
| POST | `/auth/change-password` | ✔ | `{ currentPassword, newPassword }` (strings, ≤ 128, both required) → `{ success, data: { passwordChangedAt, signedOutSessions }, message }`; `signedOutSessions` is `null` when the other sessions could not be signed out (Redis down or failing; the password is still changed, and the UI asks the user to sign them out from My Profile). Checks the current password (bcrypt or a legacy plain-text row), then the password rules (`modules/auth/passwordPolicy.ts`: 8–128 characters, a letter and a digit, not the username in any case, not the current password), stores the bcrypt hash and `passwordChangedAt` under the per-user lock `user:id:<id>` (the stored hash is re-checked inside it, so two concurrent changes from the same old password can't both succeed: the second gets `WRONG_PASSWORD`), audits `PASSWORD_CHANGE` (only the timestamp), then signs out every **other** session of the user (this one stays). `403 ACCOUNT_INACTIVE` for a deactivated user whose session is still valid (nothing is changed); `400 WRONG_PASSWORD` "Current password is incorrect." (path `currentPassword`); `400 WEAK_PASSWORD` with the rule's message (path `newPassword`); 429 after 10 requests per 15 min per user ("Too many password attempts. Please wait a few minutes.") |
| POST | `/auth/invite/verify` | – | `{ token }` → `{ success, data: { username, name, purpose: 'invite' \| 'reset', expiresAt } }`: checks an emailed set-password link without using it (`name` = the first name, or the full name / username). `400 INVALID_INVITE` "This link is no longer valid. It may have expired or already been used. Request a new one with “Forgot password?” on the sign-in page, or ask your administrator." for every bad link (malformed, unknown, expired, used, revoked, account deactivated): one answer, so it says nothing about which. `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. Shares the per-IP limit below |
| POST | `/auth/invite/accept` | – | `{ token, newPassword }` → `{ status: 'ok', message: 'Password set', user }` + sets cookie (as `/login`). Checks the password rules with the username (a reset link also refuses the current password), then in one transaction under `user:id:<id>`: burns the link (`usedAt`, a conditional update, so two tabs can't both use it), revokes the user's other outstanding links, stores the hash and `passwordChangedAt`, clears `invitePending` and any account lockout, audits `PASSWORD_SET` (`{ purpose }`, never the password). After commit every existing session of the user is revoked, a new session is opened, `lastLoginAt` set and `LOGIN` audited (`via: set_password_link`). `400 INVALID_INVITE` (as verify); `400 WEAK_PASSWORD` (path `newPassword`; the link keeps working). Both link routes: 30 requests / 15 min per IP, counted for every request (`ratelimit:set-password-link:ip:<ip>`; an in-process counter while Redis can't count, so never unlimited), `429 RATE_LIMITED` "Too many attempts. Please wait a few minutes and try again."; the token is compared as a SHA-256 hash in constant time and never logged |

The auth endpoints use the older `{ status: 'ok', … }` envelope rather than `{ success, data }`; the frontend's
`auth.service.ts` expects it. `change-password` and `invite/verify` are the exceptions: they are newer and use `{ success, data }`.
| POST | `/auth/forgot-password` | – | `{ identifier }` (username or work email, 1–120) → always `{ success, data: { message }, message }` "If an active account matches what you entered, we’ve emailed it a link to choose a new password. The link works once, within 72 hours." The answer goes out before the lookup, so it never reveals whether the account exists. An active account with a work email (found by username, or by an email held by exactly one active non-group user) is emailed a reset link (§ Set-password links; an Invited user gets the invite again), audited `INVITE_SENT` with `requestedBy: 'self'`. 5 requests / 15 min per IP (`429 RATE_LIMITED` "Too many reset requests. Please wait a few minutes and try again."); at most 3 self-service links per account per hour (further requests are dropped quietly). `Cache-Control: no-store` |

**Set-password links** (no temporary passwords). A user added in Admin › Users, or sent a password reset link, gets
an email with `${APP_PUBLIC_URL}/set-password?token=<43 base64url characters>` (256 random bits). Only the token's
SHA-256 is stored (`UserInvites`), with a 72-hour expiry, single use, and revoked by a newer link, an email change or a
deactivation. The page verifies it, asks for the new password twice (the app's rules), and `invite/accept` signs the
user in. Retired: the must-change-password gate, the `mcp` claim and `403 PASSWORD_CHANGE_REQUIRED`.

### 2.2 Sales & customer records

| Base | Type | Extra endpoints | List filters |
| --- | --- | --- | --- |
| `/leads` | CRUD | `GET /check-duplicates?mobile&emails&excludeId&excludeType` — informational matches in leads/contacts/organizations · `POST /:id/convert` — atomic conversion → `{ organization, contact, opportunity, organizationCreated, contactCreated }`; the new organization, contact and opportunity are assigned to the lead's own `assignedTo` (the body takes no Assigned To fields); `createOpportunity: false` (default `true`) converts without creating an opportunity — the opportunity fields are then ignored (not validated), `opportunity` is `null` and the lead's `convertedOpportunityId` stays empty; body also takes `extraFields: { contacts, organizations, opportunities }` (fieldKey → value) for the other fields an admin shows on Convert Lead (`isVisibleInConvert`; custom fields included, saved on the new records). Every field shown there is checked by its record's form rules, with Convert Lead's own "required" (`convertIsRequired`) where set (`400` with the convert form's field name, or `extraFields.<module>.<fieldKey>`, in `errors[].path`), except for a contact or organization that already exists and is linked as it is. A new organization with `customerType` Partner needs `natureOfPartner` (`400` on `natureOfPartner`); a new opportunity whose `opportunityLeadSource` is CA / Reference needs `referredBy` (+ `referredById`, an active referral; the lead's own unlinked legacy value is carried over as it is), and Partner needs `opportunityPartnerCompany` (`400` on that field). Leads: `referredBy` is required when `leadSource` is CA or Reference and must be an **Active referral** (`/referrals`): send `referredById` (the API stores the referral's name in `referredBy`), or a `referredBy` that names exactly one active referral (imports); a value typed before the Referrals module existed is accepted only unchanged, and a referral already on the record stays when it goes Inactive (`400` on `referredBy`: "Pick Referred By from the active Referrals." / "This referral is Inactive…" / "The selected referral no longer exists."). Also `partnerCompany` (a partner organization's name, stored uppercase) when it is Partner (`400` on that field; on `PATCH` only when `leadSource`, `referredBy` or `partnerCompany` is sent); `partnerCompany` is cleared for any other Lead Source. The lead import takes `referredBy` and `partnerCompany` columns under the same rule. `followupType` `Task` / `Note` (Activities-only Followup Types) is refused on create and when an update changes it (`400` on `followupType`: "Task and Note can only be used on Activities."; a lead already storing one keeps it); likewise on Convert Lead's new opportunity | `status`, `excludeStatus`, `leadType`, `rating` (Hot / Warm / Cold), `leadSource`, `organizationName`, `assignedTo`, `nextFollowupDate` |
| `/opportunities` | CRUD | – (line-item totals computed server-side; line items replaced only when sent; see **Line items** below; no `currency` or `groupName`). At least one filled line item is required on `POST` and on a `PATCH` that sends `lineItems` (`400` on `lineItems`, "At least one line item is required to save the opportunity."); a `PATCH` without `lineItems` (stage change, follow-up) still works on an opportunity with none. Convert Lead and opportunity imports create opportunities without line items (they have no product inputs). `tallySerialNo`, when given, must be exactly 9 digits starting with 7 (`400` with `errors[].path` `tallySerialNo`); a value saved before that rule is kept on `PATCH` until the field itself is sent. Documentation: `addDocument` must be `Yes` when `salesStage` is `PO`, and `Yes` needs `documentFile` (an uploaded `/files` id, or the `{ id, … }` object the API returns); `400` with `errors[].path` `addDocument` / `documentFile`. On `PATCH` these are checked when `salesStage`, `addDocument` or `documentFile` is sent. Commission: `commissionType` is not editable (a sent value is ignored; stored as `Self` up to 1,000 and `Other` above), and above 1,000 the payee's `accountName`, `accountNo`, `bankName`, `ifscCode` and `panNumber` are all required (`400` with one `errors[]` entry per empty field; on `PATCH` when a commission or bank field is sent). `documentNo`, `documentDate` and `documentFile` are kept only while `Yes`, and a Form Builder "required" on them applies only while `Yes` (likewise the commission and payee bank fields only while `commission` is `Yes`; `opportunityNotApplicableKeys`, also used by import and Convert Lead) (stored as the opportunity's `Document`, listed by `/documents`); responses carry `documentFile: { id, fileName, mimeType, sizeBytes, url } \| null`. Lead Source follow-up, as on leads: `referredBy` (+ `referredById`, an active referral, same rules) required for `leadSource` CA / Reference, `partnerCompany` for Partner (`400` on that field; on `PATCH` only when one of the three is sent; `partnerCompany` cleared for other sources). **Customer Response by Sales Stage** (`opportunity.followUp.ts`, Form Builder › Opportunities › Response Rules): a non-empty `customerResponse` sent with the save records a follow-up and must be an active option of the field's list that fits the `salesStage` (option meta `opportunityStages`; none = every open stage), else `400` on `customerResponse`; it then needs `nextFollowupDate` + `nextFollowupTime` later than now (`400` on that field), unless the option has `noFollowUp` (Do Not Contact: kept, follow-up cleared). `salesStage` Closed Won / Closed Lost stores no response and no follow-up (both cleared, also on a stage-only `PATCH`). A `PATCH` without a response keeps the stored one. `followupType` `Task` / `Note` refused as on leads | `salesStage`, `excludeSalesStage`, `organizationId`, `contactId`, `productId`, `assignedTo`, `minGrandTotal`, `nextFollowupDate` |
| `/quotations` | CRUD | Same line items as opportunities (see **Line items** below), at least one required (`400` on `lineItems`); `currency` is a quotation field (opportunities have none; a quotation made from an opportunity starts at `Indian Rupee: ₹`). `GET /:id/pdf?templateId&disposition=inline\|attachment` → `application/pdf` (30/min/user, Redis-cached). Creating a quotation advances the linked opportunity's stage | `status`, `quoteStage`, `opportunityId`, `organizationId`, `contactId`, `productId`, `assignedTo` |
| `/organizations` | CRUD | `GET /check-unique?organizationName&gstNumber&excludeId` → `{ exists, field?, accountCode?, message? }` · `PATCH /bulk-status` `{ ids, status: 'Active'\|'Inactive', inactivityReason? }`. `GET /:id` records a "recently viewed" entry. `natureOfPartner` is required when `customerType` is Partner (`400`, `errors[].path` `['natureOfPartner']`; on update only when the body sends `customerType` or `natureOfPartner`) and cleared for any other Customer Type. **Inactive lock:** `PUT` / `PATCH /:id` and `PATCH /bulk-status` on an organization whose saved `accountStatus` is `Inactive` need a role with the admin panel (Admin › Roles, always on for Super Admin), as the app's form and list do (`organization.lock.ts`): otherwise `403 FORBIDDEN` "This organization is inactive. Only an admin can edit it." (a bulk request touching one such row changes none). An active organization can still be set to Inactive by any role that may edit it, and an admin can reactivate one; `DELETE` follows the Delete permission alone | `accountStatus`, `customerType`, `natureOfBusiness`, `assignedTo`, `parentOrganizationId`, `recent` |
| `/contacts` | CRUD | – | `organizationId`, `assignedTo`, `isPrimaryContact` |

**Line items** (opportunities and quotations, Jira CRM-111; `modules/shared/lineItems.ts`). Each line is
`{ id?, productId?, productName, quantity, rate, discount?, discountType?, taxRate, description?, note? }`; responses add the computed
`grossAmount` (quantity × rate), `discountAmount` (gross × discount %, or the amount) and `taxableAmount` (gross − discount amount).
`productName` (Product), `quantity` (≥ 1), `rate` (> 0) and `taxRate` (GST, such as `18%`, an option of the
`product_tax_rate` dropdown) are required, `discount` (default 0) is a percentage 0–100 when `discountType` is `percentage` (the default) or an amount off the line, at most quantity × rate ("Discount cannot exceed the Gross Amount."), when it is `amount`; errors are `400` on
`lineItems.<n>.<field>`. A line with nothing entered is dropped. A product may be on only one line: the same
`productId`, or the same `productName` (ignoring case and end spaces) when either line has no `productId`, is `400` on
`lineItems.<n>.productName` ("<Product> is already on line <m>. Change the Quantity there instead of adding it again."),
also for a quotation made from an opportunity; records saved before this rule still load, and the check runs whenever
`lineItems` is sent. A product newly put on a line sets its `rate` from the
catalog MRP (when above 0) and its `taxRate` from the product's Tax Rate (when set); lines that already held the
product keep their saved values. Lines in the format before CRM-111 are still accepted: `amount` is read as `rate`, a
`discountType: 'direct'` (per unit) discount becomes an `amount` discount of per unit × quantity, `GST 18%` / `--None--` become `18%` / `0%`,
and derived values (`salePrice`, `taxAmount`, `total`, the three amounts above) are ignored. Summary Breakdown (Jira CRM-111): requests send
`lumpSumDiscount` (≥ 0, at most the Total Taxable Amount, else `400` on `lumpSumDiscount` "Lump Sum Discount cannot
exceed the Total Taxable Amount.") and `roundOff` (boolean, default `true`). Responses add, to the paisa: `totalAmount`
(Gross Amount), `totalDiscount`, `subtotal` (Total Taxable Amount), `actualBeforeTax` (subtotal − lump sum),
`totalTax` (GST over all rates), `gstType` (`IGST` | `CGST_SGST` | `null`, set by the API from the Company State and the
customer's shipping / billing state on every save; `null` = no Company State), `roundOff`, `roundOffAmount` (signed) and
`grandTotal` (actual + GST, rounded to the rupee while `roundOff`). Math in `docs/database-design.md` §4.6 "Summary
Breakdown". A quotation `POST` / `PATCH` that sends totals disagreeing with its lines is `400`.

### 2.2a Activities (calls, meetings, tasks, notes)

`/activities` — `backend-crm/src/modules/activities` (route header comment = source of truth). Unnumbered records,
not in global search, row-scoped by owner **and** attendance: a user sees activities they own (`assignedTo`), created
or are invited to as a colleague; only the owner, the creator or a global role may change or delete one (`403`
"Only the activity's owner can change it. Invitees can reply to the invitation."). Invitees reply with
`POST /:id/response`.

**Follow-up activities** (as of 2026-11-26, Calendar Phase 2 P2-4, `activity.followUp.ts`). Every open lead /
opportunity with a next follow-up has exactly one Planned activity with `origin: 'followup'`, related to it: type =
the record's Followup Type (blank / Task / Note → Call), subject `"<Type> follow-up: <code> <name>"`, owner = the
record's `assignedTo` (kept even when inactive), `createdBy` = the record's creator, the slot at the record's 12-hour
time in the business timezone for the type's default length (all-day when the time is blank), reminder = the company
"Reminder on follow-up activities". It is written by lead / opportunity saves (below), never by `POST /activities`, and
moves with its record. `ActivityDto.origin`: `crm` (made in the CRM), `followup`, `calendar` (P2-8).

**Meetings from the calendar** (as of 2026-11-26, Calendar Phase 2 P2-8, `calendar-sync/sync.import.ts`). While the company
switch `allowMeetingImport` and the person's admin-set `importMeetings` are on, the pull imports a customer meeting from
the person's calendar as an activity with `origin: 'calendar'` (type = `importFollowupType`, which must be a type
ticked under What goes to calendars; `createdBy` `calendar-sync`, audited `CREATE` with `changedBy` = the employee whose
calendar it is, route `job:calendar-sync:<provider>`): timed, single, not private, not declined, not longer than the sync's long-event limit, starting from 1 day back to 180 days ahead, with at least
one known contact's email. Owner = the organizer when they are a colleague (whose own pull imports it when they import meetings), else the
person whose calendar it is. A meeting a customer organized (`externalOrganizer: true`) carries `organizerEmail` / `organizerName` and is
locked in the CRM: `lockedFields` = `subject`, `startAt`, `endAt`, `allDay`, `location`, `attendees`, `assignedTo`,
`videoMeeting` (P3-1, as of 2026-11-27), and a write that changes any of them is `409 EXTERNAL_EVENT_LOCKED` ("Organized by
<email> in their calendar. Times, title, place, attendees and the video meeting can only be changed there."; a
`videoMeeting` change answers it before the P3-1 checks). Changing its type to Task or Note is `409 EXTERNAL_EVENT_LOCKED`
too (on `followupType`, "… It can't become a Task: that would drop the times, place and attendees the calendar owns.";
another type is fine; as of 2026-11-27). The organizer's `ready` Meet / Teams link is still shown:
`videoMeeting` / `conferenceJoinUrl` / `conference` (state `ready`, `canRetry: false`) come from the event, read only (never
on a Task / Note). A meeting the employee organized brings its own `ready` Meet / Teams link along at import (taken over
as on a pull, P3-1; as of 2026-11-27). The CRM never writes the description of a meeting brought in from the calendar
(origin `calendar`): it is the employee's own agenda / Teams block, so no push sends the description group and no
join-details push follows an adopted link (as of 2026-11-27, review fix). Such a meeting can't repeat (`repeat` → `400`, "Only activities made in the CRM can repeat.").
The related record, remarks, customer response, Completed and custom fields stay editable. Two colleagues on one
meeting share one activity (one `syncKey` = iCalUID), each with their own calendar link (the second is an `attendee`
link). Deleting an imported activity detaches the links and keeps `syncKey`, so it is never imported again; restoring an
activity (Admin › Audit Log; imported or CRM-made) re-attaches its detached invitation copies on live calendars, and
the next pull of each such calendar reads each copy back once, so a change or a cancellation made while it was in the
bin is applied (a gone copy cancels as usual). Re-activating a stopped connection row re-attaches its invitation copies
of live activities ending after yesterday the same way (as of 2026-11-27, review fix). If that read back fails, the
next pull tries again; meanwhile a new copy of the same meeting in this person's calendar (the meeting was made again,
e.g. on Microsoft after a restore) is held, not ignored: the pull keeps its cursor and its replay moves the link to the
new copy once the old one is read back as gone, so the person's reply still reaches the CRM (as of 2026-11-27, review fix). When the last invitation copy the CRM follows is cancelled and the owner holds none of their own (a colleague
who doesn't import organized it), the meeting is set Cancelled, and back to Planned if that copy returns. An imported
meeting with no related record that ended before today and is still Planned is completed by the nightly maintenance
(`completedBy` `calendar-sync`). Turning either switch on starts one full pull of each affected calendar, so meetings
already there come in. `POST /api/activities/:id/response` is also open to the **owner** of an `externalOrganizer`
meeting who holds the invitation in their own synced calendar (a customer invited them; they have no attendee row):
`viewer.myResponse` carries their reply, Decline sets the activity Cancelled and Accept / Maybe bring a Cancelled one
back (audited `RSVP` plus the status `UPDATE`); not once their copy is cancelled (gone from the calendar: no
`viewer.myResponse`, the reply is `403`; as of 2026-11-27); for them and for invited colleagues the reply goes to their calendar
copy through the `rsvp` job (as of 2026-11-26, P2-8).
`ActivityDto` gains `organizerEmail`, `organizerName` (`''` when unknown) and `externalOrganizer`; the activity view
gains `importedFrom: 'google' | 'microsoft' | 'fake' | null` (the provider it came from, outside the audited record).

Every activity
the API returns also carries `lockedFields: string[]` (outside the audited record): for every follow-up activity
`followupType`, `startAt`, `endAt`, `allDay`, `status`, `assignedTo`, `relatedModule`, `relatedId`, `relatedTo`; empty
otherwise. Every activity the API returns also carries `calendar` (as of 2026-11-26, Calendar Phase 2 P2-3b; outside
the audited record; `null` when the activity has no calendar copy): the owner's calendar copy (owner's live
connection), `{ provider: google|microsoft|fake, state: pending|synced|error|cancelled|removed_remote|unsupported|detached,
pending (a push is waiting), invites: send|withhold, heldCount (guests held until the owner sends invitations, D41),
canSendInvites (owner only), invitesWaiting (someone waits for the owner to send invitations: a private copy with
guests, or held guests; `false` while the event is gone, `cancelled` / `removed_remote`; as of 2026-11-26, P2-3c), copyReason: connected|assigned|null (why a private copy has no
guests: copied by the first-sync backfill, or saved / reassigned by someone other than the owner; P2-3c),
lastSyncedAt, htmlLink, errorCode, errorMessage, warning, conflictAt, externalUpdatedAt }`
(ISO times or `null`; `htmlLink` and `errorMessage` only for the owner and users who can edit the activity, else `null`; the follow-up note `warning` "Follow-ups keep a time: …" only within 7 days of `externalUpdatedAt`, as of 2026-11-26, P2-5). Read only: saves never take it; the two
calendar actions below change it. A save of an enrolled owner's activity pushes it to their calendar after commit
([system design §5.4](system-design.md#54-calendar-sync-crm-calendar-sync)); the response doesn't wait for the push.
**Video meetings** (as of 2026-11-26, Calendar Phase 3 P3-1; `activities/activity.conference.ts`,
`calendar-sync/conference.rules.ts`, `calendar-sync/sync.conference.ts`). `ActivityDto` adds `videoMeeting` (`meet` |
`teams` | `zoom` | `''`, column `conferenceProvider`; audited) and `conferenceJoinUrl` (the ready link, else `''`).
Every activity the API returns also carries `conference` (outside the audited record; `null` without a video meeting):
`{ provider, state: requested|ready|failed, joinUrl, errorCode, errorMessage, canRetry, locked }`. Saves take
`videoMeeting` (`''` / `null` = none; left out = keep; Task / Note always none). Rules: a **new** choice needs a Planned
activity (`400 VALIDATION_ERROR` "A video meeting can only be added to a planned activity.") and a type whose Followup
Type option has meta `videoMeeting: true` and goes to calendars (`400`); a new choice needs the (new) owner's live
company calendar to make that kind of link (Google → Meet, Microsoft 365 → Teams; Zoom always refused for now) → else
`409 VIDEO_PROVIDER_NOT_CONNECTED` (on `videoMeeting`); the owner removing or changing a **ready Teams** link →
`409 VIDEO_MEETING_LOCKED` ("Cancel and create a new meeting to remove the Teams link."); re-saving the stored choice
always passes (an admin switching a type off keeps existing meetings). An **owner change** is never refused for the
video meeting (CRM and system writes, e.g. a follow-up re-owned with its lead; the Teams lock doesn't apply to a new
owner): on a Planned activity the new owner's calendar gets a new request when it can make that kind of link, else the
link becomes `failed provider_unavailable` (no Retry: pick another option or None); a logged activity keeps its link.
A new choice, such an owner change and Retry set `conferenceState = requested` with the next request number; the
calendar push creates the link (Google:
`conferenceDataVersion=1` + `conferenceData.createRequest { requestId: '<requestedId>-c<n>', conferenceSolutionKey:
hangoutsMeet }`; Graph: `isOnlineMeeting: true`, `onlineMeetingProvider: 'teamsForBusiness'`, `onlineMeeting.joinUrl`
read). A Meet / Teams link added in Google / Outlook directly is taken over read only when a push answer or a pull of the organizer copy (P2-5) carries it; a pull only ever records a `ready` link (never fails, clears or re-requests one).
Once ready, the event description gets "Join with Google Meet: <url>" / "Join Microsoft Teams meeting: <url>" with one
more quiet push (also for external guests). A wait always ends: `failed` codes `conference_failed` (Google failed it),
`not_created` (the calendar refused or ignored the request: Meet off for the organisation answers 400, and the event is
then sent without the video part; Teams without a licence), `join_url_rejected`, `conference_timeout` (5 reads, the
worker's last attempt, or still `requested` an hour after the last save at the nightly run; a recurring occurrence
keeps waiting until it has a calendar copy and has been inside Calendar Phase 4's 14-day window for a day, or until
the day before it starts), `no_event` (the event is
gone), `event_refused` (the push failed for good), `provider_unavailable` (the owner's calendar can't make it).
`canRetry` is true for a failed link on a live Planned activity the viewer may edit, except `provider_unavailable`.
Video meeting can't be made Required in the Form Builder (`400` on `isRequired: true`), and saves never require it.

A `PUT` / `PATCH` that **changes** one of them is `409 FOLLOW_UP_ACTIVITY_LOCKED` ("This is the lead's next
follow-up. Change it on the lead (LD-0012): Record a follow-up.", `errors[]` one per field; resending an unchanged
value passes); subject, location, attendees, reminder, response, remarks and custom fields stay editable. Deleting
one is refused (`409 FOLLOW_UP_ACTIVITY_LOCKED`), and `bulk-delete` skips it. Switch: Admin › API Integrations ›
Calendar sync settings › "Follow-ups create activities" (`followUpActivities`, default on); off = no follow-up
activity is written (existing ones stay), the nightly backfill re-aligns every record once it is back on.

**Recurring activities** (as of 2026-11-26, Calendar Phase 4, `activity.series.ts`, `activity.recurrence.ts`). A
series is one `ActivitySeries` row (rule + the fields every occurrence copies) and **one ordinary activity per
occurrence** (Phase 1 R12: rows, never an RRULE master), created through today + 90 days and extended nightly.
- `repeat` (on `POST /` and `PUT /:id`): `{ frequency: daily|weekly|monthly, interval: 1–99 (default 1), weekdays?:
  ISO 1–7[] (weekly; default the first day's weekday), monthlyMode?: day|weekday (monthly; default day), monthDay?:
  1–31 (default the first day's; months without it are skipped), setPos?: 1–4|-1 (last), setWeekday?: 1–7, ends:
  never|on|after (default never), untilDay?: YYYY-MM-DD (inclusive, at most 5 years after the first day), count?: 1–366 }`
  or `null` (does not repeat). Fields the frequency doesn't use are dropped. The first activity is always occurrence 1.
  `400 VALIDATION_ERROR` on `repeat.*`; Notes can't repeat (`400` on `repeat`), lead / opportunity follow-up activities
  can't (`409 FOLLOW_UP_ACTIVITY_LOCKED`), imported / booked activities can't (`400`).
- Every activity view carries `seriesId` (`''` for a single activity, read only, in the audited DTO) and `series`
  (outside the audited record): `null`, or `{ id, rule (as above, normalised), summary ("Every week on Mon, Wed until
  31 Mar 2027"), index (position, 1 = first), total (count series, else null), exception (changed on its own), ended
  (no more occurrences are added) }`. Calendar items of occurrences carry `seriesId` (repeat icon).
- `?scope=this|following|all` on `PUT /:id` and `DELETE /:id` (default `this`; anything else `400`). Series fields =
  type, subject, owner, related record, organization, contact, location, reminder, remarks, attendees, custom fields,
  the Video meeting choice (P3-1: only the choice; each occurrence asks for its own link when pushed), time of day,
  length and the rule; status (except Cancelled), customer response and completion stay per occurrence.
  `this`: the ordinary update / delete; an occurrence changed on its own (anything but status / customer response)
  becomes an exception that series edits leave alone; a deleted occurrence is never re-created. Changing `repeat` with
  `this` → `400 SERIES_SCOPE_REQUIRED` (sending the same rule back passes). `following`: the series is split: the old
  one ends the day before this occurrence, or before the day it moves to when that is earlier (`untilDay`); a new
  series starts at this occurrence with the new values; later occurrences move to it and are rewritten. A count series
  keeps its remaining count (the total minus the old series' occurrences before the cut) unless `repeat` is sent with
  another count (a `repeat` whose count equals the series' total, as the form sends it back, still counts what is
  left). Moved to another day without `repeat`, a rule tied to the old day follows (weekly on that one weekday, monthly
  on that day or nth weekday). The occurrence keeps its own slot and stays an exception (the new series starts at the
  rule's first day from the cut, so its old day doesn't come back as an extra event) when the rule keeps its days and
  it was moved alone before and this save doesn't move it, or it moves earlier onto a day the rule doesn't have (as of
  2026-11-26, review round 2). Moved rows that aren't rewritten (exceptions, completed, deleted) are renumbered
  against the new series. `all`: the series takes **only what this save changed** on the occurrence (time of day and
  length only when start, end or all-day changed; other fields one by one, custom fields per key), so an exception's
  own time, place or guests stay with it (it stays an exception), and its future occurrences are rewritten; moving the
  occurrence to another day → `400` on `startAt` (change `repeat`, or use `following`); an occurrence moved alone
  keeps its own slot (it stays an exception). Rewrite =
  future (not started) Planned non-exception occurrences are paired with the rule's days and updated; those off the
  rule are deleted and detached, so a day the rule drops comes back when the rule returns to it; free days are created;
  one whose new time has already passed today is left as it is; past, Completed, Cancelled and exception occurrences
  are never touched. The Video meeting rules apply to every rewritten occurrence: a ready Teams link on one of them
  makes a `following` / `all` edit that removes or changes it answer `409 VIDEO_MEETING_LOCKED` (nothing is saved), and a
  new choice the owner's calendar can't make answers `409 VIDEO_PROVIDER_NOT_CONNECTED` (also on a series create);
  the same choice keeps each occurrence's own link (as of 2026-11-26). When the edited occurrence takes a slot another event of the series holds: a deleted or
  rewritable one gives it up, any other answers `400` on `startAt`. `status: Cancelled` with `following` / `all`
  cancels those occurrences (exceptions too) and ends the series and its rule (`untilDay`, so a later `all` edit never
  revives it); `repeat: null` with `following` / `all` ends it after this occurrence (later / future ones not started
  yet are deleted; occurrences already over today stay). `PUT` with `repeat` on a single activity makes it occurrence 1
  of a new series. `DELETE` `following`: the series ends the day before, its non-completed occurrences from here are
  deleted; `all`: the series is deleted with its non-completed occurrences from now (and this one); past ones stay.
  `following` / `all` (edit and delete) also need the right to change the series (its owner, its creator or a global
  role): owning one occurrence reassigned alone isn't enough (`403`). `409 SERIES_ENDED` when the series was deleted
  (only `this` works). `bulk-delete` stays per occurrence (`this`); the list's row Delete asks the scope like the
  drawer. A calendar change to one occurrence (P2-5 pull, push-time merge) makes it an exception, like a `this` edit.
- Calendar sync: each occurrence is pushed as a single event; an occurrence more than 14 days ahead gets no calendar
  copy (and sends no invitation) until it comes within 14 days; the "invitations held" notice comes once a day per
  series, not per occurrence ([system design §5.4](system-design.md#54-calendar-sync-crm-calendar-sync)). Until then
  a requested video link shows `conference.waitingForCalendar: true` (requested, an occurrence, no calendar copy yet;
  screens show a note instead of "Creating…" and don't poll; as of 2026-11-26).
- Audit: `ActivitySeries` CREATE / UPDATE / DELETE (rule summary, scope, occurrence counts, `splitFrom` /
  `splitInto`); occurrences the series creates write a small `Activity CREATE` (`{ subject, seriesId,
  originalStartAt }`), updates their usual diff, deletes their usual `DELETE`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/meta` | `{ timeZone, now, relatedModules: [{ key, label }], durationMinutes: { <Followup Type>: minutes }, fallbackDurationMinutes, reminders: [{ value, minutes }], statuses, maxDurationDays }` for the form and calendar |
| GET | `/calendar?from&to&users&types&sources&status` | `{ timeZone, from, to, truncated, items: CalendarItem[] }`. `from` / `to`: instants with a zone, `to` exclusive, at most 62 days apart (`400` on `to`). `users`: csv of usernames (default the caller; others only within the caller's access); `types`: Followup Types; `sources` ⊆ `activity`, `leadFollowup`, `opportunityFollowup`, `contractRenewal` (default all); `status`: activity statuses (default Planned + Completed). Activities overlap the window; lead / opportunity follow-ups (open records, `nextFollowupDate` + time) and contract renewal reminders (not Expired) are read-only items. Item: `{ key: '<source>:<id>', source, module, recordId, title, followupType, start, end (null for point items), allDay, startDay, endDay (all-day, inclusive), status, assignedTo, relatedModule, relatedId, relatedTo, location, attendeeCount, myResponse, editable, overdue, activityId, origin }`, sorted by start. **Follow-up activities** (P2-4) come under their record's follow-up source (`source: leadFollowup` / `opportunityFollowup`, `module: activities`, `activityId` = the activity, `origin: 'followup'`, `editable: false`: they move with the record); `sources=activity` returns the other activities only. A record whose open follow-up activity the caller can see has no derived item (no follow-up twice); with the switch off follow-up activities are left out and every derived item shows. Derived items have `activityId` / `origin` null. At most 2000 activities and 1000 items per other source; `truncated: true` when a cap was hit. Each activity item also carries `syncState` (as of 2026-11-26, P2-3c): its owner's calendar copy state (`pending`, `synced`, `error`, …) for activities the caller can edit, else `null` (the calendar's error dot) |
| POST | `/:id/calendar-sync/retry` | **Retry / Add again** (as of 2026-11-26, P2-3c; owner or editors, else `403`): the owner's calendar copy is marked dirty with its attempts reset and pushed now (`error` → `pending`; a refused restore of a `cancelled` copy is tried again). `removed_remote` (deleted in the calendar) → **Add again**: only for a Planned activity not over for more than 24 h (create-eligible), a new copy (new generation and requested id, the gone event's ids dropped). The new event is a new invitation, so when someone other than the owner presses Add again on an activity with guests the copy becomes private (`invites = 'withhold'`, held list cleared) and the owner gets `calendar_invites_held` (D41); the owner's own Add again keeps the invitations. → `ActivityView` (fresh `calendar`). `503 CALENDAR_SYNC_DISABLED` (kill switch off), `409 CALENDAR_NOT_SYNCED` (no copy in the owner's calendar), `409 CALENDAR_SYNC_NOT_RETRYABLE` (a repeating series in the calendar, D19; Add again on an activity no longer upcoming and Planned), `404`. Writes only the link, under the activity's record lock; logged, not audited |
| POST | `/:id/calendar-sync/send-invites` | **Send invitations** (as of 2026-11-26, P2-3c; **owner only**, D41: managers and admins get `403` "Only <owner> can send these invitations: they go out from their own calendar."): `invites = 'send'`, held guests released, pushed now; the push adds every invitable attendee with Google `sendUpdates=all`, and clears the internal description when any of them is outside the company (D15). Nothing waiting → the view unchanged. The copy's event gone (`cancelled`, `removed_remote`) → `409 CALENDAR_SYNC_NOT_RETRYABLE` (nothing would be sent; Add again first), nothing written. Audited `Activity SEND_INVITES` (`{ provider, privateCopy, guests }`, counts only). → `ActivityView`; same `503` / `409` / `404` as retry |
| GET | `/busy?users&from&to&exclude&suggest` | **Busy times** (as of 2026-11-26, Calendar Phase 2 P2-6, `modules/calendar-sync/busy.*`): colleagues' busy blocks for picking a time, **times only** (no subject, location or attendees, whoever asks). `users`: csv (or repeated) usernames, 1–20 after case-insensitive de-duplication; `from` / `to`: instants with a zone, `to` after `from`, at most 31 days apart; `exclude`: an activity id (the one being moved: its own CRM block is dropped, and a calendar block of its owner or an invited colleague with exactly its start and end, its calendar copy, is dropped too; longer blocks around it are other meetings and stay; ignored unless the caller can view it); `suggest`: minutes 5–1440 → also `suggestion`. → `{ timeZone, from, to, generatedAt, people: [{ username, name, provider: 'google' \| 'microsoft' \| 'fake' \| null, status, sources: ('crm' \| <provider>)[], busy: [{ start, end, kind: 'busy' \| 'tentative' \| 'away' }] }], suggestion?: { start, end } \| null }`, `people` in request order, `busy` merged per kind and clipped to the window. Each person's blocks = their **CRM activities** (Planned, not Note / Task, owned or invited and not declined; timed → `busy`, a zero-length one 15 min; all-day → only a Site Visit type, as `away`; follow-up activities only while "Follow-ups create activities" is on) plus their **company calendar** when they have a live `ok` / `pending` connection (Google `freeBusy` as the requester, then per colleague; Microsoft `getSchedule` app-only: `busy` / `tentative` / `oof` → `away`, the rest dropped). `status`: `ok` (calendar read), `not_connected` (no live connection, provider switched off, or the connection gone: CRM only), `error` (the connection is in error, the provider is unhealthy, or it refused this read: CRM only; a refused read marks nothing on the connection), `unavailable` (the provider didn't answer in time, failed as a whole for the batch, or the request's 8 s provider deadline or the 120 provider calls / min / user budget ran out: CRM only), `unknown` (no such active person, or a group user: nothing). A provider failure never fails the request. `suggestion`: the first slot of that length free for everyone, 09:00–19:00 business time, 15-minute grid, within 7 days of `max(from, now)`; `null` when none. `Cache-Control: no-store`; server-side cache 60 s per person (calendar) and 30 s per people set (CRM, dropped by activity writes), both keyed on the window widened to the 15-minute grid (as of 2026-11-26). 60 requests / 60 s per user → `429 RATE_LIMITED` + `Retry-After` ("Too many availability checks. Wait a minute and try again."); `400 VALIDATION_ERROR` on bad params |
| GET | `/link-targets?module&search&limit` | Records of one module (`leads`, `opportunities`, `contacts`, `organizations`, `quotations`, `tickets`, `contracts`) the caller can access, for the Related To picker: `[{ module, id, code, label, organizationName, organizationId?, contact, contactId?, assignedTo }]`, newest first; `label` is what a save stores as `relatedTo` (at most 200 characters: a nameless opportunity's product list is cut with `…`); `search` matches the record number (by prefix) or name; `limit` default 20, max 50 |
| GET | `/` | Paginated list (§1.2). Filters: `followupType`, `status`, `excludeStatus` (csv), `assignedTo`, `mine` (owned by the caller), `attending` (invited), `relatedModule` + `relatedId` (a record's Activities tab), `organizationId` / `contactId` (with `rollup=true`: also activities related to that organization, or related to / attended by that contact), `from` + `to` (both or neither; activities overlapping the window plus notes written in it), `overdue` (Planned and already ended), `createdWithinDays`. Search: subject, related record (label or number), organization, contact, location. Sort: `startAt`, `endAt`, `createdAt`, `updatedAt`, `subject`, `followupType`, `status`, `assignedTo`, `relatedTo`, `organizationName` |
| GET | `/:id` | The activity plus `viewer: { canEdit, myResponse }` (the caller's reply when invited, else null) and `lockedFields` (above). Times are UTC instants (`startAt`, `endAt`, `''` on notes); all-day ones also carry `startDay` / `endDay` (inclusive) and `timeZone`; `attendees: [{ kind, username?, contactId?, email?, name, responseStatus, respondedAt? }]` (blank keys left out) |
| POST | `/` | 201. Optional `repeat` makes it the first occurrence of a recurring series (above). Required: `followupType` (an option of `shared_followup_type`; `Task` / `Note` in any case), `subject`, `assignedTo` (an active user). **Timed:** `startAt` (required unless Note) / `endAt` as ISO instants with a zone; an omitted `endAt` defaults to the type's duration (`/meta`). **All-day:** `allDay: true` with `startDay` / `endDay` (`YYYY-MM-DD`, inclusive, business timezone; `endDay` defaults to `startDay`); the instants are ignored and stored as midnight → midnight after the last day. `endAt` can't be before `startAt` (`400` "End cannot be before Start.") or more than 31 days after it. A **Planned** activity can't start in the past (5 minutes' grace; all-day: before today) unless the start is unchanged; Completed / Cancelled ones can (log a past call). `relatedModule` + `relatedId` link one record the caller can access (`403` "You can't link an activity to a record you don't have access to."; `relatedTo` alone is refused: "Pick the record this activity is related to."); `organizationId` / `contactId` (or names, linked like contracts) default to the related record's. `attendees`: up to 50 of `{ kind: 'user', username }` (active users; the owner is dropped), `{ kind: 'contact', contactId, email? }` (live contacts), `{ kind: 'email', email, name? }`; `responseStatus` is honoured for contacts / emails (the owner records their replies). `reminder`: an `activity_reminder` label. **Note:** `remarks` required, no schedule / reminder / location / attendees, saved as Completed. **Task:** no attendees or location. `customerResponse`: an option of the related lead's / opportunity's Customer Response list, else of `activity_customer_response` (offered by the form; the API stores any text up to the option length); it sets no lead Rating, isn't checked against an opportunity's Sales Stage and clears no follow-up. Custom fields as on other modules |
| PUT / PATCH | `/:id?scope=` | Recurring activities: `scope` and `repeat` (above). Partial update merged onto the stored activity (owner, creator or global role). Sending `startDay` / `endDay` / `allDay` switches between timed and all-day; picking another related record re-derives organization / contact unless they're sent too; clearing it (`relatedModule` / `relatedId` null or `''`) keeps them. Attendees are synced by identity (only the changes are written; replies of attendees who stay are kept). Setting Completed fills `completedAt` / `completedBy`; leaving it clears them. A change of times, type, subject, location, owner, status or the attendee set bumps `revision`; `remindAt` is recomputed on every write, and a changed `remindAt` arms the reminder again |
| DELETE | `/:id?scope=` | Recurring activities: `scope` (above). Soft delete (owner, creator or global role); the reminder is cleared. A follow-up activity: `409 FOLLOW_UP_ACTIVITY_LOCKED` ("Next follow-up of LD-0012: change it on the lead" / "Follow-up history of LD-0012: kept with the lead") |
| POST | `/bulk-delete` | `{ ids }` → `{ deleted, ids, notFound, skipped? }` (each id needs edit rights). `skipped: [{ id, reason }]` lists locked activities left alone (follow-up activities), present only when something was skipped |
| GET | `/video-options?owner` | Video meeting choices for `owner` (username; default the caller): `{ owner, calendarProvider: google\|microsoft\|fake\|null, options: [{ value: meet\|teams\|zoom, label, available, reason? }] }` (Meet with a live Google calendar, Teams with Microsoft 365, Zoom never yet; `reason` on the unavailable ones). P3-1, as of 2026-11-26 |
| POST | `/:id/conference/retry` | Asks the calendar again for a video link that **failed** (owner, creator or global role) → the activity view (`conference.state = requested`, a new request number). `409 NOTHING_TO_RETRY` unless the link failed on a live Planned activity (and not `provider_unavailable`, which Retry can't fix); `409 VIDEO_PROVIDER_NOT_CONNECTED` when the owner's calendar can no longer make it. P3-1, as of 2026-11-26 |
| POST | `/:id/response` | `{ responseStatus: 'accepted' \| 'tentative' \| 'declined' }` → the activity view. Invited colleagues only (`403` "Only invited colleagues can reply to this activity."; also for notes); `404` when missing. Audited as `RSVP` (not undoable). P2-8 (as of 2026-11-26): after commit, when both import switches are on for the person and they have an `ok` calendar row, the `rsvp` job sends the same reply to their copy of the invitation (Google attendee PATCH with `If-Match` and `sendUpdates=all`; Graph `accept` / `tentativelyAccept` / `decline` with `sendResponse: true`). The response never waits for it; a calendar refusal is recorded on the link (`rsvp_refused`) and the CRM keeps the reply |

Audit: `Activity` entries (`CREATE`, `UPDATE`, `DELETE`, `RESTORE`, `REVERT`, `RSVP`); `GET /audit-logs/activities/:id`
for anyone who can view the activity. Admin › Audit Log can undo updates and restore deleted activities.

### 2.3 Support, catalogue and partners

| Base | Type | Notes | List filters |
| --- | --- | --- | --- |
| `/tickets` | CRUD | Nature of Call must exist in the master | `ticketStatus`, `excludeStatus`, `ticketPriority`, `supportType`, `supportMode`, `organizationId`, `contactId`, `assignedTo`, `overdue` |
| `/contracts` | CRUD | Required: `contractTitle`, `assignedTo` (Contract Manager: an active user, else the caller), `organizationName`, `contact`; `status` defaults to `Not Started`. Organization by `organizationId`, else by name; contact by `contactId`, else by name within that organization; opportunity by `opportunityId`, else the typed label is kept unlinked (unknown / deleted id → 400 on `organizationName` / `contact` / `opportunity`). Dates `YYYY-MM-DD`, `renewalReminderDate` wall clock `YYYY-MM-DDTHH:mm`; start / end / bill dates and the reminder can't be in the past unless unchanged, and `endDate` can't be before `startDate` (400 on that field). `contractValue` / `billAmount` ≥ 0 with ≤ 2 decimals, returned as strings (`''` when empty); `tallySerialNo`, when given, exactly 9 digits starting with 7 (an older value is kept on `PATCH` until the field is sent); `contractType` is a string array. Search: a `CTR-` / series number by prefix, else number, title, organization, contact, opportunity, Tally serial no., bill number. Sort: `createdAt`, `updatedAt`, `contractNumber`, `contractTitle`, `status`, `organizationName`, `assignedTo`, `startDate`, `endDate`, `renewalReminderDate`, `contractValue` | `status`, `excludeStatus`, `organizationId`, `contactId`, `opportunityId`, `assignedTo` |
| `/documents` | Read-only (`GET /`, `GET /:id`) | Activities › Documents: the document each opportunity records in its Documentation section, written only through `/opportunities` (`addDocument`, `documentNo`, `documentDate`, `documentFile`). Row: `{ id, documentNo, documentDate, documentFile: { id, fileName, mimeType, sizeBytes, url } \| null, opportunityId, opportunityCode, opportunity (label), salesStage, organizationName, organizationId?, contact, contactId?, assignedTo (the opportunity's), createdBy, updatedBy, createdAt, updatedAt }`. Only documents of live opportunities, scoped by the opportunity's access (`GET /:id` → 404 / 403 as for the opportunity). Search: an `OPP-` number by prefix, else Document No, file name, opportunity code / name, organization, contact. Sort: `createdAt`, `updatedAt`, `documentNo`, `documentDate` | `opportunityId`, `organizationId`, `contactId`, `assignedTo`, `mine`, `createdWithinDays` |
| `/products` | CRUD | Not row-scoped. `GET /manufacturers?search&limit` (limit ≤ 200, default 50) → `[{ name, products }]`: the manufacturers of live products, A to Z, case-insensitive, for the form's Manufacturer suggestions (any new name can still be typed). `manufacturer` is an option of the Manufacturer dropdown (`product_manufacturer`) or a new name: `POST` / `PUT` (and product imports, where a Manufacturer cell naming no option is kept as written) add a new name to that dropdown (`product.manufacturer.ts`; ignoring case, archived options count as present). A new product's name must not match a live product's (`409`); renaming a product is not checked (Jira CRM-108). `productCategory` (was `category`) is one option of the shared Product Category dropdown; Tax Type (`taxType`) was removed (2026-11-27). `GET /` and `GET /:id` rows carry `usage: { total, won, lost, open }` (`product.usage.ts`): opportunities whose line items hold the product (quotations don't count), each counted once, among the opportunities the caller may see (row-level access, as `/opportunities` lists them); `won` = Closed Won, `lost` = Closed Lost, `open` = any other stage; counted live by one grouped query per page (no cache), so stage and line-item changes show at once. Global search rows have no `usage`. The UI links each count to `/opportunities?product=<id>&outcome=Won\|Lost\|Open`, which applies the Opportunities list's Product and Outcome filters. Rows carry `status` (`Active` / `Inactive`), `inactivityReason`, `inactiveSince` (ISO instant, `''` while Active) and `inactivatedBy` (username). `POST` / `PUT` take `status` and `inactivityReason`: changing `status` is Admin only (`403`); `Inactive` needs `inactivityReason` (≤ 500 chars, `400` on `inactivityReason`); `inactiveSince` / `inactivatedBy` are set by the server and cleared with the reason on reactivation. `/opportunities` and `/quotations` writes refuse (`400` on `lineItems.<n>.productName`) an Inactive product on a line unless the record (or, for a quotation, its opportunity) already had it; `GET /lookups/products` lists Active products only. Product imports never set `status` (imported products start Active) | `productCategory`, `type`, `status` (CSV), `usage` (`used` / `unused`, same rule) |
| `/partner-companies` | CRUD | Company name globally unique | `natureOfPartner`, `assignedTo` |
| `/referrals` | CRUD | Referred By master. Required: `name`, `mobile` (unique among live referrals, `409`), `assignedTo`; optional `companyName` (free text, stored uppercase, ≤ 200; replaced `organizationName` / `organizationId` in migration `20261127110000_referral_company_name`); `status` `Active` / `Inactive` (default `Active`); `emailAddress` like contacts. No record number. Lists follow the role's Referrals View (the roles seeded from the old names keep View **All**, as before: every user picks Referred By, and the pickers read `/lookups`, not this list); changes need the assignee, the creator or a role at Edit / Delete **All**. A rename is written through to the leads' and opportunities' `referredBy` | `status`, `assignedTo`, `mine`, `createdWithinDays`; `search` matches name, company name, numbers, designation and emails |

### 2.4 Search, lookups and audit

| Method | Path | Cache | Description |
| --- | --- | --- | --- |
| GET | `/search?q&limit=5` | 30 s, per access scope | `results: { leads, opportunities, quotations, organizations, contacts, tickets, contracts, products, partnerCompanies }`, each `[{ id, category, title, subtitle, meta?, href }]` |
| GET | `/lookups/users?includeInactive` | 5 min | User pickers: `[{ id, name, username, department, role, email, status, isGroupUser, onLeave, photoUrl, outOfOffice }]` (`photoUrl` = `/api/user-photos/<id>` or null; only the photo id is read; `outOfOffice` = `{ from, to, message }` (`YYYY-MM-DD`, inclusive) or null when unset or ended when the list was read: the client decides "active" against the business day). Dropped by profile name / photo / out-of-office changes and user writes (`cache:lookups:users*`) |
| GET | `/lookups/organizations?search&limit` | 5 min (no search) | Compact organization list |
| GET | `/lookups/contacts?search&limit&organizationId` | 5 min (no search/filter) | |
| GET | `/lookups/products?search&limit&productCategory` | 5 min (no search/filter) | Active products |
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
| null, mobile, officePhone, photoUrl, lastLoginAt, passwordChangedAt, createdAt }` (`jobTitle` and
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
- Kinds without a switch (`calendar_sync_issue`, `calendar_sync_error`, `calendar_invites_held`,
  `integration_secret_expiring`) are not configurable and always deliver. Bell notifications keep
  arriving while out of office; muting a kind stops new rows only (ones already in the bell stay).
- Saves take the per-user lock `user:id:<id>` and are audited as User `UPDATE` with the changed columns (dates as
  `YYYY-MM-DD`); no change → nothing written, no audit entry. An out-of-office change drops `cache:lookups:users:*`.

**Notifications** (`/notifications`, `backend-crm/src/modules/notifications`, route header comment = source of truth;
Calendar Phase 1 PR3). The navbar bell's rows: personal (every query is limited to the caller's username), not
audited, deleted by the nightly retention job. Written by the reminders worker and after activity saves
([system design §5.1](system-design.md#51-reminders-and-notifications-crm-reminders)); there is no endpoint to create
one.

`NotificationDto` (empty values are `''`, never `null`):
`{ id, kind: 'activity_reminder' | 'activity_assigned' | 'activity_invited' | 'contract_renewal' | 'calendar_sync_issue' |
'calendar_sync_error' | 'calendar_invites_held' | 'integration_secret_expiring',
title, body, entityModule: 'activities' | 'contracts' | 'admin-integrations' | '', entityId, dueAt (ISO or ''), actor
(username, 'system' or ''), readAt (ISO, '' while unread), createdAt (ISO), href }`. `href` is the app route to open:
activities `/calendar?activity=<id>` (the calendar opens the activity drawer), contracts `/contracts/<id>`,
`admin-integrations` `/admin/integrations` (entityId = the provider), or `/admin/integrations?tab=people&issue=calendar_problem`
for the people digest (entityId `people:calendar_problem`); computed when read, so older rows follow; otherwise `''`
(also for rows of the retired `calendar-connections` module).
`calendar_sync_issue` (as of 2026-11-26, P2-2b; actor `system`; replaces P2-2's `calendar_reconnect`, whose rows the
migration deletes): calendar problems go to **admins** (active users with an admin role), never to the employee, who
can't fix them. App-level ("Calendar sync stopped: <provider>", body = the fixed admin sentence for the code): one per
provider, code and business day, dedupe `calendar_sync_issue:<provider>:<code>:<business date>:<admin>`. People digest
(nightly, when at least one person's calendar went to `error` that day): dedupe
`calendar_sync_issue:users:<business date>:<admin>`. Always delivers (no preference switch).
As of 2026-11-26 (P2-3b; actor `system`; always deliver): `calendar_sync_error` to the activity's owner when the
calendar refused its push (entity `activities`, dedupe `calendar_sync_error:<activityId>:<business date>:<owner>`);
`calendar_invites_held` to the owner when a colleague added guests whose invitations wait for the owner (entity
`activities`, dedupe `calendar_invites_held:<activityId>:<business date>:<owner>`); `integration_secret_expiring` to
admins while a provider's client secret ends within 30 days (entity `admin-integrations`, entityId = the provider,
from the 00:25 calendar nightly, dedupe `integration_secret_expiring:<provider>:<expiresOn>:<ISO week>:<admin>`, so
at most once a week).
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
| PUT | `/scorecards/:module` | Admin only. `{ fieldKey, currencyFieldKey?, options, listViewColor, drawerViewColor, enabled? (default true), allLabel? (≤ 60 chars, empty = default), version }` where `version` is the saved version the admin edited (null when nothing was saved). Returns the saved scorecard with `version` + 1 (1 on create). **409** when another admin saved (or reset) the scorecard since that version. **400** when `fieldKey` isn't an active `select` field of the module, `currencyFieldKey` isn't an active `amount` / `number` field or one of the module's built-in totals, an option isn't in the field's dropdown, or a color isn't `#RRGGBB`. Built-in totals are `builtin.*` keys the list works out from its line items (`BUILT_IN_SCORECARD_AMOUNTS` in `scorecard.validator.ts`; Opportunities: `builtin.totalAmount`, `builtin.subtotal`, `builtin.totalDiscount`, `builtin.totalTax`, `builtin.grandTotal`, `builtin.subtotalPlusTax`, `builtin.commissionAmount`, `builtin.lumpSumDiscount`, `builtin.roundOffAmount`; Quotations: the same without `builtin.grandTotal` and `builtin.commissionAmount`, plus `builtin.actualBeforeTax`). No `currencyFieldKey` = the screen's default total (Opportunities: Actual (Before Tax); Quotations: Grand Total) |
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
| POST | `/import/:entity` | `entity` ∈ organizations, contacts, products, leads, opportunities, tickets, partner-companies. Body `{ rows: [{ rowNumber, values }], fileName? }`, 1–5,000 rows, cells ≤ 5,000 chars. **202** `{ status: 'queued', importId, total }` or, without Redis and ≤ 500 rows, **200** `{ status: 'completed', importId, result }`. `values` are keyed by the module's **form field keys** (as of 2026-11-27): every active field shown on the creation form (Form Builder configuration) can be imported except file uploads; custom fields as `customFields.<key>`. Older keys `email` (→ `emailAddress`) and `billingStreet` (→ `billingAddress`) are still read. Cells are read by field type (`imports/importValues.ts`): dropdowns match an active option by value or label in any case and spacing, a bare or fractional number matching a percentage option (`18` or Excel's `0.18` → `18%`), and an unknown value fails with the allowed options (`"Software" is not an option of Type. Allowed: Product, Service, …`) (Task / Note refused as Followup Type), multi-selects split on `,` / `;`, checkboxes Yes / No, dates day first (`15/08/2026`, `15-Aug-2026`, `2026-08-15`), date-times with an optional time, phones normalized to E.164, `emailAddress` takes several addresses (first primary). Each row is then checked like the creation form: required fields (custom included), formats, options and the conditional rules (Lead Source CA / Reference / Partner, GST for a GST registration type, Nature of Partner for a Partner organization, Commission and Add Document on opportunities, Customer Response vs Sales Stage); past dates are allowed. Blank cells get the import defaults (leads: Lead Source Other, Status New, Followup Type Call, follow-up today; opportunities: Product Category TallyPrime, Type New Business, Sales Stage Qualification, Lead Source Other, Commission No, follow-up today, Lead Given By the importer; tickets: Priority Normal, Status New, Source Call, Support Type Free, Support Mode Phone Consultation, Due Date in 24 h (a date without time is due 18:00), Nature Of Call the first active one; organizations: Account Status Active, Registration Type from the GSTIN; partner companies: Nature of Partner Other; Assigned to the importer everywhere). A failed row lists every problem in `result.failed[].errors` |
| GET | `/import/jobs/:importId` | Owner only: `{ state, progress (0–100), total, processed, created, failedCount, cancelRequested, result?: { total, processed, created, failed: [{ rowNumber, errors }], cancelled }, failedReason? }`. Live counts update after every row (at most every 250 ms). `state` is `cancelled` for a queued import removed by Cancel |
| POST | `/import/jobs/:importId/cancel` | Owner only. Queued: removes the job (`state: 'cancelled'`). Running: sets `import:cancel:<id>` in Redis (6 h TTL) and the worker stops before its next row; rows already imported stay and the job completes with `result.cancelled: true`. Finished: returns the status unchanged |

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

**Follow-up activities** (as of 2026-11-26, Calendar Phase 2 P2-4; see §2.2a). Side effects of lead / opportunity
writes, in the same transaction (under the record's lock), while "Follow-ups create activities" is on. Lead Rating,
ageing and scorecards keep reading the record's own fields; the activity never changes them.

- Create (form, import, Convert Lead's opportunity): a next follow-up creates the record's follow-up activity.
- Update: a new slot, type, owner, organization / contact or name moves / rewrites the open follow-up activity (the
  subject only when its derived text changed, so a hand-edited subject stays). A recorded `customerResponse` with
  `followUpDecision: 'new'` (leads) / a new slot (opportunities) completes the open activity with the response and
  remarks (its times kept: an early completion stays on its slot) and creates the next one; `'keep'` (same slot) logs a
  separate Completed activity (`origin: 'crm'`) with the response; a closing lead status or a "no follow-up" response
  completes it (response recorded) or, without a response, cancels it. Closed Won / Lost always cancels it (a closed
  stage keeps no response, see §2.2).
- Delete / bulk delete cancels the open follow-up activity; restore re-creates it.
- An opportunity still pointing at a deleted organization / contact keeps it on its follow-up activities too (the
  save is not refused with "has been deleted"; system writes copy the record's links as they are).
- `PATCH /organizations/:id` renaming an organization also rewrites the subject of the open follow-up activities of
  its opportunities that have no Opportunity Name (their subject is derived from the organization's name), when the
  subject is still the derived one; audited `Activity UPDATE` by the renaming user, no notifications.
- A follow-up activity whose slot has already passed when it is written (the backfill, a restore, a follow-up saved
  in the past) is stored with its reminder marked sent: it shows as overdue and no late reminder fires. A reminder
  that is due while the slot is still ahead fires as usual.
- `POST /leads/:id/convert` moves the lead's open follow-up activity to the new opportunity (related record, code,
  subject; audited `Activity UPDATE`), so the calendar event isn't replaced.
- Writes are audited `Activity CREATE / UPDATE` by the saving user; owners are notified on interactive saves (not on
  imports or the backfill). Two saves racing on one record are serialized by the record lock; a unique-index refusal
  (`UX_Activity_openFollowUp`) rolls the save back and it is retried once.

**Document series** — `/document-series`

| Method | Path | Description |
| --- | --- | --- |
| GET | `/shown-modules` | Any user: `{ modules }` whose numbers the UI shows |
| GET | `/` 🔐 | Settings, every module's rule, current FY, each module's next number |
| PUT | `/` 🔐 | `{ companyPrefix, separator, fyStartMonth, fyFormat, series: [...] }` |

**Company formats** — `/company-formats` (Admin › Company formats, Profile Phase 5;
`backend-crm/src/modules/company-formats/companyFormats.routes.ts`, route header comment = source of truth). How dates,
times and numbers are **shown** across the CRM, its quotation PDFs, the morning email, new bell notification texts and
the admin audit log (times, and once saved the dates and amounts in its Before / After values). Display only: stored values and every API field (ISO dates, plain numbers) never change format, nor do
exports.

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
key); 401; 403 `FORBIDDEN` (PUT / DELETE by a non-admin role). The value lists and
formatters are `backend-crm/src/modules/company-formats/core/displayFormats.ts`, copied to
`frontend-crm/src/lib/display-formats` by `npm run sync:display-formats` (checked by `contractSync.test.ts`).

**Company details** — `/company-settings` (Admin › Company Details, Jira CRM-111;
`backend-crm/src/modules/company-settings/companySettings.routes.ts`, route header comment = source of truth).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Any signed-in user: `{ companyState, updatedBy, updatedAt }`; `companyState` is `''` while not set |
| PUT | `/` 🔐 | `{ companyState }`: an Indian state or union territory by name or ISO code (`IN-GJ`), `''` clears it; stored as the address master's name → `{ success, data, message: 'Company details saved' }`. `400` on `companyState` "Pick an Indian state or union territory." Audited `CompanySettings UPDATE`. A changed state recomputes the totals of records saved without one (`gstType` null) |

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

**API Integrations** — `/admin/integrations` 🔐 (Admin › API Integrations, Calendar Phase 2 P2-1, admin-managed
calendar connections since P2-2b, as of 2026-11-26; `backend-crm/src/modules/integrations/integration.routes.ts`, route
header comment = source of truth). Admin roles only. Secrets (the Google service account key, the Microsoft / Zoom client
secret) are **write-only**: stored only sealed by `secretBox`, never in a response, a log or an audit entry. Responses
carry summaries only (`secret: { set, readable, last4, updatedAt, updatedBy, expiresOn, expiresSoon }`; Google
`serviceAccount: { set, readable, clientEmail, clientId, projectId, privateKeyId, updatedAt, updatedBy }`).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | `{ ready: { ok, reason: key_missing\|null }, keyStatus: ok\|missing\|unreadable, activeKeyId, publicApiUrl, publicApiUrlConfigured, webhooksActive (P2-7: calendar webhooks are live), webhooksOffReason: no_public_url\|needs_https\|disabled\|sync_disabled\|key_missing\|null (P2-7: why not; `key_missing` = no `INTEGRATIONS_ENCRYPTION_KEY`, which signs the channel tokens), pollMinutesWithWebhooks (P2-7: the safety-net poll for people with a working webhook as the scheduler uses it, the larger of `CALENDAR_POLL_MINUTES_WITH_WEBHOOKS` and `CALENDAR_POLL_MINUTES`), fakeProvider (the dev-only test calendar is on), worker: { lastSeenAt }\|null (the calendar sync worker's Redis heartbeat, written every minute; null when none in the last 2 minutes or Redis is down; as of 2026-11-26, P2-3b), workerStatus: running\|not_seen\|no_redis (P2-3c: `not_seen` = Redis is up but no heartbeat, the worker isn't running; `no_redis` = nothing to read), syncEnabled (`CALENDAR_SYNC_ENABLED`, P2-3c), providers: ProviderAdminDto[], settings: CalendarSyncSettings, syncTypes: [{ value, label, calendarSync, videoMeeting, locked, lockReason? }] }`; `Cache-Control: no-store`. `PUBLIC_API_URL` no longer gates readiness (no redirects; webhooks need it as https, P2-7). `ProviderAdminDto`: `{ provider: google\|microsoft\|zoom, label, kind: calendar\|video, available, enabled, configured, clientId, secret, webhookSecret (zoom) \| null, serviceAccount (google) \| null, scopes (google: the two delegated scopes) \| null, scopesAdminConsole (google: the exact comma-delimited text for Admin console › Domain-wide delegation) \| null, settings, domains, webhookUrls, webhook (P2-7, google / microsoft; null for zoom): { status: live\|starting\|errors\|off\|unavailable, reason (webhooksOffReason while `unavailable`), active, failed, waiting } (people with a synced calendar whose channel delivers / was refused / isn't there yet; counted only while webhooks are live), lastTest: { at, ok, message }\|null, appTested, clientVersion, health: { status: unknown\|ok\|error, code, message, at }, counts: { ok, pending, error, excluded }, updatedAt, updatedBy }` (`counts`: live rows by status; `excluded` = active, non-group people excluded in `CalendarSyncUser`, on the provider their override or email domain points to, whether or not they ever had a row) |
| PUT | `/providers/:provider` | `{ enabled?, serviceAccountKey? (google: the key file's JSON text, ≤ 10 KB, write-only; `type` service_account, `client_email`, numeric `client_id`, RSA `private_key`; the key's `token_uri` is ignored), clientId? (microsoft, zoom), clientSecret? (microsoft, zoom; ≥ 8 chars; omitted = keep), webhookSecret? (zoom), clientSecretExpiresOn? (YYYY-MM-DD \| null; microsoft, zoom), settings? (google `{ domains }`, microsoft `{ tenantId (GUID or tenant domain), domains }`) }` → `ProviderAdminDto`. Domains: company domains only (400 on `settings.domains`), at most one provider per domain (409 `DOMAIN_IN_USE`). Any credentials change (key, client id, secret, tenant) bumps `clientVersion` (old in-memory tokens are never reused) and clears `lastTest`, `appTested` and health. Switching on needs complete credentials (409 `INTEGRATION_NOT_CONFIGURED`) and a passing app-level test since the last credentials change (409 `INTEGRATION_NOT_TESTED`); Zoom can't be switched on before Phase 3 (409 `INTEGRATION_NOT_AVAILABLE`); a secret without the encryption key: 503 `INTEGRATIONS_NOT_READY`. After the save everyone is reconciled (enrolled / stopped to match). Audited `IntegrationProvider` CREATE / UPDATE with `secretChanged` / `serviceAccountKeyChanged: true` and the key's non-secret summary, never the secret or key |
| DELETE | `/providers/:provider/secret` | → `ProviderAdminDto`: secrets / key removed, provider switched off, its live rows stopped (`provider_removed`; audited `secretCleared`) |
| POST | `/providers/:provider/test` | `{ asUsername? }` → `{ ok, code, message, steps: [{ step: app\|user, ok, code, message }], testedAt }` with the **saved** credentials. Step `app`: Google signs a JWT for the service account itself (no `sub`) and exchanges it (proves the key); Microsoft requests a client-credentials token and reports the `roles` it carries (none is expected with RBAC for Applications; a list without `Calendars.ReadWrite` is flagged). Step `user` (when `asUsername` names a person with a company email): mints as that person (Google `sub`) and reads one event from their primary calendar (Google `calendars/primary/events`, Graph `/users/{mailbox}/events?$top=1&$select=id`), proving delegation / the app's scope. `asUsername` must be someone this provider would sync: active, not a group login, not excluded, a company email, and not on the other provider by override or domain (a domain no provider claims yet is allowed); otherwise 409 `CALENDAR_TEST_NOT_ALLOWED` (on `asUsername`) and nothing is called; unknown user 404. Every test with `asUsername` is audited `IntegrationProvider TEST_AS_USER` (SECURITY, NOTICE; `changedBy` = the admin, `{ asUsername, ok, code, userStep }`, never a token; as of 2026-11-26, P2-2b review fixes). `code` is a fixed `TokenErrorCode` (`delegation_missing`, `delegation_wrong_id`, `scopes_not_authorised`, `admin_policy`, `key_invalid`, `clock_skew`, `invalid_client`, `secret_expired`, `app_not_in_tenant`, `tenant_not_found`, `no_application_permission`, `user_not_found`, `user_unavailable`, `calendar_unavailable`, `mailbox_out_of_scope`, `no_mailbox`, `rate_limited`, `provider_unavailable`, `network`, `provider_error`, `not_configured`) or a success / setup code: `key_ok` (Google app step), `credentials_ok` (Microsoft app step), `delegation_ok` / `mailbox_ok` (user step), `no_email` (the person has no company email), `not_available` (zoom), `credentials_changed` (credentials saved or removed while the probe ran: not stored, test again). Stored as `lastTest` (and `appTested` when step `app` passed) only while the credentials are unchanged. A provider health `error` goes back to `ok` only when the test proves that problem fixed: a passing `user` step clears any code; a passing `app` step alone clears only the key / client codes (Google `key_invalid`, `clock_skew`; Microsoft `invalid_client`, `secret_expired`, `tenant_not_found`, `app_not_in_tenant`; `not_configured`), never delegation, scope, policy or `no_application_permission`. 6 / min per admin (§3) |
| PUT | `/settings` | Partial `{ companyDomains (1–10), followUpReminder (activity reminder label \| null), backfillDays: 30\|60\|90, eventVisibility: private\|default, followUpActivities, allowMeetingImport, importFollowupType }` → the whole settings. Stored as the module setting `activities/calendarSync` through Form Customization (validated, audited `ModuleSetting UPDATE`, form-config cache dropped). Removing a company domain still on a provider's list: 409 `DOMAIN_IN_USE`. `importFollowupType` must be an active Followup Type option other than Task / Note that is ticked under What goes to calendars (`meta.calendarSync`), checked when it changes and on every save while `allowMeetingImport` is on (so import can't be turned on with a type that stopped going to calendars); else 400 `VALIDATION_ERROR` on `importFollowupType` (P2-8, as of 2026-11-27). Everyone is reconciled after a save that changed the company domains |
| PUT | `/sync-types` | `{ "<Followup Type>": boolean }` → `syncTypes`. Option meta `calendarSync` on `shared_followup_type` (missing = on); Task / Note refused (400). Audited as option updates |
| PUT | `/video-types` | `{ "<Followup Type>": boolean }` → `syncTypes`. Option meta `videoMeeting` (offers the Video meeting field on the activity form; missing = off; seeded on Meeting and Demo / Presentation); Task / Note refused (400). Audited as option updates. Calendar Phase 3 P3-1, as of 2026-11-26 |
| GET | `/people` | `?search&issue=any\|missing\|duplicate\|not_company\|calendar_problem` → active, non-group users `[{ username, fullName, department, role, email, emailIssue: missing\|duplicate\|not_company\|null, calendar: { target: { provider, email, source: domain\|override } \| null, reason: no_email\|not_company\|no_provider\|excluded\|inactive\|group \| null, connection: { id, provider, accountEmail, status: pending\|ok\|error, statusReason (the user-level code while `error`), source, enrolledAt, lastSuccessAt, lastCheckedAt, nextCheckAt, lastErrorMessage (admin sentence + short provider text, only while `error`), webhook (P2-7: `{ status: active\|failed\|waiting, expiresAt }` for an `ok` row while webhooks are live, else null) } \| null, choice: { provider, excluded, note, importMeetings } \| null } }]`. Never a token (there are none) |
| PUT | `/people/:username/email` | `{ email (required; `''` or `null` clears), allowOtherDomain? }` → the person row; a body without `email` is 400 `VALIDATION_ERROR`. `modules/users/userEmail.service.ts` (also used by Admin › Users): trimmed and lower-cased; unique among active non-group users (409 `DUPLICATE_RECORD` on `email`, naming the holder); a company domain unless `allowOtherDomain` (400 on `email`); audited `User UPDATE`; drops `cache:lookups:users*`. Since P2-2b the change is always allowed: after commit the person is reconciled (the old mailbox's row stops with `email_changed`, a new one is enrolled; P2-2's `EMAIL_CONNECTED` is gone) |
| PUT | `/people/:username/calendar` | `{ provider? (google\|microsoft\|fake\|null = by email domain; fake only while `CALENDAR_FAKE_PROVIDER` is on), excluded?, note? (≤ 200, `''` / `null` clears), importMeetings? (boolean; P2-8, as of 2026-11-26: "Import customer meetings", admin-only, no self-service) }` (strict) → the person row. Turning `importMeetings` on while the company switch `allowMeetingImport` is off: 409 `MEETING_IMPORT_OFF` (on `importMeetings`); turning it off is always allowed. Stored in `CalendarSyncUser` (a row only while something differs from the default; audited `CalendarSyncUser` CREATE / UPDATE / DELETE); the person is reconciled at once (excluded → live row stopped `excluded`; events already in the calendar stay). Unknown user → 404 |
| POST | `/people/:username/calendar/check` | → the person row + `{ check: ok\|user_error\|provider_unhealthy\|transient\|skipped }` ("Check now": mints a token as the person and reads their calendar; updates the row's status). 409 `CALENDAR_NOT_SYNCED` without a live row; the test rate limit (6 / min per admin) |
| POST | `/people/:username/calendar/sync` | → the person row + `{ sync: { status: queued\|done\|recent\|busy\|not_ready\|failed\|off, changed?, lastSyncedAt } }` ("Sync now", P2-5, as of 2026-11-26: the person's calendar changes come back now; same rules as `POST /api/calendar-connections/sync`, reason `admin`, ≥ 30 s apart). 409 `CALENDAR_NOT_SYNCED` without a live row; the test rate limit (6 / min per admin) |

Removed in P2-2b: `GET /connections` and `POST /connections/:id/disconnect` (the People table covers both; to stop
someone's sync, exclude them).

**Users** — `/admin/users` 🔐 (Admin › Users, Profile Phase 2; `backend-crm/src/modules/user-admin/userAdmin.routes.ts`,
route header comment = source of truth). Roles with the admin panel only (`requireAdmin`). Bodies are strict (an unknown
key is `400 VALIDATION_ERROR`). Every write is audited as the acting admin (entity `User`, id = the user's id): `CREATE`
(a snapshot without any password or hash), `UPDATE` (diff), `STATUS_CHANGE` (`isActive`), `INVITE_SENT` (SECURITY,
NOTICE: `{ purpose, email: sent|failed|skipped, expiresAt }`, never the token); writes drop `cache:lookups:users*`
(`invalidateUserCaches`) and take the per-user lock `user:id:<id>` (shared with My Profile; the People screen's email
write, `PUT /admin/integrations/people/:username/email`, doesn't take it, so `PATCH` writes only the columns that
change and never writes back a column it left alone). `role` must be one of the roles of Admin › Roles (matched by
`normalizeRole`, any case / dash / spacing, and stored with the role's spelling; any other name is `400 VALIDATION_ERROR`
on `role`). What a role allows is set in Admin › Roles (below). A typed department that matches an existing one (any
case) is stored with the existing spelling.
There are no temporary passwords: a new user sets their own from the emailed link (§2.1 Set-password links), and an
admin never sees or types anyone's password.

`AdminUserDto`: `{ id, username, fullName, firstName, lastName, email, role, roleAccess: admin\|all-records\|own-records\|custom
(admin panel first, then every action on every record, then own records as the default role gives them, else custom), department, jobTitle, reportsTo: { id, name, isActive } \| null,
directReportsCount (active), mobile, officePhone, photoUrl, isActive, isGroupUser, onLeave, outOfOffice: { from, to,
message } \| null, invitePending, invite: { purpose: invite\|reset, sentAt, expiresAt, expired } \| null, lastLoginAt, passwordChangedAt, lockedUntil, failedLoginCount, createdAt, createdBy, deactivatedAt, emailIssue:
missing\|duplicate\|not_company\|null }` (`lockedUntil`: set only while the account is locked after too many wrong passwords, shown as **Locked**) (`invitePending`: added and not yet signed in through their link, shown as **Invited**; `invite`: the newest link not
used or revoked (an expired one stays, `expired: true`, so the list can say "Invite expired"); `emailIssue` as on the People table, only for active non-group users; `null` for
the others; `outOfOffice` is set by the user in My Profile, read-only here, `null` when unset or ended).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | `?search&status=active\|inactive\|all (default active)&role&department&page&pageSize (≤ 100, default 25)` → `{ success, data: AdminUserDto[], meta: { total, page, pageSize } }`, by `fullName`, `username`. `search` looks in name, username, email, job title, department and role; `role` / `department` are exact (case-insensitive). Bad values fall back to the defaults |
| GET | `/meta` | `{ roles: [{ id, name, access, adminPanel, allRecords, userCount, inactiveUserCount }], departments: [{ name, userCount }], managers: [{ id, name, username, photoUrl }], companyDomains }`. Roles = every role of Admin › Roles, Super Admin first, then by name (users counted by `normalizeRole`); departments = every stored one; `userCount` counts active users, `inactiveUserCount` (roles only) inactive ones (the list's Role filter offers the roles held in the chosen status). `managers` = active non-group users. `adminPanel` / `allRecords` are separate: a role can open the admin panel and still see only its own records |
| GET | `/:id` | `AdminUserDto`; `404` "User not found." |
| POST | `/` | `{ username, firstName, lastName?, email, allowOtherDomain?, role, department?, jobTitle?, reportsToId?, mobile?, officePhone?, isGroupUser? }` → `201 { user: AdminUserDto, invite: { status: sent\|failed\|mail_disabled, purpose, sentTo, expiresAt?, error? } }`. `username` trimmed and lower-cased, 3–50, `^[a-z0-9][a-z0-9._-]*$`, not a reserved name (`system`, the actor background jobs and seeds write) (`modules/user-admin/username.ts`, contract-tested with `frontend-crm/src/utils/username.ts`), unique case-insensitively (`409 DUPLICATE_RECORD` on `username`), never changes afterwards. Names / phones as My Profile (`formatPersonName`, E.164, "First and last name together cannot exceed 99 characters."). `role` ≤ 50 (required), `department` ≤ 50, `jobTitle` ≤ 100 (inner spaces collapsed). Email: **required** ("Work email is required: the invite to set a password is sent there."), the company email rule (`users/userEmail.service.ts`): company domain unless `allowOtherDomain` (400 on `email`), unique among active non-group users (409 on `email`). The user is stored active with `invitePending: true` and an unusable password hash, `createdBy` = the admin; after commit the invite email is sent (§2.1 Set-password links). The user is created even when the email can't be sent: `invite.status` is then `failed` (with the mail server's reason) or `mail_disabled`, and the UI says so and offers to try again |
| PATCH | `/:id` | `{ firstName?, lastName?, email?, allowOtherDomain?, role?, department?, jobTitle?, reportsToId?, mobile?, officePhone?, isGroupUser?, onLeave? }` → `AdminUserDto` (keys left out stay; `''` / `null` clears an optional one; no change → no audit entry). `reportsToId`: an existing, active, non-group user, not the user, not anyone below them (chain walked up to 50 levels) → else `400 INVALID_MANAGER` on `reportsToId`; an unchanged manager is kept even if inactive. Taking admin access away: `400 SELF_LOCKOUT` (your own) / `400 LAST_ADMIN` (the only active admin), on `role`. Super Admin users and the Super Admin role are managed only by a Super Admin (`403 SUPER_ADMIN_ONLY`, also on create, deactivate, activate and send-invite). A changed email revokes the user's outstanding set-password links. A changed email (or a group login becoming a normal user) goes through the email rule; the user's calendar sync follows the new address after commit (Calendar P2-2b, as of 2026-11-26: no more `EMAIL_CONNECTED`); activation and deactivation reconcile the user's calendar sync too. A **role change signs the user out** of every tracked session (their token carries the role) and the answer adds `signedOutSessions` (`null` when Redis is down); the acting admin's own sessions are left alone (their new role applies at next sign-in) |
| POST | `/:id/deactivate` | → `AdminUserDto & { signedOutSessions }`: `isActive = false`, `deactivatedAt` = now, every tracked session revoked (`null` when Redis is down). Records, username and direct reports stay (their `reportsTo.isActive` turns false). `400 SELF_LOCKOUT` (your own account) / `400 LAST_ADMIN`. Already inactive: no change, no audit entry, but the sessions are revoked again (the UI's **Sign out all sessions** for an inactive user, to retry a revocation that failed while Redis was down) |
| POST | `/:id/activate` | → `AdminUserDto & { signedOutSessions: null }`: `isActive = true`, `deactivatedAt = null`. `409 DUPLICATE_RECORD` on `email` when another active non-group user took the address meanwhile. Already active: no change |
| POST | `/:id/unlock` | **Unlock account** (row menu, shown while Locked) → `AdminUserDto & { unlocked }`: clears `lockedUntil`, `failedLoginCount` and `lastFailedLoginAt` so the user can sign in at once; audited `ACCOUNT_UNLOCKED` (`{ wasLocked, lockedUntil, failedAttempts }`). Nothing to clear: no change, `unlocked: false`. `403 SUPER_ADMIN_ONLY`; `404` |
| POST | `/:id/send-invite` | → `{ user: AdminUserDto, purpose: invite\|reset, sentTo, expiresAt }`: emails a new one-time set-password link (72 h) and revokes the older ones. `purpose` is `invite` while the user is Invited (**Resend invite**, also after a link expired), else `reset` (**Send password reset link**: the current password keeps working until the link is used; using it signs the user out everywhere). `400 BAD_REQUEST` for your own account ("Change your own password from My Profile › Security."); `400 USER_INACTIVE` (activate first); `400 NO_EMAIL` on `email`; `502 INVITE_EMAIL_FAILED` / `503 MAIL_DISABLED` "The email to <address> could not be sent: <reason>" (no new link is kept, the older one still works); 20 / 10 min per admin (§3) |

**Calendar connections** — `/calendar-connections` (any signed-in user, own status only, read-only; Calendar Phase 2
P2-2b, admin-managed, as of 2026-11-26; `backend-crm/src/modules/calendar-sync/connection.routes.ts`, route header
comment = source of truth). Admins connect the company once on Admin › API Integrations; every active, non-group user
with a company email on a provider's domains is enrolled automatically. There is nothing to connect or disconnect.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | `{ ready (a calendar provider is on and usable), calendar: null \| { provider: google\|microsoft\|fake, providerLabel, accountEmail, status: pending\|ok\|error\|paused (the provider has an app-level problem), since, lastSyncedAt, backfill: { state: waiting\|done\|off, at, copied, sending } (the first-sync copy of upcoming CRM activities, as of 2026-11-26, P2-3c: `waiting` until it finished; `copied` activities (every run's copies) at `at` (the run stamp, when it started); `off` = not done and `CALENDAR_SYNC_ENABLED=false`, nothing is being copied; `sending` = this calendar's changes still waiting to be sent) }, reason: null \| no_email\|not_company\|no_provider\|excluded\|inactive\|group, syncHours: { start: 'HH:MM', end: 'HH:MM', everyMinutes } }` (`syncHours`: when calendar changes come back by themselves, P2-5); `Cache-Control: no-store`. Same for every role, the caller only. Never an error code or provider text (admins see those on People) |
| POST | `/sync` | `{ reason?: manual\|page }` (strict; default `manual`) → `{ status: queued\|done\|recent\|busy\|not_synced\|not_ready\|failed\|off, changed?, lastSyncedAt }` (P2-5, as of 2026-11-26): pulls the caller's own calendar changes now. Only a row in `ok` pulls; `recent` within 30 s (`manual`) / 3 min (`page`, the silent pull when the calendar page opens) of the last pull or request; `queued` = a `pull` job (Redis up; only a still-pending pull of the same 10 s absorbs the request, one that already started or finished never does, as of 2026-11-27), `done` = pulled in the API process while Redis is down (`changed` = activities changed). Never an error code or provider text. 429 `RATE_LIMITED` over 6 / min per user (in-process counter while Redis can't count) |

Removed in P2-2b: `POST /:provider/start`, `GET /oauth/:provider/callback` (and the `crm_oauth` cookie), `POST /:id/disconnect`
(`connection.routes.test.ts` keeps them gone).

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
| GET | `/users?from&to` | Users tab: `{ from, to, users: [{ username, name, role, department, email, status, onLeave, outOfOffice, isGroupUser, photoUrl, lastLoginAt, lastLogin, lastActivityAt, lastActivity, lastActivityLabel, total, data, config, security, signIns, failedSignIns }] }`. Every user in the user list (inactive ones too; group accounts only once they have entries), `system` (background jobs) once it has entries, and any other username with entries in the range (`status`: `active` / `inactive` / `system` / `unknown`). `total` / `data` / `config` / `security` / `signIns` / `failedSignIns` count the range (default the last 30 days, max 366); `lastActivity*` is the user's newest entry any time (`lastActivityLabel` e.g. `Updated · Leads`), `lastLogin*` the user's last successful sign-in; `lastLogin` / `lastActivity` in the business timezone; `photoUrl` is `/api/user-photos/<id>` or null (always null for `system` / `unknown`); `outOfOffice` is `{ from, to, message }` (`YYYY-MM-DD`, inclusive) or null when unset or ended, the same shape and helper (`outOfOfficeOf`) as `/lookups/users` and Admin › Users: only the three UserPreference out-of-office columns are read, the client decides "active" against the business day, and it is always null for `system` / `unknown` (as of 2026-11-26). Most active first. A user's own entries are `GET /?user=<username>`; their report is `POST /exports` with that filter |
| GET | `/stats?from&to` | Summary strip: `{ from, to, today, failedSignIns24h, accessDenied24h, deletes7d, total, mostActiveUsers: [{ username, label, count }] (top 5, jobs left out), eventsPerDay: [{ date, total, data, config, security }] }`. `today` / `24h` / `7d` are fixed windows; the rest follow the range (default the last 30 days, max 366); every day of the range is listed, empty ones as 0 |
| GET | `/:id` | `{ entry, changes, fields, details, related, relatedCount }`: `entry` = list item plus `sessionId`, `httpMethod`, `route`, `userAgent`; `changes` = the stored JSON; `fields` = `[{ key, label, before, after }]` labelled from the form configuration (custom fields included; `before` null for a create, `after` null for a delete; values read as stored until company formats are saved, then `YYYY-MM-DD` days, date-times and amount-type fields follow the company formats; `details` and the undo preview likewise, exports never); `details` = `[{ key, label, value }]` for everything else the entry recorded (sign-in IP, refused path, import counts, reason, follow-up); `related` = the first 100 other entries of the same request (`relatedCount` = all of them; filter `requestId` for the rest); `actions` = `{ undo, restore }`, each `{ available, reason? }` or null when the entry doesn't offer it; `reversedBy` / `reverses` = the REVERT / RESTORE entry that undid this one, or the entry this one undid (list items, or null). 404 when there's no such entry |
| GET | `/:id/undo` | Undo preview of an UPDATE / STATUS_CHANGE of a CRM record (the 11 record modules: leads, contacts, organizations, opportunities, quotations, products, tickets, contracts, activities, partner companies, referrals): `{ id, canUndo, fields: [{ key, label, from, to, current, status, reason? }] }` (values as shown on screen). `status`: `ready` (still holds the entry's `to`, can be put back), `conflict` (changed again since), `already` (already holds the earlier value), `blocked` (not editable through the record's update, e.g. a system field). `reason` explains a block (as of 2026-11-26, P2-4): an activity's `lockedFields` (a follow-up activity's type, times, status, owner, related record, with `startDay` / `endDay` / `relatedCode`) are blocked ("A follow-up activity follows its lead / opportunity: change it on the record"), and every field of a Lead / Opportunity entry written by calendar sync (route `job:calendar-sync…`, P2-5) is blocked; other fields of the entry stay undoable. 409 `NOT_UNDOABLE` (any other entry, incl. CONVERT, IMPORT and Form Customization) or `ALREADY_REVERSED`; 404 when the record is deleted or gone |
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

**Booking links** — `/booking-links` (signed in; Calendar Phase 4, as of 2026-11-26; `backend-crm/src/modules/booking-links/bookingLink.routes.ts`, route
header comment = source of truth). An employee's public scheduling pages (`/book/<slug>`). Owner or admin only: another
user's link is `404`. The company switch (`ModuleSetting activities/bookingLinks`, default **off**) must be on to create or
change a link; `{ isActive: false }` alone always works. `whoCanCreate`: `everyone` | `managers` (global-access roles and
admins) | `admins`; admins can always create a link for an active, non-group colleague (`ownerUsername`). Writes audited
`BookingLink` CREATE / UPDATE (module `booking-links`).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/access` | `{ enabled, canCreate, isAdmin, whoCanCreate, ownsLinks }` (`ownsLinks`: the user owns at least one link, active or not; as of 2026-11-26 review fix). The user menu shows "Booking links" when `(enabled && (canCreate \|\| isAdmin)) \|\| ownsLinks`; `Cache-Control: no-store`. `GET /` returns the same `access` |
| GET | `/` | `?scope=mine\|all` (`all`: admins, else 403) → `{ access, links: BookingLinkDto[] }`, active first, newest first, at most 500. `BookingLinkDto` = `{ id, slug, path ('/book/<slug>'), ownerUsername, ownerName, title, followupType, durations, slotStepMinutes, location, videoMeeting (meet\|teams\|null, as of 2026-11-27), note, availability, bufferBeforeMinutes, bufferAfterMinutes, minNoticeMinutes, horizonDays, maxPerDay, reminder, askPhone, askCompany, relatedModule, relatedId, relatedCode, relatedLabel, isActive, bookings: { total, upcoming, lastBookedAt }, ownerCalendar: synced\|not_connected\|error, createdBy, createdAt, updatedAt }` |
| POST | `/` | `{ title, ownerUsername? (admins), followupType? (an active Followup Type, not Task / Note; default Meeting), durations? (1–4 of 10–240 min in 5-min steps, first = default; [30]), slotStepMinutes? (15\|30\|60), location?, videoMeeting? (meet\|teams\|null; '' = null; Zoom refused: the default video meeting of booked meetings, as of 2026-11-27: the type must offer video, `400 VALIDATION_ERROR` on `videoMeeting`, and the **owner's** company calendar must create that kind of link, `409 VIDEO_PROVIDER_NOT_CONNECTED`; the dialog lists the choices from `GET /api/activities/video-options?owner=<owner>`), note?, availability? ({ "1".."7": [{ start: 'HH:mm', end: 'HH:mm'\|'24:00' }] }, ≤ 3 sorted non-overlapping ranges a day, ≥ 1 in the week; default Mon–Fri 10–13 and 14–18), bufferBeforeMinutes? / bufferAfterMinutes? (0–120; 0 / 10), minNoticeMinutes? (0–20160; 240), horizonDays? (1–60; 30), maxPerDay? (1–50 or null), reminder? (an activity reminder or null; '15 minutes before'), askPhone?, askCompany?, relatedModule? + relatedId? (both or neither; a record the caller can access), isActive? }` → `201 BookingLinkDto`; the slug is generated (`<first name>-<title>-<8 random chars>`, never typed, never reused). Strict body |
| PUT | `/:id` | Any subset of the POST fields except `ownerUsername` → `BookingLinkDto`. `videoMeeting` is checked again (same `400` / `409`) only when the save changes it or the type; re-saving the stored value passes even if the owner's calendar or the type's video switch changed since (bookings then go without a link and say why in the activity's remarks), and clearing it always works (as of 2026-11-27). Every save changes `updatedAt`, the link version signed into slot tokens, so times shown before the edit can no longer be booked |
| POST | `/:id/new-address` | A new random slug; the old address answers 404 at once → `BookingLinkDto` |
| GET | `/:id/bookings` | Latest 50 bookings, newest first: `[{ id, activityId, activityStatus (or 'Deleted'), start, end, visitorName, visitorEmail, visitorPhone, visitorCompany, contactId, createdAt }]` |
| GET | `/settings` | Admins: `{ enabled, whoCanCreate }` |
| PUT | `/settings` | Admins: `{ enabled?, whoCanCreate? }` → settings (written through `formConfigService.updateModuleSetting`, audited as a form-config change; the public link cache is dropped so "off" is immediate) |

Errors: `409 BOOKING_LINKS_OFF`, `403 BOOKING_LINKS_NOT_ALLOWED` (role), `409 BOOKING_LINK_LIMIT` (20 links per person, active
or not), `400 VALIDATION_ERROR` (`errors[].path` = field; `availability.<weekday>`), `409 VIDEO_PROVIDER_NOT_CONNECTED`
(`errors[].path` `videoMeeting`, as of 2026-11-27).

**Roles** — `/admin/roles` 🔐 (Admin › Roles; `backend-crm/src/modules/roles/role.routes.ts`, route header comment =
source of truth). Roles with the admin panel only (`requireAdmin`). Bodies are strict. Writes are audited (entity
`Role`, admin-only in the audit log), refresh the role registry at once (a changed role applies on the holders' next
request, without signing anyone out) and drop `cache:lookups:users*`.

`RoleDto`: `{ id, name, description, adminPanel, isSystem, permissions, access: admin\|all-records\|own-records\|custom,
userCount (active), inactiveUserCount, createdAt, createdBy, updatedAt, updatedBy }`. `permissions` =
`{ <module>: { <action>: all\|group\|own\|none } }` for leads, contacts, organizations, opportunities, quotations, contracts,
tickets, referrals, activities, documents (view only), products and partnerCompanies (no owner: `all` / `none`;
partner companies also have `export`); actions view, create, edit, delete, export, import (create / export / import:
`all` = Yes, `none` = No). Sent permissions are normalized (`roles/permissions.ts`, contract-tested with
`frontend-crm/src/utils/permissions.ts`): a missing value is `none`, Edit / Delete never exceed View, a module at View
`none` allows nothing.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | `RoleDto[]`, Super Admin first, then by name |
| GET | `/:id` | `RoleDto`; 404 |
| POST | `/` | `{ name (≤ 50, required), description? (long text, no limit), adminPanel?, permissions }` → `201 RoleDto`. `409 DUPLICATE_RECORD` on `name` when another role has the name by `normalizeRole` |
| PATCH | `/:id` | `{ name?, description?, adminPanel?, permissions? }` → `RoleDto`. A rename renames the role on every user holding it. `400 SYSTEM_ROLE` (Super Admin can't be changed); `400 SELF_LOCKOUT` (turning off the admin panel of your own role) / `400 LAST_ADMIN` (no active user would keep the admin panel), on `adminPanel`; 409 / 404 |
| DELETE | `/:id` | `?reassignTo=<role id>` → `{ id, movedUsers }`. The role's users (active and inactive) move to `reassignTo` in the same transaction (their sessions are not signed out: the new role applies on their next request). `400 ROLE_IN_USE` when the role has users and no `reassignTo`; `400 VALIDATION_ERROR` on `reassignTo` (unknown, or the role itself); `403 SUPER_ADMIN_ONLY` when someone other than a Super Admin moves users to Super Admin; `400 SELF_LOCKOUT` / `LAST_ADMIN` when the move takes the admin panel from you / everyone; `400 SYSTEM_ROLE`; 404 |

**Enforcement.** Every module route checks the caller's role: `registerCrudRoutes(router, controller, module)` maps
`GET` → view, `POST` → create, `PUT` / `PATCH` → edit, `DELETE` and `POST /bulk-delete` → delete
(`requirePermission(module, action)`: `403` "Your role doesn't allow you to <action> <Module>."). At **Own**, lists are
scoped to records the user is assigned to or created; at **Group**, to records assigned to or created by anyone in the
user's security groups (and their sub-groups); a record outside it is `403` (`assertRecordAccess`; also
for edit and delete); at **None** the route is `403`. Custom routes follow the same actions (lead convert: leads edit
and opportunities create; organization bulk status: edit; activity calendar: view; calendar retry and send-invites:
edit). Imports need Import and Create on the target module. Global search hides the categories the role can't view.
Admin features use `requireAdmin` (the role's admin panel switch) instead of a list of role names.

**Security Groups** — `/admin/security-groups` 🔐 (Admin › Security Groups;
`backend-crm/src/modules/security-groups/securityGroup.routes.ts`, route header comment = source of truth). Roles with
the admin panel only. Bodies are strict. Writes are audited (entity `SecurityGroup`, admin-only in the audit log) and
refresh the role registry at once, so a changed group applies to its members' next request (other API instances
within 15 s). A role's **Group** level reads these groups.

`SecurityGroupDto`: `{ id, name, description, parentId, parentName, isActive, members: [{ id, username, name, role,
isActive }], subGroupCount, createdAt, createdBy, updatedAt, updatedBy }`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | `SecurityGroupDto[]` by name |
| GET | `/users` | Member picker: every user `{ id, username, name, role, isActive, groups: string[] }`, active first |
| GET | `/:id` | `SecurityGroupDto`; 404 |
| POST | `/` | `{ name (≤ 100, required), description? (long text), parentId?, memberIds? }` → `201 SecurityGroupDto`. `409 DUPLICATE_RECORD` on `name` (any case); `400 VALIDATION_ERROR` on `parentId` (unknown) / `memberIds` (unknown user) |
| PATCH | `/:id` | `{ name?, description?, parentId?, isActive? }` → `SecurityGroupDto`. `isActive: false` archives (keeps members, grants nothing). `400 GROUP_CYCLE` on `parentId` when the parent is the group or one of its sub-groups; 409 / 404 |
| PUT | `/:id/members` | `{ memberIds }` → `SecurityGroupDto`; replaces the member list (audited as `membersAdded` / `membersRemoved`); 400 / 404 |
| DELETE | `/:id` | `{ id }`; memberships go with it, records stay with their owners. `400 HAS_SUB_GROUPS` while groups sit under it; 404 |

**Email logging** — `/email-logs` (signed in) and `/admin/email-logging` (roles with the admin panel, `requireAdmin`)
(Calendar Phase 4, spec §17, as of 2026-11-27 with the review fixes; `backend-crm/src/modules/email-log/emailLog.routes.ts` and
`emailLogAdmin.routes.ts`, route header comments = source of truth). Emails between enrolled employees and CRM contacts /
leads (and those contacts' opportunities) are logged automatically from the company mailboxes; see
[system design › Email logging](system-design.md) for who is logged, matching and privacy. Only metadata and a short
plain-text snippet are returned: never a body, HTML, an attachment or Bcc. **Visibility** (company setting): `restricted`
(default) = the record's owner and global-access roles (managers, admins) see every email logged on a record they can
open, everyone else who can open it sees only the emails they took part in (their mailbox holds a copy); `record` =
everyone who can open the record sees all of them. "Open in Gmail / Outlook" (`openLink`) is set only on the caller's own
copy. `participants` lists the employees whose mailbox holds the email as sender, To or Cc; a copy received as Bcc or
through a list is listed only to that employee (a Bcc is never revealed). While "Keep a short snippet" is off, `snippet`
is always null (snippets kept from before are cleared). While the company switch is off the record list is empty
(`enabled: false`) and the drawers hide the Emails tab.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/email-logs` | `?module=contacts\|leads\|opportunities&recordId&page (1)&limit (20, ≤ 50)` → `{ enabled, visibility, seesAll, total, page, limit, items: [{ id, subject, from: { email, name? }, to: [], cc: [] (≤ 25 kept together), moreRecipients, sentAt, direction: in\|out, snippet (plain text, ≤ 500) \| null, hasAttachments, provider, participants: [{ username, name }], openLink: { provider, url } \| null }] }`, newest first (`sentAt`). `404` record missing or deleted, `403` no access to the record (the usual record rules). `Cache-Control: no-store` |
| GET | `/email-logs/me` | The caller's own status, read-only (employees have no switch): `{ companyEnabled, logging, reason: server_off\|company_off\|user_inactive\|person_off\|not_synced\|null, provider, accountEmail, status: idle\|ok\|error\|null, lastSuccessAt, storeSnippets, retentionMonths, visibility }` (no error text: admins fix problems) |
| GET | `/admin/email-logging` | `{ settings, serverEnabled (EMAIL_LOG_ENABLED), pollMinutes, scopes: { google (gmail.readonly), googleAdminConsole (the full comma-delimited DWD list: the two calendar scopes + gmail.readonly), microsoft ('Mail.Read') }, providers: [{ provider, label, problem: { code, message, at } \| null, people, mailboxes: { ok, error } }], counts: { people, emails } }`. `problem` = the newest app-level mail error (missing scope / permission) newer than the provider's last successful mail run |
| PUT | `/admin/email-logging/settings` | `{ enabled?, defaultForPeople?: on\|off, visibility?: restricted\|record, retentionMonths?: 6\|12\|24\|36, storeSnippets? }` (at least one; strict) → settings (plus the read-only stamps `enabledAt`, `defaultOnAt`: ISO \| null, set by the server when the switch / the default for people turns on; a body can't set them). Written through `formConfigService.updateModuleSetting('activities', 'emailLogging')` (audited as a form-config change; reaches every client in the form configs). Side effects: switch on → nothing from before `enabledAt` is logged; switch off → every mailbox cursor is cleared (default for people off → the cursors of people on the default), so switching on again starts from a fresh baseline instead of catching up; snippets off → stored snippets are cleared (≤ 20 × 500 at once, the nightly finishes the rest) |
| GET | `/admin/email-logging/people/:username` | `{ username, fullName, mode: on\|off\|null (null = company default), effective, companyDefault, logging, reason, mailbox: { provider, accountEmail, status, errorLevel: user\|app\|null, lastErrorCode, lastErrorMessage, lastRunAt, lastSuccessAt, nextRunAt, loggedCount, purgedAt } \| null, copies }`; `404` unknown user |
| PUT | `/admin/email-logging/people/:username` | `{ mode: on\|off\|null }` (strict) → person. Audited `LoggedEmailMailbox` CREATE / UPDATE `{ username, mode: { from, to } }` (module `admin-integrations`); unchanged mode writes nothing. When the person's effective switch turns on: `loggingSince` = now (nothing from before is logged) and the mailbox is due at the next tick; when it turns off: the cursor is cleared |
| POST | `/admin/email-logging/people/:username/run` | "Log now" → person + `run: { status: 'queued' }` (Redis up: a job on the calendar sync queue) or `{ status, logged, copies }` (no Redis: run inline, bounded). `409 EMAIL_LOGGING_OFF` while the person isn't logged; 6 / min per admin → `429 RATE_LIMITED` + `Retry-After` |
| DELETE | `/admin/email-logging/people/:username/emails` | Purge: first takes the person's mailbox lease and sets `purgedAt` (clearing the cursor), then deletes the person's copies and every email left without a copy (bounded batches, outside a transaction), frees the lease → `{ copies, emails }`. Audited `LoggedEmailMailbox PURGE` `{ username, copies, emails }` (NOTICE) after the lease is freed. A run that was working removes what it stored; mail from before `purgedAt` is never logged again for this person. Emails another enrolled employee also holds stay. The person's switch is unchanged (turn it off to stop new logging) |

Errors: `400 VALIDATION_ERROR`, `404`, `409 EMAIL_LOGGING_OFF`, `429 RATE_LIMITED`. Mail provider problems never fail a
request: they show on the mailbox (`lastErrorCode`: `mail_scope_missing`, `mail_permission_missing`, `mailbox_out_of_scope`,
`mail_unavailable`, `no_mailbox`, `provider_error`, …) and the provider's `problem`.

**Public booking page** — `/public/booking` (**no sign-in**; Calendar Phase 4, as of 2026-11-26;
`bookingLink.public.routes.ts`). Mounted before the global body parser with its own **16 KB** JSON limit; every answer
`Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`. CORS, helmet and CSP are unchanged (the page `/book/<slug>`
is served from the app's own origin). **One 404** (`NOT_FOUND`, the same message) for a malformed slug (checked before any
read), a missing or turned-off link, the company switch off, or an owner who is inactive or a group login, so links and
people can't be enumerated. Only the link's public fields and **free start times** leave the server: never busy blocks,
subjects, usernames, emails or the owner's calendar status.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/:slug` | `{ slug, title, ownerName, typeLabel, durations, defaultDuration, location, videoMeeting, note, askPhone, askCompany, timeZone, firstDay, lastDay }` (days `YYYY-MM-DD` in the business zone). `videoMeeting` = `{ provider: meet\|teams, label }` when the link has one and its type still offers video, else `null` (as of 2026-11-27): from the link and the type's settings only, never the owner's calendar status; the page says "Google Meet link: sent by <owner>". 60 / min / IP |
| GET | `/:slug/slots` | `?from=YYYY-MM-DD&days=1..14 (7)&duration=<an offered duration>` → `{ timeZone, duration, days: [{ date, slots: [{ start, token }] }], firstDay, lastDay, prevFrom, nextFrom }`. A start is offered when it is on the step grid inside a range of that weekday, after now + minimum notice, before now + horizon, not on a company holiday, the day is under `maxPerDay` (planned / completed bookings of this link), and `[start − bufferBefore, end + bufferAfter)` overlaps no busy block of the owner (P2-6 `busyTimes` with the owner as requester: CRM activities + company calendar; busy times are read in fixed Monday-aligned 14-day blocks covering the asked days, never the asked window itself, so every visitor of a link shares the same few reads and cache keys; provider calls on the per-link budget `booking:<linkId>`). `token` = signed slot token (system design §3.6, Public booking pages), good for 30 min. `503 CALENDAR_UNAVAILABLE` when the owner's company calendar status is `error` / `unavailable` (fail closed: no times rather than a double booking); `not_connected` = CRM activities only. 60 / min / IP (every request) and 3000 / min / link (counted only for a live link and a valid query) |
| POST | `/:slug/book` | `{ token, name (≤ 100, no < >), email (≤ 120, lower-cased), phone? (≤ 30, phone rule), company? (≤ 200), message? (≤ 1000), website? (honeypot, must be empty) }`, strict → `201 { booking: { id, title, typeLabel, ownerName, start, end, durationMinutes, timeZone, location }, video, ics }`. `video` (as of 2026-11-27) = `{ provider, label, joinUrl }` when the meeting has a Meet / Teams link requested, else `null`; `joinUrl` only when the link is already `ready` (allow-listed host, re-checked) at the time of this answer, which in practice means a resubmit after the push ran, else `null` and the page says "<label> link: sent by <owner>". The page never polls for it. The `.ics` carries the same line in `DESCRIPTION` (and `URL:` when ready). Video meeting: when the link has `videoMeeting`, its type still offers video and the owner's company calendar still creates that kind of link (one connection read, outside the transaction), the activity is inserted with `videoMeeting` (`conferenceState = requested`, so the P3-1 push asks for the link with the event); otherwise it is booked without one and its remarks get "No <label> link was requested: <why>" (the visitor's confirmation then has no `video`). Checks: honeypot (`400 BOOKING_REJECTED`), token signature / link version (`409 SLOT_UNAVAILABLE`); **a token that already booked** (its hash on a booking of this link) → that booking's confirmation again for the same email (case-insensitive), even after the token expired (a resubmit after a lost response), else `409 SLOT_UNAVAILABLE`, before any of the checks below (review fix, as of 2026-11-26); token expiry / offered duration (`409 SLOT_UNAVAILABLE`); only then is the per-link limit counted; the link's rules again (notice, horizon, holiday, hours, grid), the company calendar again (outside the transaction, on its own provider budget `booking-book:<linkId>`); then **one transaction under the per-owner lock `booking:owner:<username>`**: the token used before (a request racing the first one) → the same confirmation for the same email, else 409; the owner's CRM activities re-read through the transaction (`busyActivityWhere`, buffers included) → `409 SLOT_UNAVAILABLE`; `maxPerDay` re-counted → `409 BOOKING_DAY_FULL`; a live Contact with exactly that email (exactly one) is linked when the link has no (live) related record; the **Meeting activity** (`insertSystemActivity`: owner = link owner, `createdBy` = owner, actor `system`, `origin = 'booking'`, subject "<title> with <name>", the link's type / location / reminder / related record, the visitor as an `email` attendee, remarks "Booked online through …" + phone / company / message); the `BookingLinkBooking` row (`tokenHash` unique); the owner's `booking_created` notification. A unique violation aborts and the whole booking is retried once (D45). Audit: the activity's CREATE entry with route `public:booking`, the visitor's IP and user agent. No email is sent. 10 / hour / IP (every request) and 30 / hour / link (only valid, unused tokens: junk can't use up a link's quota) |

### 2.8 Calendar webhooks (`/webhooks`, no sign-in, signature-verified; P2-7)

As of 2026-11-26, Calendar Phase 2 P2-7; `backend-crm/src/modules/calendar-sync/webhook.routes.ts` (header comment =
source of truth) and `webhook.service.ts`. Called by Google and Microsoft, not by the web app. Mounted in `app.ts`
**before** the global cookie / JSON parsers with their own limits; every answer `Cache-Control: no-store`; no header
value, token, `clientState` or body is ever logged. The provider gets its answer at once (Graph needs it within 3 s,
validation within 10 s); the work runs right after it. Nothing is processed unless webhooks are live (`https`
`PUBLIC_API_URL`, `CALENDAR_WEBHOOKS_ENABLED`, `CALENDAR_SYNC_ENABLED`, encryption key set). Outside
`CALENDAR_SYNC_HOURS` change notifications are acknowledged and dropped without a database read (the morning poll
covers them); Graph lifecycle notifications are handled at any hour, once their `clientState` HMAC verified (before any
read, so a forged one never wakes the database).

| Method | Path | Description |
| --- | --- | --- |
| POST | `/google/calendar` | Google push notification: headers `X-Goog-Channel-ID`, `X-Goog-Channel-Token`, `X-Goog-Resource-ID`, `X-Goog-Resource-State` (`sync` \| `exists` \| `not_exists`) → **200** with no body, always (also for unknown or forged channels, so nothing can be probed). Verified: token = b64url HMAC-SHA256(webhook subkey of any ring key, channel id), checked before any database read; then the channel must be active, on Google, signed with that key, with the stored resource id. `sync` does nothing; otherwise the person's pull is queued. A `Content-Length` over 16 KB → **413** |
| POST | `/microsoft/calendar` | `?validationToken=…` (subscription validation) → **200** `text/plain` echo of the decoded token (≤ 4096 characters, else **400**). Otherwise Graph change notifications `{ value: [{ subscriptionId, clientState, tenantId, changeType, resource, … }] }` (≤ 100 items read, body ≤ 256 KB) → **202** with no body. Each item: `clientState` = `<connectionId>.<generation>.<b64url HMAC of connectionId:generation>` checked against every ring key before any database read; then the active Microsoft channel for the subscription must have that connection, generation and key; `tenantId` = the configured tenant when that is a GUID (a tenant configured by domain can't be compared with the GUID Graph sends; the HMAC decides then); one pull per person however many items |
| POST | `/microsoft/lifecycle` | The same validation echo; lifecycle notifications (`lifecycleEvent`: `reauthorizationRequired` → the subscription is renewed, `subscriptionRemoved` → re-created and the person pulled, `missed` → the person pulled), same checks → **202** |

Unreadable JSON → **400**; a body over the limit → **413**; **429** `RATE_LIMITED` past 600 / min per IP (§3).
Replays are harmless: a notification only causes an idempotent pull (`pull-<connectionId>-w<10 s bucket>`: pings in
one bucket share the pending job; once that job runs, the D26 stamp queues `pull-<connectionId>-n<stamp ms>` after it;
once it finished, `…-w<bucket>-<ms>`), and a lifecycle event for a channel that is no longer active is ignored.

## 3. Rate limits

| Key | Limit | Scope | On exceed |
| --- | --- | --- | --- |
| Failed logins | `LOGIN_RATE_LIMIT_MAX` (10) per `LOGIN_RATE_LIMIT_WINDOW_SECONDS` (900 s) | IP | 429 `RATE_LIMITED` + `Retry-After` |
| Account lockout (`Users.lockedUntil`, not a Redis key) | 5 wrong passwords within 15 min → locked 15 min | account | 423 `ACCOUNT_LOCKED` |
| Forgot password (`ratelimit:forgot-password`) | 5 / 15 min (every request); 3 links / hour per account | IP; account (quietly dropped) | 429 `RATE_LIMITED` |
| Record PDF | 30 / 60 s | user | 429 |
| Template preview | 20 / 60 s | user | 429 |
| Change password (`ratelimit:change-password`) | 10 / 15 min (every request) | user | 429 "Too many password attempts. Please wait a few minutes." |
| Sign out sessions (`ratelimit:session-revoke`, both `DELETE /me/sessions` routes) | 30 / 10 min | user | 429 |
| Admin password reset (`ratelimit:admin-password-reset`) | 20 / 10 min (every request) | admin | 429 "Too many password resets. Please wait a few minutes." |
| Busy times (`ratelimit:activity-busy`, `GET /activities/busy`) | 60 / 60 s | user | 429 `RATE_LIMITED` + `Retry-After` (in-memory per process whenever Redis can't count it; never fails open, since Redis down also means no busy-times cache) |
| Busy times provider calls (`ratelimit:activity-busy-calls`) | 120 Google / Microsoft calls / 60 s | user | no 429: the calendar part of people not yet read is `unavailable` and the CRM part is still returned (in-memory per process whenever Redis can't count it) |
| Public booking page view (`ratelimit:booking-view`, `GET /public/booking/:slug`) | 60 / 60 s | IP | 429 `RATE_LIMITED` + `Retry-After` (in-memory per process whenever Redis can't count; never fails open) |
| Public booking slots (`ratelimit:booking-slots-ip` / `-link`) | 60 / 60 s per IP (every request); 3000 / 60 s per link (live link, valid query only) | IP, link id | 429 + `Retry-After` (same fallback) |
| Public booking (`ratelimit:booking-book-ip` / `-link`, `POST /public/booking/:slug/book`) | 10 / hour per IP (every request); 30 / hour per link (valid, unused slot tokens only) | IP, link id | 429 + `Retry-After` (same fallback) |
| Booking page provider calls (busy-times budgets `booking:<linkId>` for slot pages, `booking-book:<linkId>` for bookings) | 120 Google / Microsoft calls / 60 s each | link | no 429: the owner's calendar part is `unavailable`, so the page answers `503 CALENDAR_UNAVAILABLE` (no times). Slot pages read fixed 14-day blocks, so a link needs only a handful of calls a minute |
| Calendar webhooks (`ratelimit:calendar-webhooks`, `/webhooks/*`, P2-7) | 600 / 60 s | IP | 429 `RATE_LIMITED` + `Retry-After` (in-memory per process whenever Redis can't count; never fails open) |
| Integration connection test and People "Check now" | 6 / 60 s | admin | 429 `RATE_LIMITED` + `Retry-After` (in-memory per process whenever Redis can't count it: down, or a command failing while it reports ready; this one never fails open) |

Limited responses carry `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. All limits except the integration connection test, busy times, the public booking page and the calendar webhooks fail open when Redis is down.

## 4. Error codes

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Zod failure; `errors[].path` points at the form field |
| 400 | `INVALID_JSON`, `BAD_REQUEST`, `VALUE_TOO_LONG` | Malformed body / oversized value |
| 400 | `WRONG_PASSWORD` | Change password: the current password is wrong (`errors[].path` `currentPassword`) |
| 400 | `WEAK_PASSWORD` | Change password: the new password breaks a password rule (`errors[].path` `newPassword`, message = the rule) |
| 400 | `INVALID_IMAGE`, `IMAGE_TOO_LARGE` | Profile photo: not a PNG / JPEG / WebP image; over 512 KB |
| 400 | `CURRENT_SESSION` | My Profile: signing out the request's own session from the sessions list (use Sign out) |
| 400 | `INVALID_INVITE` | `/auth/invite/*`: the set-password link is malformed, unknown, expired, used, revoked or the account is deactivated (one message for all) |
| 400 | `USER_INACTIVE` / `NO_EMAIL` | Admin › Users send-invite: the user is deactivated / has no work email |
| 502 / 503 | `INVITE_EMAIL_FAILED` / `MAIL_DISABLED` | Admin › Users send-invite: the email couldn't be sent (the mail server's reason) / outgoing email is off (`MAIL_ENABLED`) |
| 400 | `INVALID_MANAGER` | Admin › Users: "Reports to" is the user, someone below them, missing, inactive or a group login (`errors[].path` `reportsToId`) |
| 400 | `SELF_LOCKOUT` | Admin › Users: an admin removing their own admin role or deactivating themselves; Admin › Roles: turning off the admin panel of your own role, or moving yourself to a role without it |
| 403 | `SUPER_ADMIN_ONLY` | Admin › Users: someone other than a Super Admin adding, editing, deactivating, activating or sending a set-password link to a Super Admin, or giving / taking the Super Admin role (path `role` when the role is the cause) |
| 400 | `LAST_ADMIN` | Admin › Users: demoting or deactivating the only active admin-role user; Admin › Roles: turning off the admin panel of, or deleting, the last role an active user opens it with |
| 400 | `SYSTEM_ROLE` | Admin › Roles: changing or deleting Super Admin |
| 400 | `ROLE_IN_USE` | Admin › Roles: deleting a role that users hold without `reassignTo` |
| 401 | (none) / `INVALID_CREDENTIALS` | Missing, invalid, expired or revoked session; wrong password |
| 403 | `ACCOUNT_INACTIVE` / (none) | Deactivated user; role or row-level access denied (Admin › Roles: "Your role doesn't allow you to … ", or the record is outside an Own scope) |
| 403 | `INVITE_PENDING` | Sign-in with the right password by a user who hasn't set a password from their invite link yet |
| 404 | `NOT_FOUND` | Missing or soft-deleted record; unknown route |
| 423 | `ACCOUNT_LOCKED` | Sign-in while the account is locked after too many wrong passwords (the message says for how many more minutes) |
| 409 | `DUPLICATE_RECORD` | Unique violation (organization name, codes, partner name, a user's username or email …) |
| 409 | `WRITE_CONFLICT` | Concurrent write after retries were exhausted |
| 409 | `RELATED_RECORD_CONSTRAINT` | FK violation |
| 409 | `VERSION_CONFLICT` | Stale PDF template version |
| 409 | `CITY_IN_USE` | Deleting a city still used by records |
| 409 | `DUPLICATE_HOLIDAY` | Holidays: that occasion is already a holiday on that date |
| 409 | `INTEGRATION_NOT_CONFIGURED` | API Integrations: switching a provider on without complete credentials (Google: a readable key; Microsoft: client id, readable secret, tenant) |
| 409 | `INTEGRATION_NOT_TESTED` | API Integrations: switching a provider on without a passing app-level Test connection since its credentials last changed |
| 409 | `DOMAIN_IN_USE` | API Integrations: a domain already served by the other calendar provider, or removing a company domain a provider still serves |
| 409 | `CALENDAR_NOT_SYNCED` | API Integrations › People: "Check now" for a person without a live calendar row |
| 409 | `INTEGRATION_NOT_AVAILABLE` | API Integrations: Zoom before video meetings ship (Phase 3) |
| 409 | `EXTERNAL_EVENT_LOCKED` | Activities: changing the subject, times, all-day, location, attendees or owner of a meeting a customer organized in their calendar (P2-8, as of 2026-11-26) |
| 409 | `MEETING_IMPORT_OFF` | API Integrations › People: turning "Import customer meetings" on for a person while the company switch is off (P2-8) |
| 409 | `FOLLOW_UP_ACTIVITY_LOCKED` | Activities: changing the type, times, status, owner or related record of a lead / opportunity follow-up activity, or deleting one (change it on the record) |
| 409 | `VIDEO_PROVIDER_NOT_CONNECTED` | Activities: a new Video meeting choice the (new) owner's company calendar can't make (no live calendar, the other provider, or Zoom for now) (`errors[].path` `videoMeeting`; P3-1). An owner change alone is never refused: the link shows `failed provider_unavailable` instead |
| 409 | `VIDEO_MEETING_LOCKED` | Activities: the owner removing or changing a ready Microsoft Teams link ("Cancel and create a new meeting to remove the Teams link."; P3-1); a new owner may |
| 409 | `NOTHING_TO_RETRY` | Activities: Retry of a video link that hasn't failed, that failed with `provider_unavailable`, or on an activity that isn't live and Planned (P3-1) |
| 400 | `BOOKING_REJECTED` | Public booking: the honeypot field was filled (no detail given) |
| 403 | `BOOKING_LINKS_NOT_ALLOWED` | Booking links: the user's role may not create links (`whoCanCreate`) |
| 409 | `BOOKING_LINKS_OFF` | Booking links: the company switch is off (creating or changing a link; turning one off still works) |
| 409 | `BOOKING_LINK_LIMIT` | Booking links: the owner already has 20 links |
| 409 | `EMAIL_LOGGING_OFF` | Email logging: "Log now" for a person whose email isn't being logged (switch off, no synced calendar, …) |
| 409 | `SLOT_UNAVAILABLE` | Public booking: the time is taken, the token is invalid / expired / for an older version of the link, or the time breaks the link's rules now |
| 409 | `BOOKING_DAY_FULL` | Public booking: that day reached the link's bookings-a-day limit |
| 409 | `NOT_UNDOABLE`, `NOT_RESTORABLE`, `ALREADY_REVERSED` | Audit log: the entry can't be undone / restored, or was already |
| 410 | `EXPORT_EXPIRED` | Audit log export older than 24 h |
| 413 | – | Body over its limit |
| 429 | `RATE_LIMITED` | See §3 |
| 503 | `SERVER_BUSY` | Lock timeout / DB couldn't start a transaction (`Retry-After: 2`) |
| 503 | `INTEGRATIONS_NOT_READY` | API Integrations: storing a secret or key while `INTEGRATIONS_ENCRYPTION_KEY` is not set |
| 503 | `CALENDAR_UNAVAILABLE` | Public booking: the owner's company calendar can't be read now, so no times are offered and nothing is booked |
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
  `roles.ts` (`backend-crm/src/validators/contractSync.test.ts`).
- My Profile is not a CRUD module: `services/profile.service.ts` (profile, photo, sessions, preferences) and
  `auth.service.ts` `changePassword`, hooks in `hooks/queries/useProfile.ts`, types in `types/profile.types.ts`; the
  password rules in `utils/passwordPolicy.ts` and the out-of-office rules in `utils/notificationPreferences.ts` are
  contract-tested against the API's copies.
- Notifications are not a CRUD module: `services/notification.service.ts` (list, unread count, read, read all,
  morning summary preview / test), hooks in `hooks/queries/useNotifications.ts`, `CrmNotification` and the preview
  types in `types/notification.types.ts`. Read / read all broadcast `notifyCrmUpdate('/api/notifications')`.
- Own calendar status is self-contained in `components/integrations/` (as of 2026-11-26, P2-2b):
  `calendarConnections.service.ts` (`getOwn` only), `useCalendarConnections.ts` (`useOwnCalendarSync`, query key
  `calendarConnections`), `calendarConnections.types.ts` (contract-tested against the API constants),
  `CalendarConnectionsCard.tsx` (status only; its props are kept for compatibility and ignored) and
  `CalendarSyncStatusAlert.tsx` (Calendar page notice while the status is error / paused). Admin › API Integrations
  writes broadcast `notifyCrmUpdate('/api/admin/integrations')`; QueryProvider also refreshes the `calendarConnections`
  keys on them.

## 6. Adding an endpoint — checklist

1. Zod schema in `<module>.validator.ts` (mirror the frontend schema in `frontend-crm/src/validations`).
2. Service function: use `runInTransaction`; lock existing records with `lockRecords`; check scope with
   `assertRecordAccess`; write `auditService.record(tx, …)` in the same transaction; call
   `cacheService.invalidateEntityCaches` after commit. Cache a read of data that writes invalidate with
   `cacheService.getOrSetGuarded`, not `getOrSet` ([system design §4.2](system-design.md#42-cache-invalidation)).
3. Route: `authenticate` (router-level), `requireAdmin` for admin features, `requirePermission(module, action)` for
   module actions (`registerCrudRoutes(router, controller, module)` adds them to CRUD routes),
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
