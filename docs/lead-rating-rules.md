# Lead Rating Rules — Build Plan

> **Status:** built 2026-11-21 (Activities note added 2026-11-25). Code: `backend-crm/src/modules/leads/lead.rating.ts` (rules, pure),
> `lead.followUp.ts` (save rules), `lead.ageing.ts` + `src/jobs/workers/leadRating.worker.ts` (nightly ageing);
> frontend `src/utils/leadRating.ts`, `components/settings/form-customization/RatingRulesPanel.tsx`. Data model in
> [database-design.md](database-design.md), endpoints in [api-plan.md](api-plan.md), the job in
> [system-design.md](system-design.md).

Leads get an automatic **Rating** (Hot / Warm / Cold) worked out by the server from the follow-up the user records.
Admins set the day and attempt limits in Form Builder.

## 1. Terms

| Term | What it is |
| --- | --- |
| **Rating** | `Lead.rating`: `Hot` / `Warm` / `Cold`. Set only by the server. **Not on any form and not a Form Builder field.** Shown in the leads list (column, Hot Leads pill, filter), the drawer badge and the follow-up history. |
| **Lead Type** | `Lead.leadType`: the admin dropdown `lead_type` (Inbound / Outbound / Marketing). Unrelated to Rating, untouched by this work. |
| **Customer Response** | The outcome of a follow-up, picked from **our own dropdown**: whatever list the leads `customerResponse` field is linked to (today `shared_customer_response`, which opportunities and activities also use; their Customer Response doesn't rate anything). Admins add, rename and delete its options; **each option carries its own rating rule**. Code reads the list through the field's link, never a hard-coded key. An **Activity**'s Customer Response (Calendar Phase 1) never changes a lead's Rating, its follow-up or its counter, even when the activity is related to the lead: only a follow-up recorded on the lead itself does. |
| **Status** | The admin dropdown `lead_status`. Each option gets a **"Closes the lead"** switch (Lost). `Converted` (set only by Convert) always closes. |
| **Follow-up state** | *Scheduled* / *Overdue*: worked out from the next follow-up against now, never stored. A lead can be Hot and Overdue. |
| **Day** | An IST calendar day (`BUSINESS_TIMEZONE`), not 24-hour blocks. Times only decide whether a follow-up is in the future. |

## 2. Rules

### 2.1 Rule types (one per Customer Response option)

| Rule | Counts | Hot | Warm | Cold |
| --- | --- | --- | --- | --- |
| **Follow-up gap** | Days from the day the response is recorded to the next follow-up date | 0 – N days | up to M days | after M |
| **Days since response** | Days since the response was recorded; ages every night | first N days | up to day M | after M |
| **Unanswered calls** | Consecutive responses with this rule, counting this one | 1 – N calls | up to M calls | after M |
| **Always** | — | one fixed Rating | | |

- Hot can be **Off** (the rule starts at Warm). Warm can be **Off** (Hot then straight to Cold) or **No limit** (never Cold).
- **Cold is not a dropdown.** It is "everything after Warm" and shown read-only, so the three ranges never leave a gap
  or overlap.
- Checks on save in Form Builder: Hot's limit is below Warm's; days 0–365, calls 1–50; an Always rule names one Rating.
- An option with no rule yet (for example one an admin just added) uses **Follow-up gap, Hot 0–5 days, Warm no limit**
  until the admin changes it.
- Rule changes apply from the next save. Leads ageing under *Days since response* keep the limits they started with.

### 2.2 New-lead rule

The days from the creation date to the first follow-up date: **Hot 0–5 days, Warm after** (Warm: no limit), editable the
same way. Example: created 20 Nov → follow-up 20–25 Nov is Hot, 26 Nov onwards is Warm.

### 2.3 Starting rules for today's Customer Response options

Set in setup; the admin can change all of them.

| Option | Rule | Hot | Warm | Cold |
| --- | --- | --- | --- | --- |
| Interested - wants a demo | Follow-up gap | 0–5 days | no limit | never |
| Interested - send quotation | Days since response | days 0–6 | days 7–14 | day 15+ |
| Asked to call back later | Follow-up gap | 0–5 days | no limit | never |
| Not reachable / no answer | Unanswered calls | 1–2 | 3–4 | 5+ |
| Needs internal discussion | Follow-up gap | 0–5 days | no limit | never |
| Using another product | Always | | | Cold |
| Not interested | Always | | | Cold |

"Closes the lead" starts on for **Dead** (and `Unqualified / Lost` in the seed defaults).

### 2.4 Unanswered-call counter

`Lead.unansweredCalls`. A response with the *Unanswered calls* rule adds 1; **any other response resets it to 0**.
An overdue follow-up, a details-only edit, the nightly job and a rejected save never touch it.

## 3. Save logic (server is the source of truth; one transaction per save)

A rejected save changes nothing: no Rating, counter or history change.

| Save | Rules |
| --- | --- |
| **Create** | Next follow-up **date and time required** (locked for leads in Form Builder) and **strictly later than now**. Rating from the new-lead rule; `rating` sent by a client is ignored. Counter 0. |
| **Edit, no Customer Response** (details only) | Customer Response is now optional on edit. Without it: follow-up date/time, Rating and counter stay as they are and no history entry is written. The server refuses a changed follow-up without a response (*"Record a Customer Response to change the follow-up."*). Moving between open statuses is allowed. |
| **Edit, Customer Response picked** (follow-up recorded) | Body carries `followUpDecision: 'keep' \| 'new'` from the existing popup. **keep**: the saved follow-up must still be later than now **at save time**, else 400 *"The current follow-up has passed. Schedule a new one."*; the slot must equal the saved one. **new**: date + time required, later than now. Then: the response's rule sets the Rating, the counter moves (2.4), the ageing snapshot is set or cleared, and a `FOLLOW_UP` history row is written. |
| **Edit to a closing status** (Lost) | Customer Response + Remarks required. The current Rating is worked out first (applying ageing up to today), then **kept as it is**. Next follow-up cleared, ageing cleared, no Keep/New popup. |
| **Reopen** (closing → open status) | Must record a follow-up with a **new** follow-up (there is nothing to keep); the Rating follows the response's rule. |
| **Convert** (Purchased) | Same as closing: work out the current Rating, keep it, clear ageing. |
| **Import** | Rows are new leads: Rating from the new-lead rule, import date → the row's follow-up date. The template has no follow-up column, so imported leads are due today and rate Hot under the default rule (a past or missing date would give Warm). |

### Nightly ageing

A BullMQ repeatable job at **00:05 IST** re-rates open leads whose `ratingAgeingFrom` is set (Hot → Warm → Cold by
their snapshot limits), writes only changed rows and logs each change as `system` in the history. The worker also runs
it once at start-up to catch up (Redis is optional in dev; with no worker running, ratings age at the next run).

## 4. Data model

| Change | Detail |
| --- | --- |
| `Lead.rating` | **Done** (migration `20261120200000_lead_rating`): `NVARCHAR(10)`, indexed. |
| `Lead.unansweredCalls` | `INT NOT NULL DEFAULT 0` |
| `Lead.ratingReason` | `NVARCHAR(200)`, why the current Rating, e.g. *Follow-up in 3 days after "Asked to call back later"*. Drawer tooltip and history. |
| `Lead.ratingAgeingFrom`, `ratingAgeingJson` | Snapshot of a *Days since response* rule: the response's IST day (`DATE`) and `{ limits: { hot, warm }, response }`. Both null otherwise. The reason reads *Ageing since "…" on 20 Nov 2026*, so it only changes with the Rating. |
| `ModuleSetting` (new table) | `module`, `key` (unique together), `valueJson`, `updatedBy`, `updatedAt`. Holds the new-lead rule (`leads` / `ratingNewLead`). |
| Customer Response option `metaJson` | `{ "ratingRule": { "rule": "followUpGap" \| "daysSinceResponse" \| "unansweredCalls" \| "always", "hot": n \| null, "warm": n \| "noLimit" \| null, "rating": "Hot" \| "Warm" \| "Cold" } }`. Follows the option on rename; goes away with it on delete. |
| Status option `metaJson` | `{ "closesLead": true }` |
| `AuditLog` action `FOLLOW_UP` | One row per recorded follow-up, written in the save's transaction: the usual field diff plus a `followUp` block with response, remarks, previous and new follow-up, kept or rescheduled, Rating from → to, unanswered calls, reason, employee, time. The audit timeline shows it like an `UPDATE`; the follow-up history reads the block (older rows keep the current diff-based rebuild). |
| Backfill | Open leads get a Rating from the new-lead rule (today → their next follow-up; none or past → Warm). Closed and converted leads stay empty. |

## 5. API

- `POST /api/leads`: the create rules above; new 400 messages for a missing time and a follow-up that isn't later than now.
- `PATCH /api/leads/:id`: optional `followUpDecision`; the edit rules above.
- `POST /api/leads/:id/convert`: freezes the Rating.
- `GET /api/leads`: `rating` filter and sort.
- Form configs: option `meta` validated for `ratingRule` / `closesLead`; the new-lead rule is
  `PUT /api/form-configs/modules/leads/settings/ratingNewLead` `{ value: { hot, warm } }` (admin) and comes back in
  `GET /api/form-configs` as `moduleSettings.leads.ratingNewLead`; audited in the Form Builder trail.

## 6. Frontend

- **Lead form**: no Rating input anywhere. Create: follow-up date + time required, checked against the clock again on
  Save. Edit: Customer Response optional; the follow-up fields stay locked until a response is picked; picking one opens
  the existing Keep/New popup (never preselected, Keep hidden when the follow-up is missing or past). A closing status
  hides and clears the follow-up fields and skips the popup. After saving, the toast names the new Rating.
- **Leads list**: Rating column (Hot red, Warm amber, Cold neutral), Hot Leads pill on `rating` (**done**), new
  **Overdue** pill next to Followup Today, and "today" worked out in IST.
- **Drawer**: Rating badge with the reason as a tooltip; Lead Type as its own plain badge (**done**).
- **Follow-up history panel**: each entry shows Rating from → to and the unanswered-call count.
- **Form Builder → Leads → new "Rating Rules" tab** (next to Dropdowns / Form Fields & Sections / Live Preview):

  ```
  NEW LEADS  (days from creation to first follow-up)
    Hot 0 – [5 v] days    Warm [No limit v]    Cold: never

  FOLLOW-UPS  (one row per Customer Response option, live from Dropdowns)
    Response                     Rule                   Hot        Warm          Cold
    Interested - wants a demo    [Follow-up gap      v]  0–[5 v]    [No limit v]  never
    Interested - send quotation  [Days since response v] 0–[6 v]    [14 v]        15+ days
    Not reachable / no answer    [Unanswered calls   v]  1–[2 v]    [4 v]         5+ calls
    Not interested               [Always             v]  [Cold v]
  ```

  Changes go into the page's existing draft and are saved with **Save Changes**. A "Manage options" link opens the
  Customer Response list in Dropdowns. A third card, "Statuses that close a lead", holds the "Closes the lead" switch
  of each Status option (Converted always on), so all the lead's rules sit in one tab.

## 7. Build order

1. **Rating calculator** — pure module (`backend-crm/src/modules/leads/lead.rating.ts`) with unit tests for every
   boundary in section 8. Frontend reuses the same rules for the Form Builder preview text only.
2. **Schema** — the Lead columns, `ModuleSetting`, the starting rules (2.3), "Closes the lead" on Dead, and the backfill.
3. **Server saves** — create, edit (details-only, follow-up, close, reopen), convert and import; `FOLLOW_UP` history;
   form-config checks for the rule meta; the new-lead rule endpoint.
4. **Nightly ageing job** — queue, worker, start-up catch-up, docs.
5. **Lead form, list, drawer, history panel.**
6. **Form Builder "Rating Rules" tab** and the Status switch.
7. **Docs and checks** — the four living docs plus `field-locking-policy.md`; backend typecheck + tests, frontend
   typecheck; run the section 8 scenarios in the browser.

## 8. Scenarios to test

- Create on 20 Nov with a follow-up on 25 Nov → Hot; on 26 Nov → Warm. A follow-up at the current minute or earlier,
  or with no time, is refused.
- "Asked to call back later" with a new follow-up 5 days out → Hot; 6 days → Warm.
- "Interested - send quotation" recorded on day 0 → Hot; the nightly job makes it Warm on day 7 and Cold on day 15.
- "Not reachable / no answer" five times in a row → Hot, Hot, Warm, Warm, Cold; then any other response resets the
  count to 0.
- An overdue follow-up alone never changes the counter or the Rating.
- Keep chosen, then the follow-up passes before Save → save refused; switching to a new follow-up saves.
- Editing only the phone number → no history entry; Rating and counter unchanged.
- Status → Dead on an ageing Warm lead → stays Warm, follow-up cleared, no popup; Convert behaves the same.
- A refused save leaves the Rating, counter and history as they were.
- An admin adds a Customer Response option → it rates with the default until a rule is set; renaming keeps the rule;
  deleting removes it without touching existing leads.
