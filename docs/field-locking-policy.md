# Form builder: field locking policy

Status: **implemented** (2026-11-12). Defaults: `formConfig.defaults.ts` (`req` = 🔒 required, `lock` = 🔒 not required, `soft` = ⭐). Migration: `20261112020000_relax_default_required_fields`. Policy tests: `formConfig.defaults.test.ts`.

## The three tiers

| Tier | Meaning in the form builder | Who enforces "required" |
|---|---|---|
| 🔒 **Locked** | Can be relabelled, moved, resized. Can't be made optional, hidden, archived or deleted. | Hard-coded backend validator (+ DB `NOT NULL` where relevant) |
| ⭐ **Default required** | Required out of the box, but an admin can make it optional or hide it. | Form config `isRequired` (server-side via `customFieldValidator.checkModulePayload`) |
| ○ **Free** | Optional by default; admin can make it required, hide, archive. | Form config `isRequired` |

**Test for 🔒:** if an admin hid this field or made it optional, would anything *other than the form* break? A field is locked if it is any of:

1. **Identity**: the record's display name (lists, drawers, search, lookups, PDFs) or its unique key.
2. **Relation**: links to another module (conversion, lookups, cascading names).
3. **Ownership**: drives access scoping (`buildAccessScopeWhere` uses `assignedTo` / `assignedUser`).
4. **Logic**: stages, numbering, dates the system reads, PDF data with no fallback.
5. **Conditional**: the backend requires it in some cases (e.g. GST for registered types), so it must never be hidden.

Everything that is only "we want reps to fill this" is ⭐, not 🔒.

**Rule for every built-in field, whatever its tier:** its `fieldKey`, `fieldType` and dropdown list are fixed. Today a built-in select can be switched to multi-select or pointed at another dropdown (`formConfig.service.ts` `updateField`), which would break single-value columns such as lead Status or drop its system options (New / Converted). That should be blocked for all `isSystem` fields.

## Per-module classification

Legend for **Current**: 🔒R = locked + required, 🔒 = locked not required, — = free.
Fields not listed are ○ Free today and stay ○ Free.

### Leads

| Field | Current | Final | Why |
|---|---|---|---|
| Name | 🔒R | 🔒 | Identity |
| Mobile | 🔒R | ⭐ | Lead duplicate check is informational only (never blocks a save) |
| GST Number | 🔒 | 🔒 | Conditional (registration type) |
| Lead Source | 🔒R | ⭐ | Reporting preference |
| Lead Type | 🔒R | ⭐ | Classification preference |
| Status | — | ○ (list fixed) | Defaults to `New` when omitted; Convert sets `Converted` |
| Next Followup Date | 🔒R | ⭐ | Records without one just don't show in "Follow-up today" |
| Assigned to | 🔒R | 🔒 | Ownership / access scope |
| Product Category | 🔒R | ⭐ | Classification preference |
| Add Description | 🔒R | ⭐ | Note-taking preference |

### Contacts

| Field | Current | Final | Why |
|---|---|---|---|
| Name | 🔒R | 🔒 | Identity |
| Mobile | 🔒R | 🔒 | Unique key: the backend rejects a second contact with the same mobile |
| Organization Name | 🔒R | 🔒 | Relation |
| Assigned to | 🔒R | 🔒 | Ownership |

### Organizations

| Field | Current | Final | Why |
|---|---|---|---|
| Organization Name | 🔒R | 🔒 | Identity |
| Mailing Name | 🔒 | ○ | Backend falls back to Organization Name when empty |
| Nature of Business | 🔒R | ⭐ | Classification |
| Type of Entity | 🔒R | ⭐ | Classification |
| Customer Type | 🔒R | ⭐ | Classification |
| Account Status | 🔒 | ○ (list fixed) | Defaults to `Active` when omitted; bulk Active/Inactive action is separate |
| Assigned to (Account Executive) | 🔒R | 🔒 | Ownership |
| Registration Type | 🔒R | 🔒 | Drives GST requirement |
| GST Number | 🔒 | 🔒 | Conditional |
| Billing Street / City / State / PIN / Country | 🔒R | ⭐ | Address completeness; quotations keep their own required billing address |

### Opportunities

| Field | Current | Final | Why |
|---|---|---|---|
| Organization name | 🔒R | 🔒 | Relation |
| Contact | 🔒R | 🔒 | Relation |
| Lead Given By | 🔒R | ⭐ | Attribution; conversion and import fill it automatically |
| Type | 🔒R | ⭐ | Classification |
| Lead Source | 🔒R | ⭐ | Reporting |
| Sales Stage | 🔒R | 🔒 | Logic: pipeline stage, filters, conversion sets it |
| Next Followup Date | 🔒R | ⭐ | Same as leads |
| Assigned to | 🔒R | 🔒 | Ownership |
| Product Category | 🔒R | ⭐ | Classification |
| Add Description | 🔒R | ⭐ | Notes |
| Commission | 🔒R | ⭐ | Business preference |

