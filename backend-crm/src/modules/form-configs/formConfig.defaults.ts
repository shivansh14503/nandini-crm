/**
 * Default dropdown categories / options and built-in form field definitions, seeded by `formConfig.seed.ts`.
 *
 * Option lists mirror frontend-crm/src/types/*.types.ts and frontend-crm/src/components/organizations/constants.ts
 * (the frontend keeps them as fallbacks while the configuration loads). Field definitions mirror the fields the
 * hand-built forms render; `fieldKey` is the React Hook Form name, so overrides apply to the matching control.
 *
 * Yes / No dropdowns (Left Job, Contract Create, Add Document, Commission) have built-in lists like every other dropdown, but
 * with fixed options (FIXED_OPTION_CATEGORY_KEYS): the API only accepts those values. The organization's Provide
 * Support switch stays a fixed toggle.
 */

/** In Sales navbar order (leads → opportunities → quotations → organizations → contacts), then the other forms. */
export const CRM_MODULES = [
    'leads',
    'opportunities',
    'quotations',
    'organizations',
    'contacts',
    'products',
    'tickets',
    'contracts',
    'partner-companies',
] as const;
export type CrmModuleKey = (typeof CRM_MODULES)[number];

/** Category owners: a module, or `shared` for lists several forms use. */
export const CATEGORY_MODULES = ['shared', ...CRM_MODULES] as const;

export const CUSTOM_FIELD_TYPES = [
    'text',
    'textarea',
    'number',
    'amount',
    'percentage',
    'phone',
    'email',
    'date',
    'select',
    'multiselect',
    'checkbox',
    'uppercase',
    'pincode',
] as const;
/** Built-in fields can additionally be rendered as lookups or date + time pickers. */
export const FIELD_TYPES = [...CUSTOM_FIELD_TYPES, 'lookup', 'datetime', 'file'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_SIZES = ['xs', 'sm', 'md', 'lg', 'full'] as const;

/** Form tabs per module (ids match each form's `*_FORM_TABS`). Custom fields can be placed on any of them. */
export const MODULE_TABS: Record<CrmModuleKey, { key: string; label: string }[]> = {
    organizations: [
        { key: 'overview', label: 'Overview' },
        { key: 'address', label: 'Address Information' },
        { key: 'tax_bank', label: 'Tax & Bank Details' },
    ],
    contacts: [{ key: 'overview', label: 'Overview' }],
    leads: [
        { key: 'overview', label: 'Overview' },
        { key: 'address', label: 'Address Information' },
    ],
    opportunities: [
        { key: 'basic', label: 'Basic' },
        { key: 'line_items', label: 'Line Items' },
    ],
    quotations: [
        { key: 'overview', label: 'Overview' },
        { key: 'line_items', label: 'Line Items' },
        { key: 'address', label: 'Address Information' },
    ],
    products: [{ key: 'overview', label: 'Overview' }],
    tickets: [
        { key: 'overview', label: 'Overview' },
        { key: 'partner_company', label: 'Partner Company' },
    ],
    contracts: [{ key: 'overview', label: 'Overview' }],
    'partner-companies': [
        { key: 'company_info', label: 'Company Information' },
        { key: 'address', label: 'Address Information' },
        { key: 'statutory', label: 'Statutory' },
    ],
};

/** `PIPELINE & FOLLOW-UP` → `pipeline_follow_up`. Must match `sectionKeyFromLabel` in the frontend. */
export function sectionKeyFromLabel(label: string): string {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80);
}

// ── Dropdown categories ──────────────────────────────────────────────────────

export interface DefaultOption {
    value: string;
    label?: string;
    isSystem?: boolean;
    meta?: Record<string, unknown>;
}

export interface DefaultCategory {
    key: string;
    label: string;
    module: (typeof CATEGORY_MODULES)[number];
    description?: string;
    options: (string | DefaultOption)[];
}

/** Marks the listed values as system options (they drive backend logic). */
const withSystem = (values: string[], system: string[]): DefaultOption[] =>
    values.map((value) => ({ value, isSystem: system.includes(value) }));

/**
 * Built-in dropdowns that CRM screens read directly by key, outside the configurable forms (lead conversion,
 * organization quick-create, quotation term templates, lead status logic). They can't be deleted: those screens
 * would silently fall back to their hard-coded lists. Keep in sync with the frontend's `getOptions('…')` /
 * `useDropdownOptions('…')` / `useDropdownOptionMeta('…')` calls.
 */
export const APP_REQUIRED_CATEGORY_KEYS: ReadonlySet<string> = new Set([
    'lead_status',
    'shared_product_category',
    'shared_lead_source',
    'shared_followup_type',
    'shared_customer_response',
    'lead_customer_response',
    'opportunity_type',
    'opportunity_commission_type',
    'org_nature_of_business',
    'org_type_of_entity',
    'org_customer_type',
    'partner_nature',
    'contact_designation',
    'contact_department',
    'contact_communication_type',
    'quote_terms_template',
    'quote_payment_terms',
]);

/**
 * Built-in dropdowns whose options are fixed: the records' API validates the value against exactly these options
 * (Yes / No fields). Admins can reorder them, rename how they read and pick the default, but not add options.
 */
export const FIXED_OPTION_CATEGORY_KEYS: ReadonlySet<string> = new Set(['shared_left_job', 'product_contract_create', 'opportunity_add_document', 'opportunity_commission', 'opportunity_commission_type']);

