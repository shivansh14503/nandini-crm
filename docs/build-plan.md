# Nandini CRM — Build Plan

> **Status:** living document. Part 1 records what has been built (reconstructed from git history, 115 commits
> from 2026-10-15 to 2026-11-18; the snapshot as of 2026-11-27, Calendar Phase 2 P2-1, P2-2, P2-2b (admin-managed calendar connections), P2-3a, P2-3b (calendar push engine), P2-3c (backfill, send invitations, sync status), P2-4, P2-5 (calendar → CRM pull), P2-6 (busy times), P2-7 (calendar webhooks) and P2-8 (customer meetings from the calendar, replies both ways), Calendar Phase 4 booking links, recurring activities and email logging, Profile Phase 1: My Profile, Profile Phase 2: Admin › Users, Profile Phase 3: notifications & preferences, Profile Phase 4: connected accounts and Profile Phase 5 PR5a + PR5b: company formats, which completes Phase 17; Calendar Phase 3 P3-1: Google Meet and Microsoft Teams links; as of 2026-11-27 booking links' default video meeting and the follow-ups below). Part 2
> is the roadmap. Tick
> items off and add new ones as work lands.
> Related: [System design](system-design.md) · [Database design](database-design.md) · [API plan](api-plan.md)

---

## Part 1 — What has been built

| Phase | Dates | Delivered |
| --- | --- | --- |
| **0. Frontend prototype** | Oct 15 – Oct 28 | Next.js app, MUI theme, forms and Zod schemas for organizations, leads, contacts; address components and RHF wrappers; tickets module (forms, drawers, list views) — all on mock data |
| **1. Backend foundation** | Oct 29 – Oct 31 | Express 5 + Prisma 7 on SQL Server; `Users` baseline; JWT cookie auth with Redis sessions; API client and AuthContext; CRUD for every core entity; soft delete; audit log; lookups; global search; Redis cache; rate limiting; BullMQ import/audit queues; organization name uniqueness; partner companies as full records |
| **2. Admin customisation** | Nov 2 – Nov 5 | Form customisation (fields, tabs, sections, required/visible) and dropdown management; custom fields in `customDataJson`; server-side enforcement; organization duplicate checks; lead GST |
| **3. PDF generation** | Nov 6 – Nov 12 | PDF templates and assets, Puppeteer renderer with semaphore + Redis cache; then the drag-and-drop block builder (`documentJson`), saved library items; scoped list indexes; assignee clean-up |
| **4. Numbering, filters, data quality** | Nov 13 – Nov 15 | Document series (company prefix, financial year, per-module rules, gap-free counters); table filters (recent/saved); trade name, shared registration type, field locking policy |
| **5. Masters & naming** | Nov 16 – Nov 18 | City master (seeded from ISO data, admin-managed, city ids on addresses with name write-through); uppercase organization/trade names; dropdown labels = stored values; UI-name alignment script; master view and table polish |
| **17. User profile** | Nov 26 | My Profile (profile, photo, password, signed-in sessions, notifications and preferences, connected calendars); Admin › Users (add / edit / deactivate, emailed invite and password reset links, Invited / Active status); Admin › Company formats (company-wide date, time and number display formats on every screen, PDFs, the morning email, bell texts and the audit log; legacy styles until the first save) |

### Current capability snapshot

| Area | State |
| --- | --- |
| Leads, Opportunities, Quotations, Organizations, Contacts | ✅ CRUD, list filters, row-level access, audit, import (not quotations), lead conversion; one line items model on opportunities and quotations (Product, Quantity, Rate from the catalog MRP, Gross Amount, Discount as a Percentage or an Amount, GST from the product's Tax Rate, Taxable Amount, Description, Note; drag to reorder; currency on quotations only) in the forms, view pages, drawers, scorecards and PDFs (Jira CRM-111, 2026-11-27); Summary Breakdown: Total Taxable Amount, Lump Sum Discount, Actual (Before Tax), GST per rate as IGST or CGST + SGST by the Company State (Admin › Company Details), Round Off checkbox, Grand Total, to the paisa, with a one-time recalculation of saved records; line item columns left-aligned (Jira CRM-111, 2026-11-27) |
| Tickets, Products, Partner Companies | ✅ CRUD, import; product Status (Active / Inactive, Admin only, reason dialog, Inactive Since (date + time) on the view page and drawer, Status pills; inactive products are not offered on new line items) (2026-11-27) |
| Contracts | ✅ CRUD, list filters, status cards, row-level access, audit (no import) |
| Referrals | ✅ CRUD, Active / Inactive status, audit, drawer layout, Form Builder (no import); Referred By on leads, opportunities and Convert Lead is picked from the active referrals (2026-11-25); free-text Company Name instead of the Organization picker, one form section, and Create Referral Contact inside the Referral Search picker, whose filters are Name, Any Number and Any Email (2026-11-26) |
| Activities & calendar | ✅ data model, API, Form Builder fields; Activities list, form, quick create, drawer, record Activities tabs and the Calendar page (FullCalendar v7, business timezone, drag to reschedule); reminders, assignment / invitation and contract renewal notifications in the navbar bell; 9 AM morning summary email (off until SMTP is set up). Google / Microsoft 365 sync is Phase 2 |
| Documents | ✅ read-only list (filters, export / file download), drawer and detail page of the opportunities' documents |
| Quotation PDF | ✅ templates, builder, preview, cached render |
| Admin: forms, dropdowns, document series, cities, PDF templates, holidays, company formats | ✅ |
| Responsive layout | ✅ phones (from 320 px), tablets and desktops: menu drawer below 1200 px, icon-only navbar controls up to 1420 px, related records as a button on phones, no sideways page scroll |
| Audit log | ✅ ledger table with who / where / how per entry, Admin › Audit Log screen (`/api/admin/audit-logs`), undo / restore, CSV / Excel export, ledger integrity checks; alert rules later (Phase 11 E) |
| My Profile | ✅ own name, mobile, office phone and photo; change password (signs out other sessions); list and sign out signed-in sessions; notification preferences, default reminder and out of office (2026-11-26) |
| Users admin | ✅ Admin › Users (`/admin/users`): add, edit, deactivate / activate, reset password with must-change-password at next sign-in; job title and reports to (2026-11-26) |
| Roles & permissions | ✅ Admin › Roles (`/admin/roles`, 2026-11-27): roles with View / Create / Edit / Delete / Export / Import per module at All, Own or None and an admin panel switch, enforced on every module route, list and record; the app hides what a role can't do. Password policy settings, security groups and security settings are next (Phase 18) |
| Dashboard | ❌ static page, no data |
| Tests | ⚠️ 100 backend unit test files (`node:test`); no API integration, no frontend, no E2E |
| CI/CD, containers | ❌ none in repo |

## Part 2 — Roadmap

Priorities: **P1** = needed before wider production use, **P2** = next, **P3** = later.
Each phase lists exit criteria so "done" is unambiguous.

### Phase 6 — Production hardening (P1)

- [x] **User management** — done as Phase 17, Profile Phase 2 (Admin › Users, 2026-11-26): `/api/admin/users`
      (list, add, edit, deactivate / activate, reset password; sessions revoked on deactivate / reset / role change)
      and the admin page at `/admin/users`. Self-service `POST /auth/change-password` with sign-out of other sessions
      shipped in Phase 17, Profile Phase 1.
- [ ] **Run workers separately** — document and default production to `RUN_WORKERS=false` + `npm run worker:prod`.
- [ ] **CI pipeline** — on every PR: `npm ci`, `prisma validate`, backend `typecheck` + `test`, frontend `lint` + `build`.
- [ ] **Deployment artefacts** — Dockerfile for API (with Chromium, see README) and frontend; env checklist.
- [ ] **Backups & migration runbook** — how `db:deploy` runs, rollback approach, Azure SQL backup retention.
- [ ] **Fix stale docs** — README PDF section (Handlebars → block documents); `SequenceCounter` comment path; import route comment lists 4 entities but 7 are supported.

Exit: an admin can manage users from the UI; CI is green on main; a fresh server can be deployed from the repo docs alone.

### Phase 7 — Testing (P1)

- [ ] API integration tests against a disposable SQL Server (Docker) for: auth + session revocation, row-level
      access (scoped vs global roles), lead conversion, document numbering under concurrency, import job.
- [ ] Frontend: component tests for forms with form-config rules; one Playwright smoke path
      (login → create lead → convert → quote → PDF).
- [ ] Contract check: keep `contractSync.test.ts` and extend it to DTO types where feasible.

Exit: the critical flows above run in CI.

### Phase 8 — Dashboard & reporting (P2)

- [ ] `GET /api/dashboard/*` aggregates (pipeline by stage, follow-ups due today/overdue, open tickets by priority,
      conversion rate, quotations this month), cached under `cache:dashboard:*` (invalidation already wired).
- [ ] Dashboard page with charts; respects row-level scope.
- [ ] List export (CSV/XLSX) honouring filters and scope.

### Phase 9 — Sales workflow depth (P2)

- [x] **Lead Rating rules** (2026-11-21) — automatic Hot / Warm / Cold `Lead.rating` from each recorded follow-up,
      admin-set limits per Customer Response option and for new leads (Form Builder › Leads › Rating Rules), closing
      statuses, nightly ageing, follow-up history. [lead-rating-rules.md](lead-rating-rules.md)
- [x] **Opportunity stage cards** (2026-11-24) — the Opportunities list shows one card per sales stage (plus "All
      Opportunities") with its count, share and Actual (Before Tax) total; clicking a card filters the list. Same
      component and admin scorecard settings as Leads (the built-in stage cards are the default an admin can recolor,
      hide or replace). Pills are now non-stage views that toggle off on re-click, and Followup Today filters by the
      follow-up date. The scorecard's currency dropdown also offers the deal's line-item totals (Total, Subtotal,
      Discount, Tax, Grand Total, Subtotal + Tax, Commission Amount, Lump Sum Discount).
- [x] **Quotation stage cards** (2026-11-24) — the same cards on the Quotations list: one per quote stage (plus "All
      Quotations") with its count, share and Grand Total, in one row that scrolls sideways. The old Draft / Sent /
      Accepted / Rejected pills (a status the quote form never sets) gave way to High Value (₹1L+) and My Quotes,
      which toggle off on re-click.
- [x] **List Scorecards admin page** (2026-11-25) — the scorecard settings moved from a dialog on each list to
      Admin › List Scorecards (`/admin/scorecards`): pick a list, switch its cards on or off, choose the dropdown it
      counts by, the "All" card's wording, card order (drag or move up / down), shown cards and colors, the total and
      the list column / drawer colors, with a live preview over the list's records. Saves are refused (409) when
      another admin saved first. Contacts, Organizations, Products, Tickets and Partner Companies can now have cards
      too (off until an admin switches them on). On the lists, admins get a gear on the "All" card that opens the page.
- [x] Activities / follow-ups (calls, meetings, notes) linked to any record, with reminders (2026-11-25) — built as
      [Phase 14](#phase-14--activities--calendar-p2-started-2026-11-25) (Calendar Phase 1, PR1–PR3).
- [ ] PDFs for Opportunities (and later Tickets) via the module adapter pattern.
- [ ] Email quotation PDF to the contact. The mail layer now exists (Phase 14 PR3): `sendMail` in
      `backend-crm/src/services/mail.service.ts` over the Google Workspace SMTP relay, with an `EmailLog` row per send
      (add a `quotation` kind and a dedupe key per send); it still needs the attachment, the compose dialog and the
      decision on who may send.
- [ ] Quotation import (currently excluded).

### Phase 10 — Scale & operations (P3)

- [x] ~~`AuditLog` retention / archiving~~ — decided 2026-11-21: keep every entry forever (append-only ledger table,
      Phase 11). Revisit only together with a move off SQL Server Express (database size cap).
- [ ] Full-text search indexes for large tables.
- [ ] Migrate owner/creator columns from usernames to user ids (then usernames can be renamed).
- [ ] Structured log shipping and alerting (pino JSON → log service); health checks for Redis and Chromium.
- [ ] Drop legacy `Quotation` alias columns once no client uses them.

### Phase 11 — Admin Audit Log (P1, started 2026-11-21)

A CRM-wide audit log in Admin: every change in the application, filterable by date, user, module, record, field,
action, category, source and IP, with undo / restore. Decisions (owner, 2026-11-21): **admin-only** for now (wider
access decided later); log **all changes** plus sign-ins and refused access; **keep forever**; tamper-proof
(SQL Server ledger); restore and undo **in scope**; old entries backfilled; production-grade from the start
(~60 users at launch); built before User Management.

**A. Foundation** ✅ (2026-11-21)
- [x] Record history access: follows the record's own access rule; sign-in, PDF template and Form Customization trails
      admin-only (it was open to any signed-in user).
- [x] `AuditLog` rebuilt as an append-only **ledger table** (BIGINT clustered key, PAGE compression, 9 indexes) with
      who / where / how columns; 684 existing rows copied with labels, actors, modules and changed fields filled in.
      [database-design §4.16](database-design.md#416-auditlog)
- [x] Request context (AsyncLocalStorage): actor id + role, session, source (UI / API / IMPORT / JOB), route, screen,
      IP, browser and request id on every entry without touching the audit calls; `X-Request-Id` on every response.
- [x] Record number + name stored per entry; category / module / severity / changed fields; sensitive keys redacted.
- [x] Email check results on records (`EMAIL_CHECK`: post-save check, bulk runs, the admin's "accept"); saved list
      filters stay unaudited (personal view settings, owner's decision 2026-11-23).
- [x] New events: refused access (403), failed sign-in on a deactivated account, scorecard save / reset; imports and the
      nightly Lead Rating job tagged with their own source and request id.
- [x] Unit tests: `auditCatalog.test.ts`, `auditContext.test.ts`.

**B. Query API** ✅ (2026-11-23, admin-only, `/api/admin/audit-logs`, [API plan §2.7](api-plan.md#27-administration-))
- [x] `GET /` — filters (date range, users, modules, actions, categories, severities, sources, record id / number /
      name, changed field, IP, request id, free text) + keyset paging on `id` (no `COUNT(*)` over the whole range).
      A date range is first turned into an `id` range (from the `createdAt` index), so every page seeks the
      clustered key.
- [x] `GET /:id` — one entry with a labelled Field / Before / After table (form-config labels incl. custom fields;
      record numbers only for modules with a document series), and the other entries of the same request.
- [x] `GET /facets` (filter options with counts for the chosen range) and `GET /stats` (today, failed sign-ins 24 h,
      refused access 24 h, deletes 7 days, most active users, events per day by category).
- [x] Performance check: 1 M seeded rows in a scratch database, a 30-day all-module page in < 300 ms
      (`npm run perf:audit`, 2026-11-23: 1 M entries over 180 days, 167 k in the window: first page **52 ms**, any
      filter 40–55 ms, a deep page 44 ms, one record's history 3 ms, entry 10 ms, facets 380 ms, stats 310 ms; free text
      that matches nothing scans the window's stored values, ~1 s — a full-text index is the fix if that matters).
- [x] Unit tests: `auditAdmin.query.test.ts`, `auditAdmin.present.test.ts`.

**C. Admin screen** ✅ (2026-11-23, `/admin/audit-log`, the "System Audit & Security" card is Available)
- [x] Summary strip (events in the period, today, failed sign-ins and refused access 24 h, deletes 7 days; a click
      shows those entries) + events-per-day chart by category (a click on a day filters to it) + most active users;
      filter bar: search box, date choice and the `TableFilter` dialog with recent / saved filters (`module=audit-log`,
      run on the server through `useFilterController`; options from the last year's facets, changed fields from the
      form configuration); table (time, user, action, module dot, record link or "Deleted" / "Removed", summary,
      source) with "Load 50 older" keyset paging; detail drawer (Field / Before / After, details, who / where / how,
      other entries of the same request); category tabs (All, Data, Configuration, Security); links "History of this
      record" / "Everything this user did that day". User fields (Assigned To …) show names, not usernames.
- [x] Light / dark per the theme rules; module identity colours only for the module dots; chart series tokens
      `--crm-chart-audit-*` with their own dark steps (checked for colour-blind separation).

**D. Undo, restore, export, integrity** ✅ (2026-11-23, [API plan §2.7](api-plan.md#27-administration-))
- [x] **Restore** a soft-deleted record from its DELETE entry (uniqueness re-checked; writes `RESTORE` with `revertsId`).
      `restore()` on the 8 record services; "Restore record" band in the entry drawer.
- [x] **Undo** an UPDATE / STATUS_CHANGE: put the `from` values back through the module's normal update path
      (validation, field locking, name write-through); refuse fields changed again since (conflict list), write `REVERT`
      with `revertsId`; an entry can be undone once. Not for CONVERT, IMPORT or Form Customization (form config deletes
      stay permanent by design). The drawer's "Undo this change…" dialog lists every field (put back / changed since /
      already / not editable) with a tick box per field that can go back.
- [x] CSV / XLSX export of the current filter (over 5,000 entries in BullMQ `crm-audit-export`, streamed with constant
      memory; caps 1 M CSV / 500 k Excel newest entries); every export is itself audited (`EXPORT`), and only the admin
      who asked can download it, for 24 h. Checked on 1 M entries: 169 k-entry CSV in 24 s, Excel in 27 s.
- [x] Integrity: nightly (00:15) `sys.sp_generate_database_ledger_digest` saved outside the database (file under
      `AUDIT_DIGEST_DIR` + an `AuditDigest` row for the screen); "Verify integrity" runs
      `sys.sp_verify_database_ledger` against the saved digest files in the background and logs a `LEDGER_VERIFY`
      entry (verified / FAILED / couldn't run). Needs snapshot isolation (migration
      `20261123120000_audit_snapshot_isolation`). 1 M entries verified in 95–97 s.
- [x] Unit tests: `auditUndo.test.ts`, `auditExport.format.test.ts`, `auditLedger.test.ts`, `xlsxWriter.test.ts`.

**E. Users tab** ✅ (2026-11-25, owner's request: a user's own log and report for admins)
- [x] `GET /api/admin/audit-logs/users`: every user (inactive ones too), the background jobs and any other username
      with entries, each with entries in the period per category, sign-ins, failed sign-ins, newest entry (any time)
      and last sign-in ([API plan §2.7](api-plan.md#27-administration-)). Newest entry = one `TOP 1` seek per user on
      `(changedBy, createdAt)`. `npm run perf:audit` (1 M entries, 167 k in the window, ~90 usernames): 30 days
      **249 ms**, 366 days 1.3 s.
- [x] "Users" tab after Security: searchable list (status filter, sort by activity / recently active / name / last
      sign-in; the period follows the date choice), each user with entries and their Data / Configuration / Security
      split, failed sign-ins, last active and last sign-in. A click opens the user's activity log: who they are, last
      active / sign-in, category chips with counts, then the normal search, date, filter, entries table and drawer; Export
      (CSV / Excel) downloads that user's report, named `audit-log-<username>-<date>-<time>`. Phones: two-row cards; the
      tabs wrap.
- [x] Unit tests: `auditUsers.test.ts`, per-user file names in `auditExport.format.test.ts`.

**F. Later**
- [ ] Alert rules (e.g. > 50 deletes in 10 min, 5 failed sign-ins from one IP) shown in-app; wider (manager) access if
      decided; optional record-view logging.

Exit: an admin can answer "who changed this lead's Assigned To last week, from which screen and IP?" in under a
minute, undo it, and prove the log hasn't been altered.

### Phase 12 — Admin-designed record drawers (P2, started 2026-11-23)

Admins lay out a record's side drawer (header, badges, each form tab's sections) by drag and drop, like the PDF
builder. Decisions (owner, 2026-11-23): one layout per module; header, badges and tab contents customizable, footer
later; drawer tabs mirror the form's tabs; today's coded cards become ready-made pieces that can be rebuilt; side drawer
only (not the full record page); Save goes live straight away; Leads first.

- [x] **Leads pilot** (2026-11-23): `DrawerLayout` / `DrawerPiece` tables, `/api/drawer-layouts` + `/api/drawer-pieces`
      ([API plan §2.5b](api-plan.md#25b-record-drawer-layouts-form-customization--drawer-layout)), audited in the Form
      Customization trail; the lead drawer renders from the layout (built-in layout = the old hand-built drawer);
      Form Customization › Leads › Drawer Layout builder: fields / blocks / pieces palette, live drawer canvas with a
      sample or real lead, settings panel, undo / redo, Save / Reset, Pieces library; avatar = preset icon, initials or
      a set of emoji; responsive (3 panes / 2 panes / phone with a bottom sheet) with touch drag and
      add / move buttons.
- [x] **Every other drawer** (2026-11-23): Opportunities, Quotations, Organizations, Contacts, Products, Tickets and
      Partner Companies render from their layout (built-in layouts reproduce the old hand-built drawers); new blocks
      Line items and Totals (opportunities, quotations), new field looks User / Code pill / Hidden until revealed,
      system values per module (record numbers, Grand Total, AMC / Cloud / Verified flags), more avatar icons
- [x] Lead Rating (Hot / Warm / Cold) in its own box under the drawer's header buttons, and the same icon + colour
      badge (`RatingBadge`: fire, sun, snowflake) in the leads table, follow-up history and Rating Rules; drawer
      footers show only buttons
      (each needs its system values, address prefixes, built-in layout and pieces).
- [ ] Footer actions in the layout.

### Phase 13 — Support contracts (P2, 2026-11-25)

- [x] **Contracts module** (2026-11-25) — Support › Contracts, next to Tickets (modelled on the old CRM's AOS
      Contracts): title, status, value, Contract Manager, organization / contact / opportunity links, Tally serial no.,
      term (start / end date, period, renewal reminder), contract types and billing. Built like the other modules: form
      builder config (one Overview tab, dropdowns `contract_title` / `contract_status` / `contract_period` /
      `contract_type`), drawer layout, document series (`contract`, `CTR-0001` until a series is set), audit with undo /
      restore, row-level access on the Contract Manager, organization / contact name write-through, global search.
      The list has one card per contract status (plus "All Contracts") totalling Contract Value, and My Contracts /
      Expiring in 30 Days pills. The form moves End Date with Start Date and the period, and the reminder to 15 days
      before the end at 11:00, until the user types their own.
- [x] **Renewal reminders** (2026-11-25, Phase 14 PR3) — the reminder sweep (every 15 minutes, 07:00–21:45) notifies
      the Contract Manager in the navbar bell once the Renewal Reminder Date has come (window of 7 days, not for
      Expired contracts; a changed date notifies again), and the morning summary email lists contracts whose
      reminder is today or that end within 30 days. Renewal reminders also show on the calendar feed (PR1).
- [ ] Left out of the first version: contract import, contract PDF, creating a contract from an opportunity or product.

### Phase 14 — Activities & Calendar (P2, started 2026-11-25)

Phase 1 of the activities / calendar work, in three PRs. Activity times are true UTC instants (the rest of the CRM
keeps wall-clock times); all-day activities are entered as business-timezone days.

- [x] **PR1: database + API + Form Builder** (2026-11-25) — `Activity` / `ActivityAttendee` tables (migration
      `20261126090000_activities`, filtered unique indexes per attendee), `/api/activities` CRUD + `GET /meta`,
      `GET /calendar` (activities plus lead / opportunity follow-ups and contract renewal reminders, capped),
      `GET /link-targets`, `POST /:id/response` (audited `RSVP`). Access: owner, creator, invited colleagues (view and
      reply only) and global roles. Related record (lead, opportunity, contact, organization, quotation, ticket,
      contract) checked against the caller's access; organization / contact derived from it; renames written through
      to activities and contact attendees. Form Builder: Activities module (15 fields, `activity_status`,
      `activity_reminder`; Customer Response is its own `activity_customer_response`, or the related lead's / opportunity's list, recorded
      only: no Rating, Sales Stage or follow-up rules), Task / Note as Activities-only Followup Types (hidden on
      lead / opportunity / Convert Lead forms, refused by their APIs unless unchanged, never the dropdown default),
      option meta `durationMinutes` / `icon`. Audit: undo / restore for activities. Frontend: types, service, React
      Query hooks, module registries and the module colour Olive (`--crm-module-activities-*`, `CLAUDE.md`; Brown is
      Documents') (no screens yet). Unit tests for time zones, schedule rules, attendee sync, access, calendar ranges,
      links.
- [x] **PR2: screens** (2026-11-25) — Activities list (pills My Activities / Today / Overdue / Next 7 days / Calls /
      Meetings / Tasks / Notes, a load window of the last 30 to the next 60 days, adjustable), form (Form Builder
      driven; timed / all-day in the business timezone, related record and attendee pickers, fields a type doesn't use
      hidden), quick create dialog, detail drawer (mark complete, reschedule, cancel, delete, RSVP), Calendar page
      (FullCalendar v7 classic theme with CRM tokens; month / week / 3 days / day / agenda, drag and resize to
      reschedule, long press on touch, read-only follow-ups and renewals, user / type / source / status filters),
      Activities tab in the Lead / Opportunity / Contact / Organization / Quotation / Ticket / Contract drawers and the
      related-records panels, nav items (the Activities menu keeps its Documents entry, Phase 15), Quick Create entry,
      Form Builder coded defaults, audit log links. Contract tests keep the frontend time-zone and schedule rules
      equal to the API's.
- [x] **PR3: notifications, reminders and the morning email** (2026-11-25) — `Notification` and `EmailLog` tables
      (migration `20261126120000_notifications`, unique dedupe keys, nightly retention), `/api/notifications` (list
      with keyset cursor, unread count cached in Redis, read / read all, morning summary preview and admin test send),
      BullMQ `crm-reminders` worker: a delayed job per activity reminder (claim on `reminderSentAt` and insert in one
      transaction), a 15-minute business-hours sweep (missed reminders, contract renewals), nightly purge + re-arm,
      catch-up on every Redis `ready` and a one-minute fallback while Redis is down. Assignment / invitation
      notifications after activity saves (never blocking the save). Unread count cache that never keeps a count read
      during a write (placeholder + compare-and-set) and is dropped on every Redis reconnect and nightly. Mail layer on
      nodemailer 10.6.1 (Google Workspace SMTP relay or an app-password mailbox, STARTTLS required; off until
      `MAIL_ENABLED=true`) and the 9 AM morning summary email on its own `crm-mail` queue and worker (today's
      schedule with "Add to Google Calendar" links, overdue activities, follow-ups due / overdue, contract renewals,
      full counts with "and N more" links to the day's calendar agenda and to `/contracts?view=expiring_soon`; a
      missed run queued as a one-off job before noon). Frontend: the navbar
      `NotificationBell` replaces the sample notifications (badge polled every minute while the tab is visible,
      module-tinted rows, mark read and open, mark all read,
      cross-tab refresh), "Preview morning email" (sandboxed preview, "Send me a test" for admins) and the contracts
      list's `?view=` pill (`expiring_soon`, `my_contracts`). Docs: system
      design §4–§5, §8.4, §9 (worker and SMTP relay setup). Unit tests for recipients, stale policy, keys, texts,
      producer chunking, delivery claims, EmailLog claims, cron catch-up, summary sections, Google links and escaping,
      STARTTLS enforcement (fake SMTP server), the guarded cache and the overdue / today split.
- [x] **Phase 2: calendar sync** (Google / Microsoft 365; all of P2-1 to P2-8 done as of 2026-11-27) — **admin-managed** since the owner's plan change of
      2026-11-26 (P2-2b): admins connect the company once (Google service account with domain-wide delegation,
      Microsoft Entra app with application permissions) and everyone with a company email is synced automatically;
      employees have no connect / disconnect. Zoom stays per-user OAuth in Phase 3. Needs (for webhooks, P2-7) the app
      on HTTPS under a nandiniinfosys.com hostname (`PUBLIC_API_URL`), unique company emails on users, `CalendarConnection` and `ActivityExternalLink` tables, Admin ›
      API Integrations with encrypted credentials, `Activity.iCalUid` + organizer fields for inbound events, recurring
      series materialized as occurrence rows, and inbound events clamped to the 31-day limit. The morning email's
      "Add to Google Calendar" links (one-time copies) are then hidden for users whose calendar is synced.
      Delivered in these PRs:
  - [x] **P2-1: Admin › API Integrations (foundation)** (2026-11-26) — secret box (`services/secretBox.ts`,
        AES-256-GCM with a key ring from `INTEGRATIONS_ENCRYPTION_KEY`, rotation script
        `npm run integrations:reencrypt`), `PUBLIC_API_URL`, URL redaction in request / error logs, extra logger
        redact paths, audit `SENSITIVE_KEY` exact + suffix rule, `IntegrationProvider` table (migration
        `20261126220000_integrations`), `/api/admin/integrations` (read, save provider with write-only secrets and
        `clientVersion`, remove secret, Google / Microsoft "Test connection" probes rate-limited 6 / min, company
        calendar settings as the module setting `activities/calendarSync`, Followup Types that go to calendars as
        option meta `calendarSync`, people and company emails through the reusable `users/userEmail.service.ts`),
        Admin › API Integrations page (readiness alerts, server facts, provider cards, settings, "What goes to
        calendars", People with the email editor), admin hub card, navbar Integrations admin-only. Every provider
        starts off; nothing changes for users until an admin turns one on (and P2-2 ships). Not run against a real
        SQL Server, Google or Microsoft in the build environment (migration checked with `prisma migrate diff`).
        Owner before deploy: generate and set the key on the API and the worker, keep a copy (system design §9.2);
        after deploy: fix company emails on the People table. Review fixes (2026-11-26): request logs mask the parsed
        `req.query` too, the connection-test limit falls back to memory whenever Redis can't count, a test result is
        stored only if the credentials didn't change meanwhile (`credentials_changed`), the email body requires
        `email`, docs give Microsoft-without-tenant as 400, a failed refetch keeps the cards and drafts mounted, and an
        email change refreshes master data in every tab (`MASTER_DATA_SYNC_ENTITY`).
  - [x] **P2-2: connect / disconnect** (2026-11-26; per-user OAuth, **replaced by P2-2b** the same day) — `CalendarConnection` table and the filtered unique indexes
        `UX_CalendarConnection_user_kind`, `UX_CalendarConnection_account` and `UX_Users_email` (migration
        `20261127090000_calendar_connections`, which lower-cases stored emails and stops on duplicates; pre-check
        `npm run calendar:check-emails`), `modules/calendar-sync` (provider adapters for Google, Microsoft and a
        dev-only `fake` (`CALENDAR_FAKE_PROVIDER`), `providerFetch` with retries / Retry-After / typed errors, OAuth
        code + PKCE + state + nonce with the sealed `crm_oauth` cookie, id_token claim checks, Google `hd` / Entra
        tenant checks, scope checks, token refresh with compare-and-set on `tokenVersion`, `calendar_reconnect`
        notifications, revoke on disconnect), `/api/calendar-connections` (list, start, callback, disconnect) and the
        admin `GET /connections` + `POST /connections/:id/disconnect`, People table with connection details and an
        admin disconnect, an empty company email filled from the verified account, `EMAIL_CONNECTED` guard on email
        edits, nightly disconnect of inactive users and a "your access ends soon" warning (from the reminders worker's
        nightly job until the calendar worker exists), `integrations:reencrypt` also re-seals connection tokens.
        Frontend: self-contained `components/integrations/CalendarConnectionsCard` on the temporary page
        `/connected-calendars` (user menu and mobile drawer item "Connected calendars"; since moved to My Profile ›
        Connected accounts, Profile Phase 4), a
        reconnect banner on the calendar, the bell icon for `calendar_reconnect`, and login `?next=` (CRM paths only).
        Nothing synced yet at the time (P2-3b added the push): the card said sync arrives in the next update. Providers stay off until an admin
        switches one on. Not run against a real SQL Server, Google or Microsoft (migration checked with
        `prisma migrate diff --from-empty`; the whole connect → callback → refresh → disconnect flow runs against the
        fake provider and replayed Google / Microsoft answers in tests). The morning email only has a parked hook
        comment (`hasActiveCalendarConnection`).
  - [x] **P2-2b: admins connect the company calendars** (2026-11-26; replaces P2-2's per-user OAuth) — migration
        `20261128090000_calendar_admin_connect` (`CalendarConnection` becomes token-free per-user sync state: statuses
        pending / ok / error / stopped, `source`, check columns, renamed `enrolledAt` / `stoppedAt` / `stoppedBy`, new
        filtered unique indexes `UX_CalendarConnection_user` / `UX_CalendarConnection_mailbox`; new `CalendarSyncUser`
        for the admin's override / exclusion / note; `IntegrationProvider` health columns, Google key and domains in
        the sealed / settings JSON; live P2-2 rows stopped `oauth_retired`, Google's OAuth client cleared, Microsoft
        switched off, `calendar_reconnect` rows deleted). Backend: `tokenSource.ts` (Google JWT bearer signed with
        `node:crypto` RS256, Microsoft client credentials, in-memory LRU cache with single flight, 5-minute leeway and
        negative caching; nothing persisted), `syncErrors.ts` (user / app / transient codes with admin sentences),
        `calendarAccess.ts` (`withCalendarAccess`, retry once on 401, provider health), `enrolment.ts` (pure
        `resolveTarget` / `planEnrolment`, `reconcileUser` / `reconcileAll` under the per-user lock, due checks with
        backoff), `calendar_sync_issue` notifications to admins (app-level per provider and day, nightly people
        digest), triggers from provider / settings saves, People email and calendar changes, Admin › Users create /
        update / activate / deactivate and the nightly job. API: provider save takes the Google key (write-only, ≤ 10
        KB) and domains (`DOMAIN_IN_USE`), switching on needs a passing test (`INTEGRATION_NOT_TESTED`), two-step test
        with `asUsername`, People `calendar` column, `PUT /people/:username/calendar`, `POST
        /people/:username/calendar/check`, read-only `GET /api/calendar-connections`; removed the OAuth start /
        callback / disconnect routes, the admin `/connections` routes, `EMAIL_CONNECTED`, `CALENDAR_ALREADY_CONNECTED`,
        `PROVIDER_DISABLED` and `PUBLIC_API_URL` as a readiness gate; `integrations:reencrypt` covers provider secrets
        only. The dev-only `fake` provider works in admin mode (serves unclaimed company domains, no key). Frontend:
        provider cards (key upload / paste, client ID, scopes text and service account email to copy, domains, health,
        counts, two-step test with "Also test as", switch gated on a test), People calendar column and
        `CalendarChoiceDialog` (override, leave out with a note, Check now), `?tab=people&issue=` links, status-only
        `CalendarConnectionsCard` (props kept, ignored), `CalendarSyncStatusAlert` on the calendar instead of the
        reconnect banner, the bell icon for `calendar_sync_issue`. Tests: JWT header / claims / signature against a local
        RSA key, token cache, error classification, enrolment rules and reconcile, People API, test connection, no dead
        routes. Not run against a real SQL Server, Google or Microsoft. Owner setup: system design §9.2.1. Review
        fixes (2026-11-26): "Test connection" as a person is audited `TEST_AS_USER` and limited to people the provider
        would sync (409 `CALENDAR_TEST_NOT_ALLOWED`); a test clears provider health only for problems it proves fixed;
        the Microsoft 403 escalation needs no `ok` row on the provider (RBAC-scoped tenants); card `excluded` counts
        come from `CalendarSyncUser`; the People link follows bell navigation on the open page; a 32 px tap target on
        "N with problems".
  - [x] **P2-3a: activity write-path refactor** (2026-11-26, no behaviour change) — `activity.system.ts`
        (`insertSystemActivity` / `applySystemPatch`: owner verbatim, no past-start / admin-required / related-access /
        lock checks; audit, revision, `remindAt`, attendee sync kept; `loadFollowUpContext()`), the write hook
        `activity.writeHook.ts` (`activityWriteHook.onWrite`, called inside every Activity write with the acting
        username; a no-op until P2-3b), `insertActivityRow` / `updateActivityRow` shared by CRM and system writes,
        `runActivityPostCommit` replacing `afterActivityCommit` (now also after delete / bulk delete, where it does
        nothing), and the lock seam (`activityLocks.lockFor` / `lockedFieldsFor` in `activity.access.ts`, returning
        none; enforced in update (only for fields the request asks to change), delete and bulk delete,
        `BulkDeleteResult.skipped` optional); system writes may also set `rowData` (columns the API can't) and
        re-align `createdBy`. No migration, no API change.
  - [x] **P2-3b: CRM → calendar push engine** (2026-11-26, adapted to the admin-managed model) — migration
        `20261128100000_activity_calendar_sync` (`ActivityExternalLink` with `heldAttendeesJson`, the Activity
        calendar columns, hand-written `UX_ActivityExternalLink_event` / `UX_Activity_syncKey`). Outbox
        (`sync.outbox.ts`) in `activityWriteHook.onWrite`; after-commit wake-up (`sync.wake.ts`) in
        `runActivityPostCommit`; `pushLink` (`sync.push.ts`): gates, per-connection lease, `planPush`, create / patch /
        cancel / detach, 412 three-way merge, remote deletion, error handling; Google and Graph event adapters
        (`/users/{mailbox}/events`, through `withCalendarAccess`; no SDKs), the fake provider's events; queue
        `crm-calendar-sync` and `calendarSync.worker.ts` (push, `enrolled`, `check`, `calendar-poll` every 5 min
        07:00–21:55, `calendar-nightly` 00:25 taking over the reminders nightly's calendar steps and the follow-up
        backfill, Redis-down fallback tick, heartbeat). Stopping a connection detaches its links; re-activation
        re-attaches them. D41 (invites only on the owner's save; guests a colleague adds held by address on every
        link that invites, detached ones and provider-off periods included; an owner change by anyone but the new
        owner makes the new owner's earlier link a new copy), D42 (private events), D45. Review fixes: an error never
        overwrites `cancelled` / `removed_remote` (a failed restore is retried as a restore, also by the nightly), the
        lease is checked before every provider call, a failed push is put back while BullMQ retries it, an `enrolled`
        job per recovery, a row stopped mid-push leaves the link `detached`. Notification kinds `calendar_sync_error`, `calendar_invites_held`, `integration_secret_expiring` (system,
        always deliver; bell icons). `ActivityView.calendar` (data only). `CALENDAR_SYNC_ENABLED`. Deviations: the
        `enrolled` job (replaces the per-user connect job) pushes dirty links only; the backfill of existing
        activities is P2-3c (done); a follow-up activity moved in the calendar is moved back (the write-back to the record is
        P2-5); the organizer columns joined the audited DTO and deleted `origin = 'calendar'` activities detach their
        links (both in P2-8, as of 2026-11-26); activities created while a row was stopped get no link until the P2-3c backfill.
        Tested against the fake provider, recorded Google / Graph answers and in-memory doubles; not run against a
        real SQL Server, Google or Microsoft.
  - [x] **P2-3c: backfill, send invitations, sync status UI** (2026-11-26, admin-managed model, addendum §8.3) — no
        migration. First-sync backfill (`sync.backfill.ts`): the `enrolled` job of a row that is `ok` with
        `backfillCount` null copies the owner's Planned, create-eligible activities that aren't over and start within
        `backfillDays` (keyset pages of 200, short transactions under the activity locks, D45 retry outside the
        transaction), activities with guests as private copies (`invites='withhold'`, D23), then pushes them 100 per
        round (`ENROLLED_PUSH_BATCH` = the spec's CONNECT_PUSH_BATCH); `backfilledAt` = a run stamp claimed first and reused by a re-run, `backfillCount` (links with the stamp) written last;
        the poll tick re-queues rows `ok` without a backfill after a 10-minute grace, the Redis-down fallback tick
        backfills one per tick. `POST /api/activities/:id/calendar-sync/retry` (owner / editors; Add again = a new
        generation for an event deleted in the calendar; a non-owner's Add again on an activity with guests makes a
        private copy, D41) and `/send-invites` (owner only, D41; refused while the event is gone; audited
        `SEND_INVITES`). Held guests are kept by identity (`user:` / `contact:` keys), so a contact who gets an email
        later stays held. `ActivityView.calendar.invitesWaiting` / `copyReason`, `CalendarItem.syncState`, own
        calendar `backfill` progress, admin `workerStatus` / `syncEnabled`. UI: `ActivitySyncStatus` in the activity
        drawer (state line, private copy / held boxes, Send invitations, Waiting for <owner>, Retry / Add again,
        Open in Google Calendar / Outlook), calendar-aware delete / cancel / owner-change confirmations, the
        Attendees hint, the list's hidden Calendar column, server skips in the bulk-delete toast, the calendar's
        error dot, the admin Sync worker fact, the provider switch-on confirmation and the profile card's backfill
        line. Deviations: Add again resets the link to a new generation (no `force` flag in job data); a backfilled
        copy is told from others by `link.createdAt = connection.backfilledAt` (no column; done = `backfillCount` set); the `enrolled` job fires
        on every recovery (P2-3b's push on recovery kept), the backfill runs only once; no per-activity notification
        for backfilled private copies (the profile card shows the count). Tested with in-memory doubles and the
        fake provider; not run against a real SQL Server, Google or Microsoft.
  - [x] **P2-4: follow-ups create activities** (2026-11-26) — migration `20261127130000_followup_activities`
        (`Activity.origin` `crm` / `followup` / `calendar`, hand-written filtered unique index
        `UX_Activity_openFollowUp`). `activity.followUp.ts`: pure planner `planFollowUpChange`,
        `reconcileRecordFollowUp` (needs a `FollowUpContext` loaded before the transaction), cancel on delete, relink on
        Convert Lead, `retryOnceOnUniqueViolation` (D45), and `rescheduleRecordFromCalendar` (inert until P2-5). Hooked
        into lead / opportunity create, update (the lead transaction returns `{ after, plan }`), remove, bulk remove,
        restore, conversion and imports, under the record lock. Follow-up activity `createdBy` = the record's creator;
        Task / Note / blank type → Call; Closed Won / Lost → always Cancelled (no response at a closed stage); an early
        completion keeps its slot. Locks: `409 FOLLOW_UP_ACTIVITY_LOCKED`, delete refused, bulk delete skips,
        `ActivityView.lockedFields`, audit undo blocks the locked fields with a reason. Calendar feed: follow-up
        activities under the follow-up sources (not draggable), derived items deduped per caller's scope. Morning
        email leaves follow-up activities out. Backfill `npm run followups:backfill [-- --dry-run]` + nightly step.
        Switch "Follow-ups create activities" on Admin › API Integrations (D44). Frontend: Follow-up chip, Record
        follow-up action, locked fields in the form, Next follow-up box on Activities tabs, form hint and save
        message, lead / opportunity writes refresh every activity query. Not run against a real SQL Server (migration
        checked with `prisma migrate diff`). Review fixes (2026-11-26): system writes keep a deleted organization /
        contact the mirrored record still points at (an opportunity save no longer fails with 400); an organization
        rename rewrites the derived subject of its unnamed opportunities' follow-up activities
        (`renameOrganizationFollowUps`); a follow-up activity whose slot already passed is written with its reminder
        marked sent (`quietPastReminder`, no reminder burst on the deploy-day backfill); the Activities tab's Next
        follow-up box uses the record's own date while the switch is off.
  - [x] **P2-5: calendar → CRM (polling)** (2026-11-26) — no migration (uses `syncCursor` / `syncWindow*` /
        `fullSyncAt` / `lastPulledAt`, `Activity.externalUpdatedAt`, link `etag` / `baseJson`). Adapter method
        `listChanges` (Google `events.list` + sync token, full resync on 410; Graph `calendarView/delta`, monthly
        re-baseline), `pull` jobs on `crm-calendar-sync` (poll fan-out inside `CALENDAR_SYNC_HOURS` every
        `CALENDAR_POLL_MINUTES`, Redis-down fallback ≤ 5 per tick, nightly Outlook re-baseline), `pullConnection`
        (lease, classify, three-way merge, deletions / reconfirm, relinks by marker / syncKey, verify-missing on full
        syncs, cursor held while changes fail), follow-up moves written to the lead / opportunity
        (`rescheduleRecordFromCalendar`, timed → all-day keeps the time with a 7-day note). `POST
        /api/calendar-connections/sync` (Sync now / page pull, 6 / min / user) and admin `POST
        /people/:username/calendar/sync`. UI: Sync now on the Company calendar card and in the admin's calendar dialog,
        the silent pull on opening the calendar page, "Updated from Google Calendar / Outlook" and unsupported /
        too long / follow-up notes in the activity drawer. Recurring and > 31-day events are skipped with a reason
        (R20, owner decision). Tested with the fake provider and hand-written provider answers; no real SQL Server,
        Google or Microsoft call. Follow-up (2026-11-27): Sync now / page / admin pulls follow P2-7's pending-only rule
        (`pendingOnlyPullJobId`): a finished or running job of the same 10 s bucket no longer silently absorbs them
        (fresh id `pull-<conn>-<bucket>-<ms>`); the poll fan-out keeps its bucket id. A state read that times out
        returns null at once (in-process pull after one 3 s wait, not two).
  - [x] **P2-6: busy times** (2026-11-26) — no migration. `GET /api/activities/busy?users&from&to&exclude&suggest`
        (`modules/calendar-sync/busy.*`): up to 20 people, ≤ 31 days, times only (D11). CRM part: Planned activities
        (owner, or invited colleague not declined; Site Visit all-day → `away`), cached 30 s and dropped by activity
        writes. Calendar part: new adapter method `freeBusy` (Google `POST /freeBusy` as the requester, then per
        colleague; Microsoft app-only `getSchedule`; the fake provider too), through `withCalendarAccess`, 5 s, one
        try, ≤ 14-day windows, ≤ 5 at once, cached 60 s per person in Redis (in-process memo while Redis is down).
        Not enrolled / excluded / row in error / provider failing → CRM only, marked by `status`. `exclude` stops an
        activity being moved from blocking itself; `suggest` returns the first common free slot (09:00–19:00, 15-min
        grid, 7 days). Rate limit 60 / min / user with an in-memory fallback. Review fixes (2026-11-26): `exclude`
        drops only an identical calendar block; a requester call that fails as a whole doesn't fan out per
        colleague; busy reads are `readOnly` (a refused call marks no row / provider health); 8 s provider deadline,
        120 provider calls / min / user, windows and cache keys on the 15-minute grid; the strip debounces, ignores
        the previous answer while loading and keeps gap buttons ≥ 32 px (chips on phones). Independent of P2-3b (no
        `ActivityExternalLink`). Frontend: `ActivityBusyTimes` strip with "Everyone free" gaps and "Find a free
        time" in the activity form (page, quick-create behind "Check availability") and the Reschedule dialog;
        calendar "Show busy times" background bands in week / 3-day / day views. Not run against a real SQL Server,
        Google or Microsoft (fake provider and recorded-shape `fakeFetch` tests only). Owner check before relying on
        Microsoft: `getSchedule` under the Exchange RBAC scope (first-run check F7).
  - [x] **P2-7: webhooks and HTTPS go-live** (2026-11-26) — migration `20261215090000_calendar_watch_channels`
        (`CalendarWatchChannel`). Adapter methods `watch` / `renewWatch` / `stopWatch` / `watchExists` (optional on the
        interface): Google `events.watch` on `primary` as the person (7-day ttl) and `channels.stop`; Graph app-only
        subscriptions on `users/{mailbox}/events` (10,000 of the documented 10,080 minutes, lifecycle URL) with
        `PATCH` / `DELETE` / `GET`; the fake provider too. `sync.channels.ts`: ensure / renew (Google: new channel then
        stop the old; Graph: `PATCH`, 404 → re-create) / stop / lifecycle, token and `clientState` = HMAC with the key
        ring's HKDF `webhook` subkey (no secret column; every ring key verifies, so rotation works), channel ids tagged
        with the public address so an address change replaces them; created after enrolment, by the poll (≤ 20 per
        tick) and nightly (Graph existence check, strays stopped, old rows deleted); a refused watch leaves a `failed`
        row retried after 6 h and never marks the person or provider. Stopped best effort when a row stops or the
        provider is switched off, and nightly while webhooks are off. `/api/webhooks/google/calendar`,
        `/microsoft/calendar`, `/microsoft/lifecycle` (no sign-in, HMAC-verified, own body limits, 600 / min / IP,
        answer first then work; forged Google pings and Graph notifications refused before any database read, Graph
        `clientState` = `<conn>.<generation>.<HMAC>`). D26: a ping stamps Redis and queues `pull-<conn>-w<10 s bucket>`
        (2 s delay) unless that job is still pending; while it runs the stamp queues `pull-<conn>-n<stamp ms>` after
        it, once finished a fresh `…-w<bucket>-<ms>`. A refused replace backs off 6 h while the old channel delivers.
        Outside `CALENDAR_SYNC_HOURS` change notifications are dropped unread (Azure SQL sleeps; the morning poll
        covers them), lifecycle ones handled at any hour. Safety-net poll every `CALENDAR_POLL_MINUTES_WITH_WEBHOOKS`
        (default 30) for people with a healthy channel. `CALENDAR_WEBHOOKS_ENABLED` (default true), live only with an
        https `PUBLIC_API_URL`. Admin › API Integrations: server-wide state and interval, a webhook line per provider
        card, a per-person chip on People. Go-live checklist and runbook: system design §9.2.2. Tested with the fake
        provider, hand-written Google / Graph answers and in-memory doubles; no real SQL Server, Google or Microsoft
        call.
  - [x] **P2-8: customer meetings from the calendar + replies both ways** (2026-11-26; optional, off by default) — no
        migration (the `Activity` organizer / `syncKey` columns, `ActivityExternalLink.role = 'attendee'` and
        `CalendarSyncUser.importMeetings` already existed). Pull (`sync.import.ts`): with the company switch
        `allowMeetingImport` and the admin-set per-person "Import customer meetings" on, a customer meeting (D17:
        timed, single, not private, not declined, not too long, now − 1 day … now + 180 days, a known contact among
        the guests) becomes an activity with `origin = 'calendar'`, type `importFollowupType`, `createdBy =
        'calendar-sync'`. D18: a colleague organizer who imports owns it; an outside organizer → the person owns it,
        `externalOrganizer`, organizer columns, CRM locks on subject / times / all-day / location / attendees / owner
        (`409 EXTERNAL_EVENT_LOCKED`; related record, remarks, customer response, Completed and custom fields stay
        editable; undo / revert refused). D45: two colleagues on one meeting share one activity (pre-read `syncKey`
        holder) with one link each (the second an `attendee` link); a deleted imported activity keeps its `syncKey`
        and detaches its links (never imported again). Replies both ways: an attendee copy's own reply comes in
        three-way against `baseJson { self }`, audited `RSVP` by that person; a CRM reply queues the `rsvp` job
        (`rsvp-<activityId>-<username>-<respondedAtMs>`): Google GET + PATCH `attendees` with `If-Match` and
        `sendUpdates=all`, Graph `accept` / `tentativelyAccept` / `decline` with `sendResponse: true` (app-only),
        the copy found lazily by iCalUID; a refusal (F3) is recorded on the link (`rsvp_refused`) and marks nothing
        unhealthy. The nightly completes past imported meetings with no related record. Handing a meeting to an
        invitee turns their attendee link into their organizer link. The owner of a customer's meeting replies too
        (Decline cancels it, Accept / Maybe revive it; kept on their link as `baseJson.mine`). Turning either switch
        on starts one full pull per affected calendar (meetings already there come in). Without Redis a reply is
        retried in-process up to 5 times. Races: this person's own organizer copy is relinked, never attended; an
        invitation copy of a colleague's CRM meeting whose push hasn't stored its identity yet attends it. A push of
        an imported organizer link whose type stopped going to calendars detaches instead of deleting the event
        (review fixes, as of 2026-11-27). Admin › API Integrations: the company switch and the import type (active,
        ticked under What goes to calendars, not Task / Note); People dialog: "Import customer meetings" (admins only, `409
        MEETING_IMPORT_OFF` while the company switch is off; no self-service). Drawer: "Imported from …" / "Organized
        by …" caption, an Organizer field, no Reschedule or time edits for outside meetings; the form shows the
        locked fields. No new wake-up (imports ride the pulls, the auto-complete the 00:25 nightly). Owner steps:
        run first-run check F3 (a Google reply to an invitation copy); if refused, decide on the broader
        `calendar.events` scope (code + Admin console). Tested with the fake provider, hand-written Google / Graph
        answers and in-memory doubles; no real SQL Server, Google or Microsoft call.
        Merged with P3-1 and recurring activities (as of 2026-11-27): `videoMeeting` joins the outside-meeting lock
        (`409 EXTERNAL_EVENT_LOCKED`, checked before the P3-1 video rules); the organizer's `ready` Meet / Teams join
        link is taken over read only on import and mirrored by the designated attendee link (cleared when the
        organizer removes it; no audit entry, never pushed); imported meetings never repeat (`assertRepeatable`) and a
        series edit never rewrites or cancels an `externalOrganizer` row (`isRewritable`).
        Second review fixes (as of 2026-11-27): an outside meeting can't become Task / Note (`409 EXTERNAL_EVENT_LOCKED`
        on `followupType`; the form leaves them out) and no join link is mirrored onto a Task / Note; a meeting the
        employee organized brings its own Meet / Teams link along at import (adopted as on a pull; the CRM never writes
        an imported meeting's description, so its agenda / Teams block stays); a cancelled copy can't be answered (no reply buttons, `403`); the `rsvp` job keeps an owner's newer
        reply saved while its call was in flight; when the last copy the CRM follows is cancelled and the owner holds
        none, the meeting is Cancelled (so the nightly never completes it), and Planned again if the copy returns; a
        restored activity (imported or CRM-made) and a re-activated connection row re-attach their invitation copies,
        which the next pull reads back once (a copy cancelled meanwhile cancels as usual); a cursor dropped while a pull
        runs stays dropped (the cursor is saved only over the one the pull started from) and the import switch-on's full
        pull is never absorbed by a running poll job; import can't
        be on with a type that stopped going to calendars (checked on every save while on; the card blocks Save).
- [ ] **Calendar Phase 3: video meetings** (spec §16, adapted to admin-managed connections; as of 2026-11-27 P3-1 Meet / Teams is done and P3-2 Zoom is parked by the owner because Zoom has no company-wide admin connection)
  - [x] **P3-1: Google Meet + Microsoft Teams links** (2026-11-26) — migration `20261215100000_activity_conference`
        (`Activity.conferenceProvider` / `conferenceState` / `conferenceJoinUrl` / `conferenceId` / `conferenceError` /
        `conferenceRequest`; option meta `videoMeeting: true` on Meeting and Demo / Presentation). Built-in form field
        `videoMeeting` (Activities › Schedule, after Location; hidden for Task / Note); Admin › API Integrations › What
        goes to calendars › "Offer a video meeting on" (`PUT /api/integrations/video-types`). The **owner's** company
        calendar makes the link through `withCalendarAccess` (no per-user OAuth): Meet with Google
        (`conferenceDataVersion=1`, `createRequest` `<requestedId>-c<n>`, `pending` → `conference` job, 5 s × 5),
        Teams with Microsoft 365 (`isOnlineMeeting`, `onlineMeeting.joinUrl`; locked once ready, `409
        VIDEO_MEETING_LOCKED`). `409 VIDEO_PROVIDER_NOT_CONNECTED`, `GET /api/activities/video-options`,
        `POST /api/activities/:id/conference/retry`; inbound Meet / Teams links on push answers and on P2-5 pulls of organizer copies taken over read only (a pull
        records `ready` links only, never clears a requested one);
        join details in the event description (one extra quiet push once ready). Review fixes: every wait ends in
        `ready` or `failed` (400 refusal → event synced without the link, `not_created` / `no_event` /
        `event_refused`, worker last attempt, nightly sweep of links `requested` > 1 h); owner changes never blocked
        (new request, or `failed provider_unavailable`); Teams lock out of `lockedFields`; Video meeting can't be made
        Required. Frontend: form select (owner's options, Zoom disabled "later"),
        drawer Join / copy / "Creating Meet link…" / error + Retry, calendar chip icon and agenda Join, record
        Activities tab icon + Join (agenda clicks on Join / copy no longer open the drawer; 32 px copy target),
        hidden list column "Video meeting", `newActivityHref` `video=`. Not run against a
        real SQL Server, Google or Microsoft (fake provider and recorded-shape `fakeFetch` tests only). Owner steps:
        Meet on for the Workspace org, Teams licences for owners, first-run check that `calendar.events.owned` under
        domain-wide delegation accepts `createRequest` (else switch the delegated scope to `calendar.events`).
        Follow-up done (2026-11-27, migration `20261216110000_booking_video`): booking links' default video meeting
        (see Booking links below). `DrawerCopyButton` now has a 32 px hit area everywhere (default `minTarget` 32 via
        an invisible `::before`, visual size and layouts unchanged; Join keeps its 32 px box through `boxSize`).
  - [ ] **P3-2: Zoom** (per-user OAuth, `CalendarConnection kind='video'`; the option stays disabled until then)
- [x] **Phase 4 (later; spec §17)**: booking links, recurring activities, email logging (all three done as of 2026-11-27).
  - [x] **Booking links (public scheduling page on free/busy)** (2026-11-26) — migration `20261128120000_booking_links`
        (`BookingLink`, `BookingLinkBooking`; `Activity.origin` gains `booking`, notification kind `booking_created`).
        Company switch (default off) and "who may create links" (everyone / managers and admins / admins) on Admin ›
        API Integrations (`ModuleSetting activities/bookingLinks`). `/booking-links` (user menu and mobile drawer):
        an employee's links (admins: everyone's, and links for a colleague), create / edit (type, durations, location,
        note, weekly hours in the business zone, buffers, notice, days ahead, bookings a day, reminder, phone /
        company questions, optional related record), copy, on / off, new address, latest bookings. Public page
        `/book/<slug>` (no sign-in, no app shell, phone first): free starts from the owner's CRM activities and
        company calendar through P2-6 `busyTimes` (fail closed when the calendar can't be read), HMAC-signed slot
        tokens (`BOOKING_SIGNING_KEY` or derived from `JWT_SECRET`), booking re-checked in one transaction under a
        per-owner lock (D45), a Meeting activity through `insertSystemActivity` (actor `system`, origin `booking`,
        the visitor as an `email` attendee, a single matching Contact linked), the owner's bell notification, an
        on-page confirmation with an `.ics` file (no email: the mail layer stays parked). Public API: own router,
        16 KB body, one identical 404, rate limits per IP and per link (in-process fallback, never open), honeypot,
        audit route `public:booking`. No job, no polling (DB wakes only when a page is open). Calendar push follows
        automatically once P2-3b's write hook is merged (invitation held for the owner under D41). Review fixes
        (2026-11-26): per-link limits count only real attempts; slot pages read busy times in fixed 14-day blocks and
        bookings re-read on their own provider budget; a resubmitted token gets its confirmation even after the busy
        check or expiry would refuse it; owners of links always see the menu item (`ownsLinks`); the page keeps typed
        details, hides another duration's times while loading and retries after network errors. Not run against a
        real SQL Server, Google or Microsoft (doubles only). Later: email confirmations and visitor cancel /
        reschedule (mail layer), team / round-robin links, custom questions.
        Default video meeting (2026-11-27, migration `20261216110000_booking_video`): `BookingLink.videoMeeting`
        (meet / teams / none; Zoom never) chosen in the dialog from the link owner's calendar (`GET
        /api/activities/video-options?owner=`, unavailable choices disabled with the reason; all left selectable when
        that check fails, so the API's 409 decides), validated on save (type
        offers video, else 400; `409 VIDEO_PROVIDER_NOT_CONNECTED`), copied onto the booked activity so the P3-1 push
        asks for the link (booked without one, with a note in the remarks, when the type or the owner's calendar no
        longer allows it). The page and `.ics` say "Google Meet / Microsoft Teams link: sent by <owner>"; the
        confirmation shows the join URL only if it is already ready (no polling). Doubles and the fake connection
        reader only; no real SQL Server, Google or Microsoft.
  - [x] Recurring activities (CRM-authored series, R12 occurrence rows). Done 2026-11-26 (migration `20261215110000_recurring_activities`): an `ActivitySeries` rule (daily / weekly on weekdays / monthly on a day or the nth weekday, every N, ends on a date or after a count, business timezone) with one `Activity` row per occurrence (`seriesId` + `originalStartAt`, filtered unique index) over a rolling 90-day horizon extended by the 00:20 nightly job; a Repeat control on the activity form and quick create (not Notes, not follow-ups); "This event / This and following / All events" for saves, cancels and deletes; occurrences pushed to calendars as single events inside a 14-day window; "Repeats …" in the drawer and a repeat mark on the calendar. Tested with in-memory doubles only, not against a real SQL Server, Google or Microsoft.
  - [x] **Email logging** (2026-11-26) — migration `20261216100000_email_logging` (`LoggedEmail` with the filtered
        unique `UX_LoggedEmail_messageIdHash`, `LoggedEmailCopy`, `LoggedEmailLink`, `LoggedEmailMailbox`). Admin-managed
        only: company switch "Log emails with customers" (default off), default for people (off), visibility
        (`restricted` default / `record`), retention (6–36 months, 24) and snippets on Admin › API Integrations
        (`ModuleSetting activities/emailLogging`); per-person switch, status, "Log now" and purge in People › calendar;
        read-only status on My Profile. Mail from the existing Google service account (DWD `gmail.readonly`) and
        Microsoft app (`Mail.Read`, Exchange RBAC for Applications recommended): Gmail `history.list` (404 → bounded
        7-day resync), Graph inbox + sentitems delta, ≤ 200 messages / 20 pages per run, a DB lease per mailbox, riding
        the calendar poll tick inside `CALENDAR_SYNC_HOURS` (≤ 25 mailboxes a tick, every `EMAIL_LOG_POLL_MINUTES`,
        default 15). From / To / Cc only (never Bcc) against live contact / lead emails, plus the contacts'
        opportunities; internal-only, private ("Private" / "Personal" / "No CRM" labels, Outlook sensitivity) and
        automated mail skipped unless a matched contact sent it. One row per Message-ID across employees (D45: inserts
        outside transactions, the index decides). Headers and a ≤ 500-character plain-text snippet only. "Emails" tab on
        Contact / Lead / Opportunity drawers (newest first, "Open in Gmail / Outlook" for the employee's own copy).
        Nightly bounded retention; audit of switches and purges. Missing scopes show as a provider problem and pause
        mail runs, never calendar sync. Not run against a real SQL Server, Google or Microsoft (fake provider and
        recorded-shape `fakeFetch` tests only). Review fixes (2026-11-27): mail from before the logging start (switch,
        person or default turned on, last purge) is never logged and switching off clears cursors; a purge takes the
        mailbox lease and a run it overtakes removes its rows; Bcc / list copies never show as participants to others;
        dedupe keyed on Message-ID + sender and a 48 h sent-time check; times capped at now + 5 min (Graph received
        mail by `receivedDateTime`); snippets cleared and hidden when switched off; continuation runs get their own
        job id, poll jobs run at a low priority; a Graph message deleted before its header read is skipped; service
        tests for the record list. Owner steps: add `gmail.readonly` to the DWD entry, grant `Mail.Read`
        (scoped with RBAC for Applications), tell employees. Later: an Emails tab on the full record pages, an
        explicit "Log this email" from the record, Graph `$filter` on delta checked against a real tenant.

### Phase 15 — Documents (P2, 2026-11-25)

- [x] **Documents module** (2026-11-25) — Activities › Documents (modelled on the old CRM's Documents list): the
      documents added on opportunities (Documentation section: Document No, Document Date, Upload Doc; Remarks was removed on 2026-11-26), now
      kept in their own `Document` table (one per opportunity; existing ones migrated). Read-only: no create form,
      documents are added and changed from the opportunity form. Table with Document No, Upload Doc (opens the file),
      Document Date, Opportunity, Sales Stage, Organization Name, Assigned to, Added By and Date Created; search,
      the Filter dialog, My Documents / Added in 7 Days pills, bulk Export to CSV and Download Selected Files,
      pagination; row → side drawer, eye → detail page with an inline preview of PDFs and images.
- [ ] Not in the first version: Category / Sub Category / Expiration Date (the opportunity form doesn't ask for them),
      several documents per opportunity, a Documents tab on the opportunity's related records, global search.

### Phase 16 — Holidays (P2, 2026-11-26)

- [x] **Admin › Holidays** (2026-11-26) — the company holiday list (modelled on the old CRM's Holidays list):
      Occasion, Holiday Date, Day and Status (Active / Inactive, as on Referrals; a Holiday Type column was dropped the
      same day). Add and edit in a dialog; search, year / status filters, sorting, pagination; bulk Mark Active,
      Mark Inactive and Delete. Import from .csv / .xlsx / .xls with a downloadable template, column mapping and a server
      check before saving that marks each row new, duplicate (already in the list or repeated in the file, skipped) or
      error. Same date + occasion can't be saved twice (unique index, 409 `DUPLICATE_HOLIDAY`). Audited (entity
      `Holiday`, CONFIG). Active holidays show on the Calendar page as amber day shading plus an all-day chip (agenda
      too), and the activity Start / End fields (form, quick create, reschedule) note when a day is a holiday. Import
      date cells are now read as the day written (they came out a day early east of UTC). **Repeats every year**
      (2026-11-26): a switch on the form swaps the date for Day and Month pickers; the list shows "Every year", the
      calendar puts the holiday on its day in any year (29 Feb on 28 Feb in other years), and import reads dates
      without a year (or a Repeats Every Year column) as yearly.
- [ ] Later, if wanted: holidays in the morning summary email, a warning on lead / opportunity Next Follow-up dates,
      per-branch holiday lists, and a "copy last year's holidays" action.

### Phase 17 — User profile (P2, 2026-11-26)

- [x] **Profile Phase 1 (PR1): My Profile and Security** (2026-11-26) — a `/profile` page for every signed-in user, opened from the
      navbar user menu ("My Profile") and the mobile drawer. Header card with a large avatar (change photo: pick, crop
      to a circle with zoom and drag / arrow keys, saved as a 256 × 256 WebP ≤ 512 KB; remove photo), name, role,
      department, username and last sign-in. **Profile** tab: first name (required), last name, mobile and office
      phone (E.164), saved with `PATCH /api/me/profile`; read-only work details (username, work email, role,
      department, member since). **Security** tab: change password (current / new / confirm with a live checklist:
      8–128 characters, a letter and a number, not the username, not the current password; the API enforces the same
      rules) which signs out every other session; "Where you're signed in" lists the Redis sessions (device from the
      User-Agent, IP, signed-in time, "This device") with Sign out per row and "Sign out of all other sessions"; when
      the password was last changed. Users table gains `firstName`, `lastName` (existing names split at the first
      space), `officePhone`, `passwordChangedAt`; `fullName` stays and is rebuilt from the names when a name changes (names are split from `fullName` when the
      stored parts are missing or stale, e.g. users created outside the app); photos
      in a new `UserPhoto` table served from `/api/user-photos/:id` (immutable URLs). The navbar and mobile drawer show
      the photo (initials otherwise) and the full name, read from `GET /api/auth/me` (now from the database). Audited:
      profile / photo edits (User `UPDATE`), `PASSWORD_CHANGE`, `SESSION_REVOKE` (SECURITY, NOTICE). User pickers'
      cache is now read guarded and dropped by profile edits. Not in Form Builder (user fields are admin settings);
      old-CRM fields such as Nature of Calls, Principal Company, cost and live tracking are not carried over.
- [x] **Profile Phase 2 (PR2): Admin › Users** (2026-11-26) — `/admin/users` (admin roles; a card on the admin
      landing page; not in Form Builder): a searchable, filterable list (Active / Inactive / All, role, department;
      cards on phones) with status chips (inactive, on leave, group login, must change password, email issue) and row
      actions; add / edit in a drawer: first / last name, username (set once at creation: lower-case letters, digits,
      `.`, `-`, `_`, 3–50, never changes), work email under the company email rule shared with Admin › API Integrations
      (`users/userEmail.service.ts`), role picked from the roles in use or typed (badges for "Admin" = admin panel and
      "Sees all" = every record; access stays decided by the role's name), a new free-text **job title**, department
      picked or typed, **reports to** (no cycles), mobile / office phone, group login and on-leave switches. New users
      and admin resets get a generated temporary password (or one the admin types), shown once, and **must change
      it** at next sign-in: the token's `mcp` claim limits the API to the change-password routes
      (`403 PASSWORD_CHANGE_REQUIRED` elsewhere) and the app sends them to My Profile › Security until they do.
      Deactivate / activate (guards: not yourself, not the last active admin); deactivation, a reset and a role change
      sign the user out of every tracked session. My Profile shows job title and reports to (read-only). Users table
      gains `jobTitle`, `reportsToId`, `mustChangePassword`, `createdBy`, `deactivatedAt`. Audited as the acting admin:
      User `CREATE` / `UPDATE` / `STATUS_CHANGE` and the new `PASSWORD_RESET` (SECURITY, NOTICE). Other screens'
      avatars are unchanged in this PR. Out-of-office dates are Phase 3 (only the on-leave switch here).
      *Temporary passwords and must-change-password were replaced on 2026-11-27 by emailed set-password links (next
      item).*
- [x] **Invite links instead of temporary passwords** (2026-11-27) — adding a user emails their work address (now
      required) a one-time link `${APP_PUBLIC_URL}/set-password?token=…` (256-bit token, only its SHA-256 stored in the
      new `UserInvites` table, 72 h, single use). The public `/set-password` page asks for the new password twice with
      the app's rules (no current password, no sign-in), then signs the user in and opens the dashboard. Admin › Users
      shows **Invited** / Active (plus "Invite expired" / "Invite not sent" / "Reset link sent"), and a row action
      **Resend invite** (an Invited user; also renews an expired link) or **Send password reset link** (an active
      account; the current password works until the link is used, which signs them out everywhere), each revoking older
      links. A failed email is shown to the admin with the mail server's reason (also right after Add user). Public
      routes `POST /api/auth/invite/verify` and `/invite/accept`: one generic `INVALID_INVITE` for every bad link,
      constant-time hash compare, 30 / 15 min per IP, tokens never logged. Removed: temporary passwords, the
      `mustChangePassword` column (users who still had one become Invited and need an invite), the `mcp` claim and
      `403 PASSWORD_CHANGE_REQUIRED`, `POST /admin/users/:id/reset-password` (now `/send-invite`). New audit actions
      `INVITE_SENT`, `PASSWORD_SET`. Deploy: `npm run db:deploy`; email must be on (`MAIL_ENABLED`, `SMTP_*`) and
      `APP_PUBLIC_URL` set to the CRM's public address.
- [x] **Profile Phase 3: Notifications & preferences** (2026-11-26) — a **Notifications** tab on My Profile
      (`/profile?tab=notifications`, not in Form Builder; `GET` / `PATCH /api/me/preferences`), stored in a new 1:1
      `UserPreference` table (no row = defaults, so nothing is backfilled). A user can turn off each bell kind
      (activity reminders, assignments, invitations, contract renewals; applied in the notification producer, on every
      path; kinds added later, such as `calendar_reconnect`, always deliver) and the morning summary email; pick a
      **default reminder** for activities they create (company default, No reminder or a reminder label; pre-fills the
      form only); and set **out of office** dates (inclusive, at most 365 days) with an optional message: while out of
      office (or on leave) the morning summary is skipped and pickers, the assigned-user card and Admin › Users show
      "Out of office until <date>" / "On leave". Bell notifications keep arriving. The bell footer links to the tab and
      the morning email preview says when and why it won't be sent. Changes audited as User `UPDATE`. The admin On
      leave hint now says what it does (shown when picked, no morning summary). Not done, by decision: reminder emails
      (no bell kind sends email, so the matrix shows only an In app column), per-invitee reminder offsets, admins
      editing someone's out-of-office (they see it), and hiding away users from pickers (they are labelled).
- [x] **Profile Phase 4: Connected accounts** (2026-11-26) — a **Connected accounts** tab on My Profile
      (`/profile?tab=connected-accounts`, between Notifications and Security; hidden while the user must change their
      password) hosting the Calendar thread's `CalendarConnectionsCard` unchanged (at the time: Google / Microsoft 365
      connect, reconnect, disconnect; status only since Calendar P2-2b, same export and props). The OAuth callback (`CALENDAR_CONNECTIONS_PAGE`, `…&calendar=connected|error&reason=&provider=`),
      its sign-in `?next=`, `calendar_reconnect` notification links (computed on read, so older rows follow) and the
      calendar's reconnect banner now open the tab; the card drops only its own callback params, so `?tab=` stays. The
      "Connected calendars" user menu and mobile drawer items are removed (the tab is reached from My Profile); the temporary
      `/connected-calendars` page is only a client redirect to the tab that keeps the query string (old bookmarks,
      callbacks in flight). Contract test: `ROUTES.PROFILE_CONNECTED_ACCOUNTS` equals the API constant and ProfileView
      has that tab. The company email editor and its unique index (`UX_Users_email`) already shipped with Calendar
      P2-1 / P2-2 (Admin › API Integrations › People, `users/userEmail.service.ts`). Only calendars are listed for now
      (no other account kinds).
- [x] **Profile Phase 5: Admin › Company formats** (PR5a + PR5b, 2026-11-26) — one company-wide setting on a new admin page
      (`/admin/company-formats`, not in Form Builder; `GET` / `PUT` / `DELETE /api/company-formats`, new single-row
      `CompanyFormatSettings` table): date format (`DD-MMM-YYYY` default, `DD MMM YYYY`, `DD/MM/YYYY`, `DD-MM-YYYY`,
      `MM/DD/YYYY`, `YYYY-MM-DD`), 12- or 24-hour time, Indian or international number grouping, with a live preview.
      A shared pure formatter core (`company-formats/core/displayFormats.ts`, copied to `frontend-crm/src/lib/display-formats`
      by `npm run sync:display-formats`, guarded by `contractSync.test.ts`). **No row = not customized**: every converted
      site keeps its own pre-Phase-5 style (legacy hints, golden "today" table in `displayFormats.test.ts`), so nothing
      changes until an admin saves; the first save unifies the styles; "Reset to CRM defaults" deletes the row.
      Applies to the main frontend choke points (`utils/date`, drawer fields, activity labels, form view mode, custom
      field values, record footer, list amounts, line items, scorecards, the calendar's time labels) and on the backend
      to quotation PDFs (dates, amounts, numbers, amount in words: million / billion for international grouping; PDF
      cache key includes the formats), the morning summary email, new bell notification texts and audit display
      times. Audited as `CompanyFormats UPDATE` (CONFIG). Not done, by decision: a currency choice (fixed INR; opportunities
      and quotations keep their per-record currency), a per-user locale, the timezone (stays `BUSINESS_TIMEZONE`),
      native date / time pickers (browser format) and exports (fixed format), and re-formatting stored text
      (notifications already sent, lead rating reasons, saved PDFs). Exactness exceptions: `Sept` → `Sep`, `-₹5`
      instead of `₹-5`, frontend instants in the business timezone instead of the device's.
- [x] **Profile Phase 5b: remaining format call sites** (2026-11-26) — moved the ad-hoc formatters still outside the PR5a
      choke points onto `utils/formats`, each with its legacy hint so nothing changes until an admin saves; after a save
      every screen follows the company formats and the admin page says "all screens": private date / time helpers
      (`integrationUi.tsx`, `profileUi.tsx`, `auditLogUi.tsx`, `TableFilterModal.tsx`, `followUpEvents.ts`,
      `FollowUpDecision.tsx`, `TicketBadges.tsx`, `contractDates.ts` + `contractColumns.tsx`, `holidayDisplay.tsx` (needs a
      yearly `DD-MMM` pattern), `applyFilter.ts`, `EmailVerification.tsx`, `EmailValidationView.tsx`,
      `ScorecardsAdminView.tsx`, `PdfTemplatesListView.tsx`, `DocumentSeriesView.tsx`, `AuditEventsChart.tsx`); raw ISO
      or baked strings (`leadColumns.tsx`, `opportunityColumns.tsx`, `relatedModules.config.tsx`); record counts
      (`DataTablePagination`, `DataTableToolbar`, `DataTableFilterPills`, `SearchResultsView`, `OrganizationsMasterView`,
      `ActiveFilterChips`, the five audit count helpers, `AuditIntegrityPanel`, `ScorecardPreview`, `utils/documentSeries.ts`);
      inline formats (`DrawerLayoutRenderer` %/discount, calendar titles and `CalendarFilters` for MM/DD order,
      `TimePicker` hints under 24h); backend `auditAdmin.present.ts` `cellValue` / `namedValue` (new behaviour once saved:
      days, date-times and amount-type fields in audit Before / After values, entry details and the undo preview; exports
      stay fixed), the `summarize()` export count and the `opportunity.validator.ts` commission message (mirrored in the
      frontend schema; `₹1,000` in both groupings). The legacy hints stay for now.

### Phase 18 — Security module (P1, started 2026-11-27)

Modelled on SuiteCRM's Users admin area. Audit of what existed (2026-11-27): User Management done (Admin › Users);
Role Management partial (fixed role names in code, admin panel and "sees every record" by name); Password
Management partial (fixed policy in code, change password, invite and reset links, sign-in rate limit per IP);
Security Groups and Security Settings missing.

- [x] **Role Management** (2026-11-27) — `Roles` table (migration `20261220100000_roles`) seeded at start-up from the
      role names in use with the access they had, so nothing changes on deploy. `/api/admin/roles` (list, create,
      edit, delete moving the users to another role; Super Admin locked; guards against removing your own or the
      last admin panel). Per-module View / Create / Edit / Delete / Export / Import at All, Own or None for leads,
      contacts, organizations, opportunities, quotations, contracts, tickets, referrals, activities, documents,
      products and partner companies, enforced by `requirePermission` on every module route, `buildAccessScopeWhere`
      / `assertRecordAccess` on lists and records, the import route and global search. `requireAdmin` (the role's
      admin panel switch) replaced the hard-coded admin role list. Admin › Roles page (card grid, editor with the
      permission grid and presets, duplicate, delete with reassign); Admin › Users picks roles from the table only;
      the app hides New, Import, Edit, Export, Convert, Quick Create items and modules the role can't use.
- [x] **One-click Forgot password** (2026-11-28, CRM-147) — clicking "Forgot password?" on the sign-in page sends the
      reset link straight to the typed username's company email and says "If this account exists, we’ve emailed a
      reset link to a***@company.com" (masked; a stand-in address when nothing matches). With no username typed, the
      link opens the Forgot password page, which now asks for the username only.
- [x] **Forgot password and account lockout** (2026-11-28) — "Forgot password?" on the sign-in page emails the same
      single-use 72 h reset link an admin sends (same answer whether or not the account exists; 5 requests / 15 min
      per IP, 3 links / hour per account). 5 wrong passwords within 15 min lock the account for 15 min (`423
      ACCOUNT_LOCKED`), cleared by a sign-in, a password reset or Admin › Users **Unlock account**; locks and unlocks
      audited. Defaults in `auth/accountLockout.ts` (`DEFAULT_LOCKOUT_POLICY`, read through `getLockoutPolicy()`).
- [x] **Company email: Gmail sender, email queue and templates** (2026-11-28, CRM-121) — Admin › Email: Outbound
      Email (Gmail API through the Google Workspace service account of API Integrations with domain-wide delegation
      and `gmail.send`, or the SMTP environment settings; sender, display name, reply-to, daily limit, Check
      connection, Send test email), Templates (invite, admin reset, Forgot password reset; account locked and morning
      email reserved; merge fields, preview, reset to default), Email Queue (every email, retry). One mail service with
      a background queue, retries with backoff and a daily limit (system-design §5.2a). Not yet: the morning email on
      templates, inbound email, campaigns, the account-locked email itself.
- [ ] **Password Management** — admin-set password rules (length, character classes, expiry, reuse history), an
      admin screen for the lockout policy (attempts, window, lock length: today the defaults in `accountLockout.ts`),
      forced change on expiry.
- [ ] **Security Groups** — groups of users (teams / branches); records shared with a group are visible to its
      members (a "Group" level alongside All / Own / None), group membership in Admin › Users.
- [ ] **Security Settings** — company switches: inherit the creator's / assignee's groups on new records, who may
      assign to whom, session timeout, sign-in IP allow-list.
- [ ] Not yet: export permission on modules other than Partner Companies (their lists have no export today);
      field-level permissions.

Exit: an admin can create a role, limit it to own records or no access per module, assign it in Admin › Users, and
the API refuses (403) and the app hides everything the role doesn't allow.

## Part 3 — Keeping these documents current

These four documents are part of the codebase. Rules (also in the root `CLAUDE.md`):

| You change… | Update… |
| --- | --- |
| `schema.prisma` or add a migration | [database-design.md](database-design.md) (table reference, indexes, ERD) |
| A route, query param, response shape or error code | [api-plan.md](api-plan.md) and the route file's header comment |
| Redis keys/TTLs, queues, workers, auth, env vars, deployment, a new external service | [system-design.md](system-design.md) |
| Finish or start a roadmap item | [build-plan.md](build-plan.md) — tick it, add the phase row to Part 1 when a phase completes |

Update the "as of" line at the top of a document whenever you change it.
