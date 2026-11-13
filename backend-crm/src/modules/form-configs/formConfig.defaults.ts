/**
 * Default dropdown categories / options and built-in form field definitions, seeded by `formConfig.seed.ts`.
 *
 * Option lists mirror frontend-crm/src/types/*.types.ts and frontend-crm/src/components/organizations/constants.ts
 * (the frontend keeps them as fallbacks while the configuration loads). Field definitions mirror the fields the
 * hand-built forms render; `fieldKey` is the React Hook Form name, so overrides apply to the matching control.
 *
 * Yes/No toggles (leftJob, provideSupport, contractCreate, addDocument, …) are deliberately absent: they stay
 * fixed boolean controls.
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
export const FIELD_TYPES = [...CUSTOM_FIELD_TYPES, 'lookup', 'datetime'] as const;
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
    'opportunity_type',
    'org_nature_of_business',
    'org_type_of_entity',
    'org_customer_type',
    'contact_designation',
    'contact_department',
    'contact_communication_type',
    'quote_terms_template',
    'quote_payment_terms',
]);

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

    // ── Leads ──
    {
        key: 'lead_status',
        label: 'Lead Status',
        module: 'leads',
        description: "'New' is the default and 'Converted' is set by the Convert action.",
        options: withSystem(
            ['New', 'Contacted', 'In Discussion', 'Demo Scheduled', 'Proposal Sent', 'Qualified', 'Negotiation', 'Converted', 'Unqualified / Lost'],
            ['New', 'Converted'],
        ),
    },
    { key: 'lead_type', label: 'Lead Type', module: 'leads', options: ['Hot', 'Warm', 'Cold', 'Corporate', 'SME', 'Enterprise'] },
    {
        key: 'lead_designation',
        label: 'Lead Designation',
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
        label: 'Lead Department',
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
        key: 'lead_registration_type',
        label: 'Lead Registration Type',
        module: 'leads',
        options: ['Registered', 'Unregistered', 'Composition Scheme', 'Consumer', 'Overseas / Export', 'Special Economic Zone (SEZ)'],
    },
    {
        key: 'lead_turnover',
        label: 'Lead Turnover Range',
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
        label: 'Lead Employee Range',
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
    // Organizations' Lead Source (sourceOfLead) shares the lead form's 'shared_lead_source' dropdown.
    {
        key: 'org_registration_type',
        label: 'GST Registration Type',
        module: 'organizations',
        description: "'Registered' organizations must have a GSTIN.",
        options: withSystem(['Registered', 'Unregistered'], ['Registered', 'Unregistered']),
    },
    {
        key: 'org_account_type',
        label: 'Bank Account Type',
        module: 'organizations',
        options: ['Current Account', 'Savings Account', 'Cash Credit (CC)', 'Overdraft (OD)', 'Escrow Account', 'Other'],
    },

    // ── Contacts ──
    {
        key: 'contact_designation',
        label: 'Contact Designation',
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
        label: 'Contact Department',
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
        description: "'Proposal/Price Quote' is set when a quotation is raised; 'Closed Won' / 'Closed Lost' close the deal.",
        options: withSystem(
            ['Qualification', 'Demo', 'Proposal/Price Quote', 'Negotiation', 'On Hold', 'Closed Won', 'Closed Lost', 'PO', 'Advance Received'],
            ['Proposal/Price Quote', 'Closed Won', 'Closed Lost'],
        ),
    },
    {
        key: 'opportunity_type',
        label: 'Opportunity Type',
        module: 'opportunities',
        options: ['Existing Business', 'New Business', 'Upgrade / Renewal', 'Add-on Module', 'Cloud Migration', 'Customization & Training'],
    },
    {
        key: 'opportunity_commission',
        label: 'Commission',
        module: 'opportunities',
        options: ['Standard (10%)', 'Executive (15%)', 'Partner Split (20%)', 'Direct (5%)', 'Nil / Direct (0%)'],
    },

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

    // ── Partner companies ──
    {
        key: 'partner_nature',
        label: 'Nature of Partner',
        module: 'partner-companies',
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
    lead_type: ['Hot'],
    lead_department: ['Executive Management'],
    contact_communication_type: ['Call', 'Email'],
    org_account_status: ['Active'],
    org_registration_type: ['Registered'],
    opportunity_type: ['New Business'],
    opportunity_sales_stage: ['Qualification'],
    opportunity_commission: ['Standard (10%)'],
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
        t('emailAddresses', 'Email Address', { type: 'email' }),
    ]),
    ...section('leads', 'overview', 'ORGANIZATION', [
        t('organizationName', 'Organization Name'),
        t('tradeName', 'Trade Name'),
        t('mailingName', 'Mailing Name'),
        sel('registrationType', 'Registration Type', 'lead_registration_type'),
        t('gstNo', 'GST Number', { type: 'uppercase', lock: true }),
        sel('turnover', 'Turnover', 'lead_turnover'),
        sel('noOfEmployee', 'No of Employee', 'lead_employee_range'),
    ]),
    ...section('leads', 'overview', 'PIPELINE & FOLLOW-UP', [
        sel('leadSource', 'Lead Source', 'shared_lead_source', { soft: true }),
        sel('leadType', 'Lead Type', 'lead_type', { soft: true }),
        sel('status', 'Status', 'lead_status'),
        t('referredBy', 'Referred By', { type: 'lookup' }),
        sel('followupType', 'Followup Type', 'shared_followup_type'),
        t('nextFollowupDate', 'Next Followup Date', { type: 'datetime', soft: true }),
        t('assignedTo', 'Assigned to', { type: 'lookup', req: true }),
        { key: 'productCategory', label: 'Product Category', type: 'multiselect', cat: 'shared_product_category', soft: true },
    ]),
    ...section('leads', 'overview', 'NOTES', [
        t('addDescription', 'Add Description', { type: 'textarea', soft: true }),
        t('description', 'Description', { type: 'textarea' }),
    ]),
    ...section('leads', 'address', 'PRIMARY ADDRESS', addressFields('primary', 'optional')),
    ...section('leads', 'address', 'OTHER ADDRESS', addressFields('other', 'optional')),

    // ── Contacts ──
    ...section('contacts', 'overview', 'Contact Details & Association', [
        t('name', 'Name', { req: true }),
        t('mobile', 'Mobile', { type: 'phone', req: true }),
        t('officePhone', 'Office Phone', { type: 'phone' }),
        t('organizationName', 'Organization Name', { type: 'lookup', req: true }),
    ]),
    ...section('contacts', 'overview', 'Alternate Communication Channels', [
        t('phone3', 'Phone 3', { type: 'phone' }),
        t('phone4', 'Phone 4', { type: 'phone' }),
        t('phone5', 'Phone 5', { type: 'phone' }),
        t('emailAddresses', 'Email Address', { type: 'email', soft: true }),
    ]),
    ...section('contacts', 'overview', 'Internal Assignment & Department Role', [
        sel('designation', 'Designation', 'contact_designation'),
        sel('department', 'Department', 'contact_department'),
        t('assignedTo', 'Assigned to', { type: 'lookup', req: true }),
        { key: 'communicationType', label: 'Communication Type', type: 'multiselect', cat: 'contact_communication_type' },
    ]),
    ...section('contacts', 'overview', 'Notes', [t('description', 'Add Description', { type: 'textarea' })]),

    // ── Organizations ──
    ...section('organizations', 'overview', 'Organization Details', [
        t('organizationName', 'Organization Name', { req: true }),
        t('tradeName', 'Trade Name'),
        t('mailingName', 'Mailing Name'),
        sel('natureOfBusiness', 'Nature of Business', 'org_nature_of_business', { soft: true }),
        sel('typeOfEntity', 'Type of Entity', 'org_type_of_entity', { soft: true }),
        sel('customerType', 'Customer Type', 'org_customer_type', { soft: true }),
        sel('accountStatus', 'Account Status', 'org_account_status'),
        t('sapCodeTallyId', 'SAP Code / Tally ID'),
        t('showroomBranchCode', 'Showroom / Branch Code'),
        sel('sourceOfLead', 'Lead Source', 'shared_lead_source'),
        sel('annualTurnover', 'Annual Turnover', 'org_annual_turnover'),
        sel('numberOfEmployees', 'Number of Employees', 'org_employee_count'),
        t('memberOfParentCorp', 'Member of (Parent Corporation)', { type: 'lookup' }),
        t('partnerCompany', 'Partner Company', { type: 'lookup' }),
        t('assignedUser', 'Assigned to (Account Executive)', { type: 'lookup', req: true }),
        t('description', 'Add Description & Scope', { type: 'textarea' }),
    ]),
    ...section('organizations', 'address', 'Billing Address', addressFields('billing', 'soft')),
    ...section('organizations', 'address', 'Shipping Address', addressFields('shipping', 'optional')),
    ...section('organizations', 'tax_bank', 'Tax Identification & Compliance', [
        sel('registrationType', 'Registration Type', 'org_registration_type', { req: true }),
        t('gstNo', 'GST Number', { type: 'uppercase', lock: true }),
        t('panNumber', 'PAN Number', { type: 'uppercase' }),
        t('tanNumber', 'TAN Number', { type: 'uppercase' }),
        t('cinNo', 'CIN No', { type: 'uppercase' }),
        t('msmeRegnNumber', 'MSME Regn. Number', { type: 'uppercase' }),
    ]),
    ...section('organizations', 'tax_bank', 'Bank Account Details', [
        t('accountName', 'Account Name'),
        t('bankName', 'Bank Name'),
        sel('typeOfAccount', 'Type Of Account', 'org_account_type'),
        t('accountNumber', 'Account Number'),
        t('bankIfscCode', 'Bank IFSC Code', { type: 'uppercase' }),
        t('bankAddress', 'Bank Address'),
    ]),

    // ── Opportunities ──
    ...section('opportunities', 'basic', 'Primary Opportunity Details', [
        t('organizationName', 'Organization name', { type: 'lookup', req: true }),
        t('contactName', 'Contact', { type: 'lookup', req: true }),
        t('emailAddress', 'Email Address', { type: 'email' }),
        t('referredBy', 'Referred By', { type: 'lookup' }),
        t('leadGivenBy', 'Lead Given By', { type: 'lookup', soft: true }),
        sel('type', 'Type', 'opportunity_type', { soft: true }),
        sel('leadSource', 'Lead Source', 'shared_lead_source', { soft: true }),
        sel('salesStage', 'Sales Stage', 'opportunity_sales_stage', { req: true }),
        sel('followupType', 'Followup Type', 'shared_followup_type'),
        t('nextFollowupDate', 'Next Followup Date', { type: 'datetime', soft: true }),
        t('assignedTo', 'Assigned to', { type: 'lookup', req: true }),
        { key: 'productCategory', label: 'Product Category', type: 'multiselect', cat: 'shared_product_category', soft: true },
        t('addDescription', 'Add Description', { type: 'textarea', soft: true }),
        t('description', 'Description', { type: 'textarea' }),
    ]),
    ...section('opportunities', 'basic', 'Billing Details', [
        t('tallySerialNo', 'Tally Serial No'),
        t('invoiceNo', 'Invoice No'),
        t('invoiceDate', 'Invoice Date', { type: 'date' }),
    ]),
    ...section('opportunities', 'basic', 'Commission & Documentation', [sel('commission', 'Commission', 'opportunity_commission', { soft: true })]),

    // ── Quotations ──
    ...section('quotations', 'overview', 'OVERVIEW', [
        t('quotationTitle', 'Quotation Title', { req: true }),
        t('opportunityName', 'Opportunity', { req: true }),
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
        t('organizationName', 'Organization', { type: 'lookup' }),
        t('mailingName', 'Mailing Name'),
        t('gstNo', 'GST NO', { type: 'uppercase' }),
        t('contactName', 'Contact', { type: 'lookup', req: true }),
        t('contactMobile', 'Contact Mobile No', { type: 'phone' }),
        t('contactEmail', 'Contact Email Address', { type: 'email' }),
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
    ]),
    ...section('products', 'overview', 'Description & Terms', [
        t('description', 'Description', { type: 'textarea' }),
        t('termsAndConditions', 'Terms and Conditions', { type: 'textarea' }),
    ]),

    // ── Tickets ──
    ...section('tickets', 'overview', 'Ticket Details', [
        t('ticketSubject', 'Ticket Subject', { lock: true }),
        t('organizationName', 'Organization Name', { type: 'lookup', req: true }),
        t('contactPersonName', 'Contact Person Name', { type: 'lookup', req: true }),
        t('contactNumber', 'Contact Number', { type: 'phone' }),
        t('contactEmail', 'Contact Email', { type: 'email' }),
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

    // ── Partner companies ──
    ...section('partner-companies', 'company_info', 'Company Details', [
        t('companyName', 'Partner Name', { req: true }),
        sel('natureOfPartner', 'Nature of Partner', 'partner_nature', { soft: true }),
        t('phone', 'Office Phone', { type: 'phone', soft: true }),
        t('website', 'Website'),
        t('assignedTo', 'Assigned to', { type: 'lookup' }),
        t('principalCompany', 'Principal Company', { type: 'lookup' }),
        t('emailAddresses', 'Email Address', { type: 'email', req: true }),
        t('addDescription', 'Add Description', { type: 'textarea' }),
        t('description', 'Description', { type: 'textarea' }),
    ]),
    ...section('partner-companies', 'company_info', 'BANK DETAILS', [
        t('bankName', 'Bank Name'),
        t('bankBranch', 'Branch'),
        t('accountNumber', 'Account No'),
        t('bankIfscCode', 'IFSC Code', { type: 'uppercase' }),
    ]),
    ...section('partner-companies', 'address', 'Billing Address', addressFields('billing', 'soft')),
    ...section('partner-companies', 'address', 'Shipping Address', addressFields('shipping', 'optional')),
    ...section('partner-companies', 'statutory', 'Statutory & Tax Identification', [
        t('gstNo', 'GST Number', { type: 'uppercase' }),
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