const yesNo = (first: 'No' | 'Yes'): DefaultOption[] => withSystem(first === 'No' ? ['No', 'Yes'] : ['Yes', 'No'], ['Yes', 'No']);

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
    // ── Shared ──
    {
        key: 'shared_lead_source',
        label: 'Lead Source',
        module: 'shared',
        description: 'Where a lead, opportunity or organization came from (Leads, Opportunities, Organizations).',
        options: [
            'Client Referral',
            'Website Enquiry',
            'Cold Call',
            'Email Campaign',
            'Exhibition / Trade Show',
            'LinkedIn / Social Media',
            'Partner Referral',
            'Tally Partner Network',
            'Direct Walk-in',
            'Google Search / Ad',
            'Other',
            // System: CA / Reference ask for Referred By and Partner for a Nature of Partner (shared/leadSource.ts).
            { value: 'CA', isSystem: true },
            { value: 'Reference', isSystem: true },
            { value: 'Partner', isSystem: true },
        ],
    },
    {
        key: 'shared_product_category',
        label: 'Product Category',
        module: 'shared',
        description: 'Product lines (Leads, Opportunities, Products).',
        options: [
            'Acronis',
            'Biz Analyst',
            'Connect 21',
            'CredFlow',
            'CRM',
            'Data Warehouse',
            'Tally AMC',
            'Tally Customization',
            'Tally On Cloud',
            'Tally Service',
            'Tally Software Service (TSS)',
            'Tally Training',
            'Tally Upgrade',
            'TallyPrime',
            'TallyPrime Server',
            'Teramind',
            'TVU',
        ],
    },
    {
        key: 'shared_followup_type',
        label: 'Followup Type',
        module: 'shared',
        description: 'How the next follow-up happens (Leads, Opportunities).',
        options: ['Call', 'Meeting', 'Demo / Presentation', 'Email', 'WhatsApp', 'Site Visit'],
    },
    {
        key: 'shared_customer_response',
        label: 'Customer Response',
        module: 'shared',
        description: 'What the customer said on the last follow-up (Opportunities). Leads have their own list.',
        options: [
            'Interested - wants a demo',
            'Interested - send quotation',
            'Asked to call back later',
            'Not reachable / no answer',
            'Needs internal discussion',
            'Using another product',
            'Not interested',
        ],
    },
    {
        key: 'shared_registration_type',
        label: 'Registration Type',
        module: 'shared',
        description: "GST registration of a lead or organization (Leads, Organizations). 'Registered' requires a GSTIN.",
        options: withSystem(
            ['Registered', 'Unregistered', 'Composition Scheme', 'Consumer', 'Overseas / Export', 'Special Economic Zone (SEZ)'],
            ['Registered', 'Unregistered'],
        ),
    },
    {
        key: 'shared_left_job',
        label: 'Left Job',
        module: 'shared',
        description: 'Whether the contact has left the organization (Contacts, Tickets). Fixed options: No / Yes.',
        options: yesNo('No'),
    },

    // ── Leads ──
    {
        key: 'lead_status',
        label: 'Status',
        module: 'leads',
        description: "'New' is the default and 'Converted' is set by the Convert action. Statuses with 'Closes the lead' on mark a lead Lost.",
        options: withSystem(
            ['New', 'Contacted', 'In Discussion', 'Demo Scheduled', 'Proposal Sent', 'Qualified', 'Negotiation', 'Converted', 'Unqualified / Lost'],
            ['New', 'Converted'],
        ).map((o) => (o.value === 'Unqualified / Lost' ? { ...o, meta: { closesLead: true } } : o)),
    },
    // Same field as the opportunity's Customer Response (key `customerResponse`, same follow-up flow), with the leads'
    // own answers: each option also sets the lead's Rating (option meta `ratingRule`, docs/lead-rating-rules.md 2.3).
    {
        key: 'lead_customer_response',
        label: 'Customer Response',
        module: 'leads',
        description: 'What the customer said on the last follow-up. Each option sets the lead\'s Rating (Rating Rules tab).',
        options: [
            // Buying signals: Hot while the next step is close (or the request is fresh).
            { value: 'Interested', meta: { ratingRule: { rule: 'followUpGap', hot: 7, warm: 30 } } },
            { value: 'Need More Information', meta: { ratingRule: { rule: 'followUpGap', hot: 3, warm: 15 } } },
            { value: 'Requested Quotation', meta: { ratingRule: { rule: 'daysSinceResponse', hot: 10, warm: 30 } } },
            { value: 'Requested Demo', meta: { ratingRule: { rule: 'followUpGap', hot: 7, warm: 21 } } },
            { value: 'Under Discussion', meta: { ratingRule: { rule: 'daysSinceResponse', hot: 7, warm: 21 } } },
            { value: 'Call Back Later', meta: { ratingRule: { rule: 'followUpGap', hot: 3, warm: 30 } } },
            // Dead ends: Cold whatever the follow-up.
            { value: 'Not Interested', meta: { ratingRule: { rule: 'always', rating: 'Cold' } } },
            // Objections and later needs: never Hot, Cold once the follow-up is pushed far out.
            { value: 'Price Issue', meta: { ratingRule: { rule: 'followUpGap', hot: null, warm: 15 } } },
            { value: 'Using Other Software', meta: { ratingRule: { rule: 'always', rating: 'Cold' } } },
            { value: 'No Requirement', meta: { ratingRule: { rule: 'always', rating: 'Cold' } } },
            { value: 'Requirement in Future', meta: { ratingRule: { rule: 'followUpGap', hot: null, warm: 60 } } },
            // Unanswered attempts share one counter (lead.unansweredCalls): Hot for 2, Warm up to 4, Cold from the 5th.
            { value: 'No Response', meta: { ratingRule: { rule: 'unansweredCalls', hot: 2, warm: 4 } } },
            { value: 'Wrong Number', meta: { ratingRule: { rule: 'always', rating: 'Cold' } } },
            { value: 'Not Reachable', meta: { ratingRule: { rule: 'unansweredCalls', hot: 2, warm: 4 } } },
            { value: 'Do Not Contact', meta: { ratingRule: { rule: 'always', rating: 'Cold' } } },
        ],
    },
    // Lead Type is how the lead came in. Hot / Warm / Cold is the lead's Rating (`Lead.rating`, set by the system).
    { key: 'lead_type', label: 'Lead Type', module: 'leads', options: ['Inbound', 'Outbound', 'Marketing'] },
    {
        key: 'lead_designation',
        label: 'Designation',
        module: 'leads',
        options: [
            'Managing Director / MD',
            'Director / Partner',
            'Chief Executive Officer (CEO)',
            'Chief Financial Officer (CFO)',
            'Purchase Head / Manager',
            'Accounts & Finance Head',
            'IT Manager / Systems Head',
            'Sales & Marketing Head',
            'Operations Manager',
            'Proprietor / Owner',
            'Senior Accountant',
            'Other',
        ],
    },
    {
        key: 'lead_department',
        label: 'Department',
        module: 'leads',
        options: [
            'Executive Management',
            'Procurement & Purchase',
            'Finance & Accounts',
            'Information Technology (IT)',
            'Sales & Marketing',
            'Operations',
            'Human Resources (HR)',
            'Administration',
            'Other',
        ],
    },
    {
        key: 'lead_turnover',
        label: 'Turnover',
        module: 'leads',
        options: [
            'Below ₹25 Lakhs',
            '₹25 Lakhs – ₹1 Cr',
            '₹1 Cr – ₹1.5 Cr',
            '₹1.5 Cr – ₹5 Cr',
            '₹5 Cr – ₹25 Cr',
            '₹25 Cr – ₹100 Cr',
            'Above ₹100 Cr',
        ],
    },
    {
        key: 'lead_employee_range',
        label: 'No of Employee',
        module: 'leads',
        options: ['1 – 10 Staff Members', '11 – 50 Staff Members', '51 – 200 Staff Members', '201 – 500 Staff Members', '500+ Staff Members'],
    },

    // ── Organizations ──
    {
        key: 'org_nature_of_business',
        label: 'Nature of Business',
        module: 'organizations',
        options: [
            'Agriculture & Food Processing',
            'Apparel & Textiles',
            'Association / Society / NGO / Trust',
            'Automobile & Auto Components',
            'Biotechnology & Pharmaceuticals',
            'CA Firm / Accounting & Taxation',
            'Chemicals',
            'Communications & Telecommunications',
            'Construction & Real Estate',
            'Consulting & Professional Services',
            'Distributor / Trading / Wholesale',
            'E-commerce / Online Business',
            'Education & Training',
            'Electronics & Electricals',
            'Energy & Utilities',
            'Engineering',
            'Entertainment & Recreation',
            'Environmental Services',
            'Finance & Banking',
            'Government / Public Sector',
            'Healthcare & Medical',
            'Hospitality / Hotel / Restaurant',
            'Import / Export',
            'Insurance',
            'Jewellery & Gems',
            'Logistics & Warehousing',
            'Machinery & Industrial Equipment',
            'Manufacturing',
            'Media / Advertising / Marketing',
            'Printing / Packaging / Publishing',
            'Retail',
            'Technology / IT & Software',
            'Transportation & Logistics',
        ],
    },
    {
        key: 'org_account_status',
        label: 'Account Status',
        module: 'organizations',
        description: "'Active' / 'Inactive' drive bulk status changes and the inactivity-reason prompt.",
        options: withSystem(['Active', 'Inactive'], ['Active', 'Inactive']),
    },
    {
        key: 'org_type_of_entity',
        label: 'Type of Entity',
        module: 'organizations',
        options: [
            'Association',
            'Government',
            'HUF',
            'LLP',
            'NGO',
            'Partnership',
            'Private Limited',
            'Proprietorship',
            'PSU',
            'Public Limited',
            'RWA',
            'Section 8 Company',
            'Society',
            'Trust',
        ],
    },
    {
        key: 'org_customer_type',
        label: 'Customer Type',
        module: 'organizations',
        options: ['BMW', 'CEAT', 'End User', 'GAIA', 'IFFCO', 'Luxottica', 'Partner', 'Samsung', 'Usha', 'Valvoline', 'ValvolineSFDC'],
    },
    {
        key: 'org_annual_turnover',
        label: 'Annual Turnover',
        module: 'organizations',
        options: ['Less than 1.5 crore', '1.5 crore to 5 crore', '5 crore to 10 crore', 'Greater than 10 crore'],
    },
    {
        key: 'org_employee_count',
        label: 'Number of Employees',
        module: 'organizations',
        options: ['Less than 20', '21 To 50', '51 To 100', '101 To 250', '251 To 500', '501 To 1000', '1001 & Above'],
    },
    // Organizations' Lead Source (leadSource) and Registration Type share the lead form's dropdowns
    // ('shared_lead_source', 'shared_registration_type').
    {
        key: 'org_account_type',
        label: 'Bank Account Type',
        module: 'organizations',
        options: ['Current Account', 'Savings Account', 'Cash Credit (CC)', 'Overdraft (OD)', 'Escrow Account', 'Other'],
    },

    // ── Contacts ──
    {
        key: 'contact_designation',
        label: 'Designation',
        module: 'contacts',
        options: [
            'Managing Director / MD',
            'Director / Partner',
            'Chief Executive Officer (CEO)',
            'Chief Financial Officer (CFO)',
            'Chief Technology Officer (CTO)',
            'General Manager (GM)',
            'Vice President (VP)',
            'Purchase Head / Manager',
            'Accounts & Finance Head',
            'IT Manager / Systems Head',
            'Sales & Marketing Head',
            'Operations Manager',
            'Senior Executive',
            'Consultant / Advisor',
            'Proprietor / Owner',
            'Other',
        ],
    },
    {
        key: 'contact_department',
        label: 'Department',
        module: 'contacts',
        options: [
            'Executive Management',
            'Procurement & Purchase',
            'Finance & Accounts',
            'Information Technology (IT)',
            'Sales & Business Development',
            'Operations & Supply Chain',
            'Marketing & PR',
            'Human Resources (HR)',
            'Customer Support & Service',
            'Legal & Compliance',
            'Administration',
            'Other',
        ],
    },
    { key: 'contact_communication_type', label: 'Communication Type', module: 'contacts', options: ['Call', 'Email', 'Meeting', 'WhatsApp'] },

    // ── Opportunities ──
    {
        key: 'opportunity_sales_stage',
        label: 'Sales Stage',
        module: 'opportunities',
        description: "'Proposal/Price Quote' is set when a quotation is raised; 'Closed Won' / 'Closed Lost' close the deal; 'PO' needs a document (Add Document Yes).",
        options: withSystem(
            ['Qualification', 'Demo', 'Proposal/Price Quote', 'Negotiation', 'On Hold', 'Closed Won', 'Closed Lost', 'PO', 'Advance Received'],
            ['Proposal/Price Quote', 'Closed Won', 'Closed Lost', 'PO'],
        ),
    },
    {
        key: 'opportunity_type',
        label: 'Type',
        module: 'opportunities',
        options: ['Existing Business', 'New Business', 'Upgrade / Renewal', 'Add-on Module', 'Cloud Migration', 'Customization & Training'],
    },
    {
        key: 'opportunity_commission',
        label: 'Commission',
        module: 'opportunities',
        description: 'Whether the opportunity pays a commission; Yes asks for the Commission Amount. Fixed options: No / Yes.',
        options: yesNo('No'),
    },
    {
        key: 'opportunity_commission_type',
        label: 'Commission Type',
        module: 'opportunities',
        description: 'Who the commission is paid to. Self up to a Commission Amount of 1,000, Other above it (asks for bank details). Fixed options: Self / Other.',
        options: withSystem(['Self', 'Other'], ['Self', 'Other']),
    },
    { key: 'opportunity_add_document', label: 'Add Document', module: 'opportunities', description: 'Fixed options: No / Yes.', options: yesNo('No') },

    // ── Quotations ──
    {
        key: 'quote_stage',
        label: 'Quote Stage',
        module: 'quotations',
        options: withSystem(
            ['Draft', 'Negotiation', 'Delivered', 'On Hold', 'Confirmed', 'Closed Accepted', 'Closed Lost', 'Closed Dead'],
            ['Draft', 'Confirmed', 'Closed Accepted', 'Closed Lost', 'Closed Dead'],
        ),
    },
    { key: 'quote_company', label: 'Issuing Company', module: 'quotations', options: ['Nandini Infosystems', 'Nandini Infosys Pvt. Ltd.'] },
    {
        key: 'quote_validation_period',
        label: 'Validation Period',
        module: 'quotations',
        description: 'Use the form "<n> Days" so Valid Until can be calculated.',
        options: ['7 Days', '15 Days', '30 Days', '45 Days', '60 Days', '90 Days'],
    },
    {
        key: 'quote_terms_template',
        label: 'Terms & Condition Template',
        module: 'quotations',
        description: "Each option's description pre-fills the Terms & Condition Description.",
        options: [
            {
                value: 'Standard Terms & Conditions',
                meta: {
                    description:
                        '1. Prices are subject to applicable GST taxes unless indicated otherwise.\n2. Payment terms as agreed upon quotation confirmation.\n3. Software license keys will be electronically delivered within 24-48 business hours after realization of payment.',
                },
            },
            {
                value: 'Software Licensing Terms',
                meta: {
                    description:
                        '1. Annual software licenses and TSS subscriptions are non-refundable once activated.\n2. Remote technical installation and basic configuration are included.\n3. Upgrades and updates are covered during the active TSS subscription validity period.',
                },
            },
            {
                value: 'AMC / Support Terms',
                meta: {
                    description:
                        '1. Annual Maintenance Contract includes periodic software maintenance, database re-indexing, and priority issue resolution.\n2. Critical server incidents will be addressed within 24 hours of escalation.\n3. Hardware replacement and cabling are excluded from software AMC.',
                },
            },
            { value: 'Custom Terms', meta: { description: '1. Custom agreed terms and conditions between Nandini Infosystems and client.' } },
        ],
    },
    {
        key: 'quote_payment_terms',
        label: 'Payment Terms',
        module: 'quotations',
        description: "Each option's description pre-fills the Payment Terms Description.",
        options: [
            {
                value: '100% Advance',
                meta: { description: '100% Advance payment required prior to software delivery, license provisioning, or deployment commencement.' },
            },
            {
                value: '50% Advance & 50% on Delivery',
                meta: {
                    description:
                        '50% Advance along with purchase order confirmation, remaining 50% upon successful delivery and software deployment.',
                },
            },
            { value: 'Net 15 Days', meta: { description: 'Payment due within 15 calendar days from the date of final invoice delivery.' } },
            { value: 'Net 30 Days', meta: { description: 'Payment due within 30 calendar days from the date of final invoice delivery.' } },
            { value: 'Against Delivery', meta: { description: 'Full payment required immediately upon delivery and handover of software licensing.' } },
        ],
    },

    // ── Products ──
    { key: 'product_contract_create', label: 'Contract Create', module: 'products', description: 'Fixed options: Yes / No.', options: yesNo('Yes') },
    { key: 'product_type', label: 'Product Type', module: 'products', options: ['Product', 'Service', 'Bundle', 'Subscription', 'License', 'Other'] },
    { key: 'product_tax_type', label: 'Tax Type', module: 'products', options: ['GST', 'IGST', 'None'] },
    { key: 'product_tax_rate', label: 'Tax Rate', module: 'products', options: ['0%', '5%', '12%', '18%', '28%'] },

    // ── Tickets ──
    {
        key: 'ticket_status',
        label: 'Ticket Status',
        module: 'tickets',
        description: "'Resolved' and 'Closed' count as finished work (never overdue).",
        options: withSystem(['New', 'Assigned', 'In Progress', 'Pending Customer', 'Escalated', 'Resolved', 'Closed'], ['New', 'Resolved', 'Closed']),
    },
    {
        key: 'ticket_priority',
        label: 'Ticket Priority',
        module: 'tickets',
        description: 'Suggested from the Nature of Call master priority.',
        options: withSystem(['Low', 'Normal', 'High', 'Urgent'], ['Low', 'Normal', 'High', 'Urgent']),
    },
    { key: 'ticket_source', label: 'Ticket Source', module: 'tickets', options: ['Call', 'Email', 'Web Portal', 'Chat', 'In-Person', 'WhatsApp'] },
    { key: 'ticket_support_type', label: 'Support Type', module: 'tickets', options: ['Free', 'Paid', 'AMC', 'Warranty'] },
    {
        key: 'ticket_support_mode',
        label: 'Support Mode',
        module: 'tickets',
        options: ['Offsite Support', 'Onsite Support', 'Remote Support (AnyDesk/TeamViewer)', 'Phone Consultation'],
    },

    // ── Contracts ──
    { key: 'contract_title', label: 'Contract Title', module: 'contracts', options: ['Tally TSS', 'Tally On Cloud', 'Tally On AWS', 'Other'] },
    {
        key: 'contract_status',
        label: 'Contract Status',
        module: 'contracts',
        description: "'Not Started' is the starting status; 'Expired' contracts are left out of Expiring Soon.",
        options: withSystem(['Not Started', 'In Progress', 'Signed', 'Expired'], ['Not Started', 'Expired']),
    },
    {
        key: 'contract_period',
        label: 'Contract Period',
        module: 'contracts',
        description: "A period such as '2 Years' or '6 Months' sets the End Date from the Start Date.",
        options: ['1 Year', '13 Months', 'Other'],
    },
    { key: 'contract_type', label: 'Contract Type', module: 'contracts', options: ['No of Visit', 'Remote Support'] },

    // ── Partner companies ──
    {
        key: 'partner_nature',
        label: 'Nature of Partner',
        module: 'shared',
        description: 'Kind of partner (Partner Companies, Organizations whose Customer Type is Partner, and Leads / Opportunities whose Lead Source is Partner).',
        options: ['ISODA', 'TALLY-REFERRAL PARTNER', 'TALLY-3STAR', 'TALLY-3STAR PARTNER', 'TALLY-5STAR-SS', 'TALLY-5STARSI', 'TALLY-AP', 'Other'],
    },
];

