# Nandini CRM — Build Plan

> **Status:** living document. Part 1 records what has been built (reconstructed from git history, 115 commits
> from 2026-10-15 to 2026-11-18). Part 2 is the roadmap. Tick items off and add new ones as work lands.
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

### Current capability snapshot

| Area | State |
| --- | --- |
| Leads, Opportunities, Quotations, Organizations, Contacts | ✅ CRUD, list filters, row-level access, audit, import (not quotations), lead conversion |
| Tickets, Products, Partner Companies | ✅ CRUD, import |
| Quotation PDF | ✅ templates, builder, preview, cached render |
| Admin: forms, dropdowns, document series, cities, PDF templates | ✅ |
| Audit log | ⚠️ foundation done (ledger table, full who / where / how per entry); admin screen, undo / restore pending (Phase 11) |
| Users admin | ❌ seed / DB only |
| Dashboard | ❌ static page, no data |
| Tests | ⚠️ 14 backend unit test files; no API integration, no frontend, no E2E |
| CI/CD, containers | ❌ none in repo |

## Part 2 — Roadmap

Priorities: **P1** = needed before wider production use, **P2** = next, **P3** = later.
Each phase lists exit criteria so "done" is unambiguous.

### Phase 6 — Production hardening (P1)

- [ ] **User management** — `/api/users` CRUD (admin), deactivate, reset password, `POST /auth/change-password`;
      revoke sessions on deactivate/password change; admin page at `/admin/users`.
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
- [ ] Activities / follow-ups (calls, meetings, notes) linked to any record, with reminders.
- [ ] PDFs for Opportunities (and later Tickets) via the module adapter pattern.
- [ ] Email quotation PDF to the contact (needs an SMTP/provider decision).
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

**B. Query API** (admin-only, `/api/admin/audit-logs`)
- [ ] `GET /` — filters (date range, users, modules, actions, categories, severities, sources, record id / number /
      name, changed field, IP, request id, free text) + keyset paging on `id` (no `COUNT(*)` over the whole range).
- [ ] `GET /:id` — one entry with a labelled Field / Before / After table (form-config labels incl. custom fields;
      record numbers only for modules with a document series), and the other entries of the same request.
- [ ] `GET /facets` (filter options with counts for the chosen range) and `GET /stats` (today, failed sign-ins 24 h,
      deletes 7 days, most active users, events per day).
- [ ] Performance check: 1 M seeded rows in a scratch database, a 30-day all-module page in < 300 ms.

**C. Admin screen** (`/admin/audit-log`, the "System Audit & Security" card becomes Available)
- [ ] Summary strip + events-per-day chart; filter bar with saved / recent filters (reuse `TableFilter`); table
      (time, user, action, module dot, record link or "Deleted", summary, source); detail drawer; preset tabs
      (All, Data, Configuration, Security); links "history of this record" / "everything this user did that day".
- [ ] Light / dark per the theme rules; module identity colours only for the module dots.

**D. Undo, restore, export, integrity**
- [ ] **Restore** a soft-deleted record from its DELETE entry (uniqueness re-checked; writes `RESTORE` with `revertsId`).
- [ ] **Undo** an UPDATE: put the `from` values back through the module's normal update path (validation, field
      locking, name write-through); refuse fields changed again since (conflict list), write `REVERT` with
      `revertsId`; an entry can be undone once. Not for CONVERT, IMPORT or Form Customization (form config deletes stay
      permanent by design).
- [ ] CSV / XLSX export of the current filter (large exports in BullMQ); every export is itself audited.
- [ ] Integrity: nightly `sys.sp_generate_database_ledger_digest` saved outside the database (file under
      `AUDIT_DIGEST_DIR` + an `AuditDigest` row for the screen); "Verify integrity" runs
      `sys.sp_verify_database_ledger` against the saved digests.

**E. Later**
- [ ] Alert rules (e.g. > 50 deletes in 10 min, 5 failed sign-ins from one IP) shown in-app; per-user activity tab once
      User Management exists; wider (manager) access if decided; optional record-view logging.

Exit: an admin can answer "who changed this lead's Assigned To last week, from which screen and IP?" in under a
minute, undo it, and prove the log hasn't been altered.

## Part 3 — Keeping these documents current

These four documents are part of the codebase. Rules (also in the root `CLAUDE.md`):

| You change… | Update… |
| --- | --- |
| `schema.prisma` or add a migration | [database-design.md](database-design.md) (table reference, indexes, ERD) |
| A route, query param, response shape or error code | [api-plan.md](api-plan.md) and the route file's header comment |
| Redis keys/TTLs, queues, workers, auth, env vars, deployment, a new external service | [system-design.md](system-design.md) |
| Finish or start a roadmap item | [build-plan.md](build-plan.md) — tick it, add the phase row to Part 1 when a phase completes |

Update the "as of" line at the top of a document whenever you change it.
