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

- [ ] `AuditLog` retention / archiving.
- [ ] Full-text search indexes for large tables.
- [ ] Migrate owner/creator columns from usernames to user ids (then usernames can be renamed).
- [ ] Structured log shipping and alerting (pino JSON → log service); health checks for Redis and Chromium.
- [ ] Drop legacy `Quotation` alias columns once no client uses them.

## Part 3 — Keeping these documents current

These four documents are part of the codebase. Rules (also in the root `CLAUDE.md`):

| You change… | Update… |
| --- | --- |
| `schema.prisma` or add a migration | [database-design.md](database-design.md) (table reference, indexes, ERD) |
| A route, query param, response shape or error code | [api-plan.md](api-plan.md) and the route file's header comment |
| Redis keys/TTLs, queues, workers, auth, env vars, deployment, a new external service | [system-design.md](system-design.md) |
| Finish or start a roadmap item | [build-plan.md](build-plan.md) — tick it, add the phase row to Part 1 when a phase completes |

Update the "as of" line at the top of a document whenever you change it.