/**
 * Options pre-selected on new records (`DropdownOption.isDefault`), matching what the hand-built forms used to
 * hard-code. Applied when the seed creates a category; existing databases got the same rows flagged by the
 * 20261112010000_dropdown_option_default migration. Admins change them in Form Builder › Dropdowns: a dropdown
 * without a default leaves the field empty, so it shows its placeholder.
 */
export const DEFAULT_SELECTED_OPTIONS: Readonly<Record<string, readonly string[]>> = {
    shared_lead_source: ['Website Enquiry'],
    shared_product_category: ['Biz Analyst'],
    shared_followup_type: ['Call'],
    lead_status: ['New'],
    lead_department: ['Executive Management'],
    contact_communication_type: ['Call', 'Email'],
    shared_left_job: ['No'],
    product_contract_create: ['No'],
    opportunity_add_document: ['No'],
    org_account_status: ['Active'],
    opportunity_type: ['New Business'],
    opportunity_sales_stage: ['Qualification'],
    opportunity_commission: ['No'],
    opportunity_commission_type: ['Self'],
    quote_stage: ['Draft'],
    quote_company: ['Nandini Infosystems'],
    quote_validation_period: ['30 Days'],
    quote_terms_template: ['Standard Terms & Conditions'],
    quote_payment_terms: ['50% Advance & 50% on Delivery'],
    product_tax_type: ['GST'],
    ticket_priority: ['Normal'],
    ticket_status: ['New'],
    ticket_source: ['Call'],
    ticket_support_type: ['Free'],
    ticket_support_mode: ['Offsite Support'],
    contract_status: ['Not Started'],
};