### Quotations

| Field | Current | Final | Why |
|---|---|---|---|
| Quotation Title | 🔒R | 🔒 | Identity |
| Opportunity | 🔒R | 🔒 | Relation |
| Company | 🔒R | 🔒 | Logic: PDF letterhead / company details |
| Quotation Date | 🔒R | 🔒 | Logic: PDF, validity |
| Validation Period | 🔒R | ⭐ | Printed on PDF only; Valid Until is entered on its own |
| Valid Until | 🔒R | 🔒 | Logic: expiry, PDF |
| Quote Stage | 🔒R | 🔒 | Logic: stage on list / PDF |
| Prepared For | 🔒R | 🔒 | PDF addressee |
| Assigned to | 🔒R | 🔒 | Ownership |
| Terms & Condition | 🔒R | ⭐ | Printed on PDF; blank when empty |
| Payment Terms | 🔒R | ⭐ | Printed on PDF; blank when empty |
| Contact | 🔒R | 🔒 | Relation |
| Billing Street / City / State / PIN / Country | 🔒R | 🔒 | PDF "bill to"; tax state |

### Products

| Field | Current | Final | Why |
|---|---|---|---|
| Product Name | 🔒R | 🔒 | Identity (line items, PDFs) |

### Tickets

| Field | Current | Final | Why |
|---|---|---|---|
| Ticket Subject | 🔒 | 🔒 | Identity (optional, but always visible) |
| Problem Reported | 🔒R | 🔒 | Identity fallback: the list shows Subject, or Problem Reported when there's no subject |
| Organization Name | 🔒R | 🔒 | Relation |
| Contact Person Name | 🔒R | 🔒 | Relation |
| Nature Of Call | 🔒R | ⭐ | Classification (lookup list) |
| Ticket Priority | 🔒R | ⭐ | Only used for sorting; no SLA logic depends on it |
| Ticket Status | — | ○ (list fixed) | Defaults to `New` when omitted |
| Support Mode | 🔒R | ⭐ | Classification |
| Due Date | 🔒R | 🔒 | Logic: overdue / SLA |
| Assigned to | 🔒R | 🔒 | Ownership |

### Partner companies

| Field | Current | Final | Why |
|---|---|---|---|
| Partner Name | 🔒R | 🔒 | Identity |
| Nature of Partner | 🔒R | ⭐ | Classification |
| Office Phone | 🔒R | ⭐ | Contact data |
| Billing Street / City / State / PIN / Country | 🔒R | ⭐ | Address completeness |

## Summary

- Locked today: **~73** fields (every required field is locked: `isCoreLocked = req || lock`).
- Final: **37 🔒 Locked**, **34 ⭐ Default required**, and Mailing Name / Account Status move to ○ Free.

## Implementation steps

1. **Defaults** (`formConfig.defaults.ts`): split `req` into `lock` (🔒, hard) and `req` (⭐, default `isRequired` only). The seed already re-syncs `isCoreLocked` on existing rows (`formConfig.seed.ts`).
2. **Validators**: make every ⭐ field optional in its module validator (`lead.validator.ts`, `organization.validator.ts`, …) and let `checkModulePayload` enforce `isRequired` from the form config. This includes the lead-conversion schema (`lead.validator.ts` ~L120–156), which re-requires organization and opportunity fields.
3. **Database**: these ⭐ fields are `NOT NULL` columns today and need a migration to become nullable:
   - Lead: `mobile`, `leadSource`, `productCategoryJson`, `addDescription`, `leadType`, `nextFollowupDate`
   - Opportunity: `leadGivenBy`, `type`, `leadSource`, `nextFollowupDate`, `addDescription`, `commission`, `productCategoryJson`
   - Quotation: `validationPeriod`, `termsAndCondition`, `paymentTerms`
   - Ticket: `natureOfCall`, `ticketPriority`, `supportMode`
   - Partner company and organization billing columns are already nullable.
4. **Readers of those columns**: list columns, sorting, PDFs, kanban cards, imports and conversion must tolerate empty values. Check that the quotation PDF templates handle empty Terms / Payment Terms / Validation Period cleanly.
5. **Builder guard**: block `fieldType` / dropdown changes on all built-in fields.
6. **Frontend**: the hand-built form schemas (zod) for each module, and the import column configs (`importConfigs.ts` marks some of these `required: true`), must stop hard-requiring ⭐ fields.