// ── Built-in field definitions ───────────────────────────────────────────────

export interface DefaultField {
    module: CrmModuleKey;
    fieldKey: string;
    label: string;
    fieldType: FieldType;
    tabKey: string;
    sectionLabel: string;
    sortOrder: number;
    isRequired: boolean;
    /** Required by the API / form schema or a record identifier: can't be hidden or made optional. */
    isCoreLocked: boolean;
    dropdownCategoryKey?: string;
}

interface FieldSpec {
    key: string;
    label: string;
    type: FieldType;
    /** Locked and required: the system depends on it (identity, relation, ownership, logic). */
    req?: boolean;
    /** Locked without being required (e.g. conditionally required, or an identity the system falls back from). */
    lock?: boolean;
    /** Required by default, but an admin may make it optional or hide it (docs/field-locking-policy.md). */
    soft?: boolean;
    cat?: string;
}

const t = (key: string, label: string, opts: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, type: 'text', ...opts });
const sel = (key: string, label: string, cat: string | undefined, opts: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, type: 'select', cat, ...opts });

function section(module: CrmModuleKey, tabKey: string, sectionLabel: string, fields: FieldSpec[]): DefaultField[] {
    return fields.map((f, index) => ({
        module,
        fieldKey: f.key,
        label: f.label,
        fieldType: f.type,
        tabKey,
        sectionLabel,
        sortOrder: 0, // assigned per module below
        isRequired: Boolean(f.req || f.soft),
        isCoreLocked: Boolean(f.req || f.lock),
        dropdownCategoryKey: f.cat,
    }));
}

/**
 * Country / State / City / PIN / Street of one address column (the shared address block of the forms).
 * `locked`: required and locked; `soft`: required by default, an admin may relax it; `optional`: free.
 */
function addressFields(prefix: string, mode: 'locked' | 'soft' | 'optional'): FieldSpec[] {
    const required: Partial<FieldSpec> = mode === 'locked' ? { req: true } : mode === 'soft' ? { soft: true } : {};
    // A locked State is locked without the config flag (the backend requires it); a soft one is a plain default.
    const state: Partial<FieldSpec> = mode === 'locked' ? { lock: true } : required;
    return [
        sel(`${prefix}Country`, 'Country', undefined, required),
        sel(`${prefix}State`, 'State / Region', undefined, state),
        t(`${prefix}City`, 'City', required),
        t(`${prefix}PostalCode`, 'PIN / Postal Code', { type: 'pincode', ...required }),
        t(`${prefix}Address`, 'Street', { type: 'textarea', ...required }),
    ];
}

const RAW_DEFAULT_FIELDS: DefaultField[] = [
    // ── Leads ──
    ...section('leads', 'overview', 'CONTACT PERSON', [
        t('name', 'Name', { req: true }),
        t('mobile', 'Mobile', { type: 'phone', soft: true }),
        t('otherPhone', 'Other Phone', { type: 'phone' }),
        sel('designation', 'Designation', 'lead_designation'),
        sel('department', 'Department', 'lead_department'),
        // Repeatable email list (one row per address, with Primary / Opted out / Bounced flags).
        t('emailAddress', 'Email Address', { type: 'email' }),
    ]),
    ...section('leads', 'overview', 'ORGANIZATION', [
        t('organizationName', 'Organization Name'),
        t('tradeName', 'Trade Name'),
        t('mailingName', 'Mailing Name'),
        sel('registrationType', 'Registration Type', 'shared_registration_type'),
        t('gstNumber', 'GST Number', { type: 'uppercase', lock: true }),
        sel('turnover', 'Turnover', 'lead_turnover'),
        sel('noOfEmployee', 'No of Employee', 'lead_employee_range'),
    ]),
    ...section('leads', 'overview', 'PIPELINE & FOLLOW-UP', [
        sel('leadSource', 'Lead Source', 'shared_lead_source', { soft: true }),
        sel('leadType', 'Lead Type', 'lead_type', { soft: true }),
        sel('status', 'Status', 'lead_status'),
        // Conditional (locked): Referred By is shown, and required, for Lead Source CA / Reference; Nature of Partner
        // (same list as partner organizations) for Lead Source Partner. See shared/leadSource.ts.
        t('referredBy', 'Referred By', { type: 'lookup', lock: true }),
        sel('natureOfPartner', 'Nature of Partner', 'partner_nature', { lock: true }),
        sel('followupType', 'Followup Type', 'shared_followup_type'),
        // What the customer said on the last follow-up; records a follow-up and sets the Rating. The leads' own list.
        sel('customerResponse', 'Customer Response', 'lead_customer_response'),
        // Locked and required: every open lead needs its next follow-up (date and time) to be rated.
        t('nextFollowupDate', 'Next Followup Date', { type: 'datetime', req: true }),
        t('assignedTo', 'Assigned to', { type: 'lookup', req: true }),
        { key: 'productCategory', label: 'Product Category', type: 'multiselect', cat: 'shared_product_category', soft: true },
    ]),
    ...section('leads', 'overview', 'NOTES', [
        t('remarks', 'Remarks', { type: 'textarea', soft: true }),
    ]),
    ...section('leads', 'address', 'BILLING ADDRESS', addressFields('primary', 'optional')),
    ...section('leads', 'address', 'SHIPPING ADDRESS', addressFields('other', 'optional')),

    // ── Contacts ──
    ...section('contacts', 'overview', 'Contact Details & Association', [
        t('name', 'Name', { req: true }),
        t('mobile', 'Mobile', { type: 'phone', req: true }),
        t('officePhone', 'Office Phone', { type: 'phone' }),
        t('organizationName', 'Organization Name', { type: 'lookup', req: true }),
        sel('leftJob', 'Left Job', 'shared_left_job'),
        t('isPrimaryContact', 'Is Primary Contact', { type: 'checkbox' }),
    ]),
    ...section('contacts', 'overview', 'Alternate Communication Channels', [
        t('phone3', 'Phone 3', { type: 'phone' }),
        t('phone4', 'Phone 4', { type: 'phone' }),
        t('phone5', 'Phone 5', { type: 'phone' }),
        t('emailAddress', 'Email Address', { type: 'email', soft: true }),
    ]),
    ...section('contacts', 'overview', 'Internal Assignment & Department Role', [
        sel('designation', 'Designation', 'contact_designation'),
        sel('department', 'Department', 'contact_department'),
        t('assignedTo', 'Assigned to', { type: 'lookup', req: true }),
        { key: 'communicationType', label: 'Communication Type', type: 'multiselect', cat: 'contact_communication_type' },
        t('doNotCall', 'Do Not Call (DND)', { type: 'checkbox' }),
    ]),
    ...section('contacts', 'overview', 'Notes', [t('addDescription', 'Add Description', { type: 'textarea' })]),

    // ── Organizations ──
    ...section('organizations', 'overview', 'Organization Details', [
        t('organizationName', 'Organization Name', { req: true }),
        t('tradeName', 'Trade Name'),
        t('mailingName', 'Mailing Name'),
        sel('natureOfBusiness', 'Nature of Business', 'org_nature_of_business', { soft: true }),
        sel('typeOfEntity', 'Type of Entity', 'org_type_of_entity', { soft: true }),
        sel('customerType', 'Customer Type', 'org_customer_type', { soft: true }),
        // Conditional (locked): shown, and required, only when Customer Type is Partner. Same list as partner companies.
        sel('natureOfPartner', 'Nature of Partner', 'partner_nature', { lock: true }),
        sel('accountStatus', 'Account Status', 'org_account_status'),
        t('sapCodeTallyId', 'SAP Code / Tally ID'),
        t('showroomBranchCode', 'Showroom / Branch Code'),
        sel('leadSource', 'Lead Source', 'shared_lead_source'),
        sel('annualTurnover', 'Annual Turnover', 'org_annual_turnover'),
        sel('numberOfEmployees', 'Number of Employees', 'org_employee_count'),
        t('memberOf', 'Member of (Parent Corporation)', { type: 'lookup' }),
        t('assignedTo', 'Assigned to (Account Executive)', { type: 'lookup', req: true }),
        t('addDescriptionAndScope', 'Add Description & Scope', { type: 'textarea' }),
    ]),
    ...section('organizations', 'address', 'Billing Address', addressFields('billing', 'soft')),
    ...section('organizations', 'address', 'Shipping Address', addressFields('shipping', 'optional')),
    ...section('organizations', 'tax_bank', 'Tax Identification & Compliance', [
        sel('registrationType', 'Registration Type', 'shared_registration_type', { req: true }),
        t('gstNumber', 'GST Number', { type: 'uppercase', lock: true }),
        t('panNumber', 'PAN Number', { type: 'uppercase' }),
        t('tanNumber', 'TAN Number', { type: 'uppercase' }),
        t('cinNo', 'CIN No', { type: 'uppercase' }),
        t('msmeRegnNumber', 'MSME Regn. Number', { type: 'uppercase' }),
    ]),
    ...section('organizations', 'tax_bank', 'Bank Account Details', [
        t('accountName', 'Account Name'),
        t('bankName', 'Bank Name'),
        sel('typeOfAccount', 'Type Of Account', 'org_account_type'),
        t('accountNo', 'Account No'),
        t('ifscCode', 'IFSC Code', { type: 'uppercase' }),
        t('bankAddress', 'Bank Address'),
    ]),

    // ── Opportunities ──
    ...section('opportunities', 'basic', 'Primary Opportunity Details', [
        t('organizationName', 'Organization name', { type: 'lookup', req: true }),
        t('contact', 'Contact', { type: 'lookup', req: true }),
        t('contactNumber', 'Contact Number', { type: 'phone' }),
        t('contactEmail', 'Contact Email', { type: 'email' }),
        // Conditional (locked), as on leads: Referred By for Lead Source CA / Reference, Nature of Partner for Partner.
        t('referredBy', 'Referred By', { type: 'lookup', lock: true }),
        sel('natureOfPartner', 'Nature of Partner', 'partner_nature', { lock: true }),
        t('leadGivenBy', 'Lead Given By', { type: 'lookup', soft: true }),
        sel('type', 'Type', 'opportunity_type', { soft: true }),
        sel('leadSource', 'Lead Source', 'shared_lead_source', { soft: true }),
        sel('salesStage', 'Sales Stage', 'opportunity_sales_stage', { req: true }),
        sel('followupType', 'Followup Type', 'shared_followup_type'),
        sel('customerResponse', 'Customer Response', 'shared_customer_response'),
        t('nextFollowupDate', 'Next Followup Date', { type: 'datetime', soft: true }),
        t('assignedTo', 'Assigned to', { type: 'lookup', req: true }),
        { key: 'productCategory', label: 'Product Category', type: 'multiselect', cat: 'shared_product_category', soft: true },
        t('remarks', 'Remarks', { type: 'textarea', soft: true }),
    ]),
    ...section('opportunities', 'basic', 'Billing Details', [
        t('tallySerialNo', 'Tally Serial No'),
        t('invoiceNo', 'Invoice No'),
        t('invoiceDate', 'Invoice Date', { type: 'date' }),
    ]),
    ...section('opportunities', 'basic', 'Commission', [
        sel('commission', 'Commission', 'opportunity_commission', { soft: true }),
        // Shown and required only when Commission is Yes (the form and the API enforce it).
        t('commissionAmount', 'Commission Amount', { type: 'amount', lock: true }),
        // Shown when Commission is Yes: Self up to 1,000, Other above (the form and the API enforce it).
        sel('commissionType', 'Commission Type', 'opportunity_commission_type', { lock: true }),
        // The payee's bank details, shown and required while Commission Type is Other (as on the Organization form).
        t('accountName', 'Account Name', { lock: true }),
        t('accountNo', 'Account No', { lock: true }),
        t('bankName', 'Bank Name', { lock: true }),
        t('ifscCode', 'IFSC Code', { type: 'uppercase', lock: true }),
        t('panNumber', 'PAN Number', { type: 'uppercase', lock: true }),
    ]),
    // Last section of the Basic tab. Add Document must be Yes at Sales Stage PO (the form and the API enforce it).
    ...section('opportunities', 'basic', 'Documentation', [
        sel('addDocument', 'Add Document', 'opportunity_add_document', { lock: true }),
        // Shown while Add Document is Yes.
        t('documentNo', 'Document No'),
        t('documentDate', 'Document Date', { type: 'date' }),
        // Required while Add Document is Yes (the form and the API enforce it).
        t('documentFile', 'Upload Doc', { type: 'file', lock: true }),
        t('documentRemarks', 'Remarks', { type: 'textarea' }),
    ]),

    // ── Quotations ──
    ...section('quotations', 'overview', 'OVERVIEW', [
        t('quotationTitle', 'Quotation Title', { req: true }),
        t('opportunity', 'Opportunity', { req: true }),
        sel('company', 'Company', 'quote_company', { req: true }),
        t('quotationDate', 'Quotation Date', { type: 'date', req: true }),
        sel('validationPeriod', 'Validation Period', 'quote_validation_period', { soft: true }),
        t('validUntil', 'Valid Until', { type: 'date', req: true }),
        sel('quoteStage', 'Quote Stage', 'quote_stage', { req: true }),
        sel('preparedFor', 'Prepared For', undefined, { req: true }),
        t('assignedTo', 'Assigned to', { type: 'lookup', req: true }),
        t('otherRef', 'Other Ref.'),
    ]),
    ...section('quotations', 'overview', 'Terms & Payment', [
        sel('termsAndCondition', 'Terms & Condition', 'quote_terms_template', { soft: true }),
        t('termsAndConditionDescription', 'Terms & Condition Description', { type: 'textarea' }),
        sel('paymentTerms', 'Payment Terms', 'quote_payment_terms', { soft: true }),
        t('paymentTermsDescription', 'Payment Terms Description', { type: 'textarea' }),
        t('remarks', 'Remarks', { type: 'textarea' }),
    ]),
    ...section('quotations', 'address', 'ACCOUNT & CONTACT CONTEXT', [
        t('organizationName', 'Organization Name', { type: 'lookup' }),
        t('mailingName', 'Mailing Name'),
        t('gstNumber', 'GST Number', { type: 'uppercase' }),
        t('contact', 'Contact', { type: 'lookup', req: true }),
        t('contactNumber', 'Contact Number', { type: 'phone' }),
        t('contactEmail', 'Contact Email', { type: 'email' }),
    ]),
    ...section('quotations', 'address', 'BILLING ADDRESS', addressFields('billing', 'locked')),
    ...section('quotations', 'address', 'SHIPPING ADDRESS', addressFields('shipping', 'optional')),

    // ── Products ──
    ...section('products', 'overview', 'Sale Information', [
        t('productName', 'Product Name', { req: true }),
        sel('category', 'Category', 'shared_product_category'),
        sel('type', 'Type', 'product_type'),
        t('manufacturer', 'Manufacturer'),
        t('hsnCode', 'HSN Code'),
    ]),
    ...section('products', 'overview', 'Pricing & Tax', [
        t('cost', 'Cost (₹)', { type: 'amount' }),
        t('mrp', 'MRP (₹)', { type: 'amount' }),
        t('msp', 'MSP (₹)', { type: 'amount' }),
        sel('taxType', 'Tax Type', 'product_tax_type'),
        sel('taxRate', 'Tax Rate', 'product_tax_rate'),
        t('discount', 'Discount (%)', { type: 'percentage' }),
        sel('contractCreate', 'Contract Create', 'product_contract_create'),
    ]),
    ...section('products', 'overview', 'Description & Terms', [
        t('description', 'Description', { type: 'textarea' }),
        t('termsAndConditions', 'Terms and Conditions', { type: 'textarea' }),
    ]),

    // ── Tickets ──
    ...section('tickets', 'overview', 'Ticket Details', [
        t('ticketSubject', 'Ticket Subject', { lock: true }),
        t('organizationName', 'Organization Name', { type: 'lookup', req: true }),
        t('contact', 'Contact', { type: 'lookup', req: true }),
        t('contactNumber', 'Contact Number', { type: 'phone' }),
        t('contactEmail', 'Contact Email', { type: 'email' }),
        sel('leftJob', 'Left Job', 'shared_left_job'),
        t('natureOfCall', 'Nature Of Call', { type: 'lookup', soft: true }),
    ]),
    ...section('tickets', 'overview', 'Classification & SLA', [
        sel('ticketPriority', 'Ticket Priority', 'ticket_priority', { soft: true }),
        sel('ticketStatus', 'Ticket Status', 'ticket_status'),
        sel('source', 'Source', 'ticket_source'),
        sel('supportType', 'Support Type', 'ticket_support_type'),
        sel('supportMode', 'Support Mode', 'ticket_support_mode', { soft: true }),
        t('dueDate', 'Due Date', { type: 'datetime', req: true }),
        t('assignedTo', 'Assigned to', { type: 'lookup', req: true }),
    ]),
    ...section('tickets', 'overview', 'Problem & Resolution', [
        t('accountAddress', 'Account Address', { type: 'textarea' }),
        t('problemReported', 'Problem Reported', { type: 'textarea', req: true }),
        t('problemObserved', 'Problem Observed', { type: 'textarea' }),
        t('rca', 'RCA (Root Cause Analysis)', { type: 'textarea' }),
        t('resolution', 'Resolution', { type: 'textarea' }),
        t('reasonForEscalatedCalls', 'Reason For Escalated Calls', { type: 'textarea' }),
        t('addDescription', 'Add Description', { type: 'textarea' }),
    ]),
    ...section('tickets', 'partner_company', 'Partner Company', [
        t('partnerCompany', 'Partner Company', { type: 'lookup' }),
        t('partnerCompanyContact', 'Partner Company Contact', { type: 'lookup' }),
    ]),

    // ── Contracts ──
    ...section('contracts', 'overview', 'Contract Details', [
        sel('contractTitle', 'Contract Title', 'contract_title', { req: true }),
        sel('status', 'Status', 'contract_status', { req: true }),
        t('contractValue', 'Contract Value', { type: 'amount', soft: true }),
        t('assignedTo', 'Contract Manager', { type: 'lookup', req: true }),
        t('organizationName', 'Organization Name', { type: 'lookup', req: true }),
        t('contact', 'Contact Person', { type: 'lookup', req: true }),
        t('opportunity', 'Opportunity', { type: 'lookup' }),
        t('tallySerialNo', 'Tally Serial Number'),
    ]),
    ...section('contracts', 'overview', 'Term & Renewal', [
        t('startDate', 'Contract Start Date', { type: 'date' }),
        t('endDate', 'Contract End Date', { type: 'date' }),
        sel('contractPeriod', 'Contract Period', 'contract_period', { soft: true }),
        t('renewalReminderDate', 'Renewal Reminder Date', { type: 'datetime' }),
        { key: 'contractType', label: 'Contract Type', type: 'multiselect', cat: 'contract_type', soft: true },
    ]),
    ...section('contracts', 'overview', 'Billing', [
        t('billNumber', 'Bill Number', { soft: true }),
        t('billDate', 'Bill Date', { type: 'date', soft: true }),
        t('billAmount', 'Bill Amount', { type: 'amount', soft: true }),
        t('description', 'Description', { type: 'textarea' }),
    ]),

    // ── Partner companies ──
    ...section('partner-companies', 'company_info', 'Company Details', [
        t('partnerName', 'Partner Name', { req: true }),
        sel('natureOfPartner', 'Nature of Partner', 'partner_nature', { soft: true }),
        t('officePhone', 'Office Phone', { type: 'phone', soft: true }),
        t('website', 'Website'),
        t('assignedTo', 'Assigned to', { type: 'lookup' }),
        t('principalCompany', 'Principal Company', { type: 'lookup' }),
        t('emailAddress', 'Email Address', { type: 'email', req: true }),
        t('addDescription', 'Add Description', { type: 'textarea' }),
        t('description', 'Description', { type: 'textarea' }),
    ]),
    ...section('partner-companies', 'company_info', 'BANK DETAILS', [
        t('bankName', 'Bank Name'),
        t('branch', 'Branch'),
        t('accountNo', 'Account No'),
        t('ifscCode', 'IFSC Code', { type: 'uppercase' }),
    ]),
    ...section('partner-companies', 'address', 'Billing Address', addressFields('billing', 'soft')),
    ...section('partner-companies', 'address', 'Shipping Address', addressFields('shipping', 'optional')),
    ...section('partner-companies', 'statutory', 'Statutory & Tax Identification', [
        t('gstNumber', 'GST Number', { type: 'uppercase' }),
        t('panNumber', 'PAN Number', { type: 'uppercase' }),
        t('cinNo', 'CIN No', { type: 'uppercase' }),
        t('msmeRegnNumber', 'MSME Regn. Number', { type: 'uppercase' }),
        t('tanNumber', 'TAN Number', { type: 'uppercase' }),
    ]),
];

/** Built-in fields with a running sortOrder per module (10, 20, …) so sections keep their form order. */
export const DEFAULT_FIELDS: DefaultField[] = (() => {
    const counters = new Map<string, number>();
    return RAW_DEFAULT_FIELDS.map((field) => {
        const next = (counters.get(field.module) ?? 0) + 10;
        counters.set(field.module, next);
        return { ...field, sortOrder: next };
    });
})();

/** The records a lead conversion creates: their fields can be shown on the Convert Lead form. */
export const CONVERT_MODULES = ['contacts', 'organizations', 'opportunities'] as const;
export type ConvertModuleKey = (typeof CONVERT_MODULES)[number];
export const isConvertModule = (module: string): module is ConvertModuleKey => (CONVERT_MODULES as readonly string[]).includes(module);

/**
 * Built-in fields the Convert Lead form has its own inputs for (fieldKey → the convert form's field name). They are
 * shown there by default. Mirrors CONVERT_FIELD_NAMES in frontend-crm/src/validations/convertLead.schema.ts.
 */
export const CONVERT_FIELD_NAMES: Readonly<Record<ConvertModuleKey, Readonly<Record<string, string>>>> = {
    contacts: {
        name: 'contactName',
        mobile: 'contactMobile',
        phone3: 'contactPhone3',
        organizationName: 'organizationName',
        emailAddress: 'contactEmails',
        isPrimaryContact: 'isPrimaryContact',
        designation: 'designation',
        department: 'department',
        communicationType: 'communicationType',
        doNotCall: 'doNotCall',
        addDescription: 'contactDescription',
    },
    organizations: {
        organizationName: 'organizationName',
        mailingName: 'mailingName',
        natureOfBusiness: 'natureOfBusiness',
        typeOfEntity: 'typeOfEntity',
        customerType: 'customerType',
        natureOfPartner: 'natureOfPartner',
        leadSource: 'leadSource',
        memberOf: 'memberOf',
        addDescriptionAndScope: 'organizationDescription',
    },
    opportunities: {
        productCategory: 'productCategory',
        organizationName: 'organizationName',
        referredBy: 'referredBy',
        natureOfPartner: 'opportunityNatureOfPartner',
        type: 'type',
        leadSource: 'opportunityLeadSource',
        nextFollowupDate: 'nextFollowupDate',
        followupType: 'followupType',
        remarks: 'opportunityDescription',
    },
};

/**
 * Built-in fields the conversion fills in itself (from the lead or the linked records), so they can't be shown there.
 * Assigned To is the lead's own Assigned To on every new record. Mirrors frontend-crm utils/convertLeadFields.ts.
 */
const CONVERT_FILLED_FIELDS: Readonly<Record<ConvertModuleKey, ReadonlySet<string>>> = {
    contacts: new Set(['assignedTo']),
    organizations: new Set(['partnerCompany', 'assignedTo']),
    opportunities: new Set(['contact', 'contactNumber', 'contactEmail', 'leadGivenBy', 'assignedTo']),
};

/**
 * Why a field of a conversion record can't be shown on the Convert Lead form, or null when it can. Fields with their
 * own Convert Lead input always can; any other field needs a control the form can draw from its configuration alone
 * (pickers and dropdowns without a list need their record's own form). Mirrors convertFieldUnavailableReason in
 * frontend-crm/src/validations/convertLead.schema.ts.
 */
export function convertFieldUnavailableReason(
    module: ConvertModuleKey,
    field: { fieldKey: string; fieldType: string; isSystem: boolean; dropdownCategoryKey?: string | null; dropdownCategoryId?: string | null },
): string | null {
    if (field.isSystem && field.fieldKey in CONVERT_FIELD_NAMES[module]) return null;
    if (field.isSystem && CONVERT_FILLED_FIELDS[module].has(field.fieldKey)) return 'Filled in by the conversion';
    if (field.fieldType === 'lookup' || field.fieldType === 'datetime' || field.fieldType === 'file') return 'Picker fields can only be set on their own form';
    const hasList = Boolean(field.dropdownCategoryKey ?? field.dropdownCategoryId);
    if ((field.fieldType === 'select' || field.fieldType === 'multiselect') && !hasList) return 'Needs its own form (no dropdown list)';
    return null;
}

/**
 * True when a built-in field row was deleted by an admin: the row stays as a tombstone
 * (`validationRulesJson: {"_deleted":true}`) so start-up seeding does not recreate it and the
 * hand-built form hides its input.
 */
export function isFieldTombstoned(validationRulesJson: string | null | undefined): boolean {
    if (!validationRulesJson) return false;
    try {
        return Boolean(JSON.parse(validationRulesJson)?._deleted);
    } catch {
        return false;
    }
}
