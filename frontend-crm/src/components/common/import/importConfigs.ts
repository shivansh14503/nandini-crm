import type { ColumnMapping, ImportEntityConfig, ImportEntityType, MappedRow, ParsedFile } from './types';
import { normalizeImportCell } from './importFields';

/**
 * Familiar spreadsheet columns of each import: the header aliases auto-mapping recognizes and the sample cells of the
 * downloadable template, keyed by the form's field key. The mapping step itself offers every field of the module's
 * creation form (`buildImportConfig` in importFields.ts, from the Form Builder configuration); this list is only its
 * fallback while that configuration loads.
 */
export const IMPORT_CONFIGS: Record<ImportEntityType, ImportEntityConfig> = {
    organizations: {
        entity: 'organizations',
        singular: 'Organization',
        plural: 'Organizations',
        fields: [
            { key: 'organizationName', label: 'Organization Name', required: true, aliases: ['name', 'organization', 'company', 'company name', 'account name', 'org name'], sample: ['Acme Traders Pvt Ltd', 'Bright Tech Solutions'] },
            { key: 'natureOfBusiness', label: 'Nature of Business', required: false, aliases: ['industry', 'business', 'nature'], sample: ['Distributor / Trading / Wholesale', 'IT / Software'] },
            { key: 'customerType', label: 'Customer Type', required: false, aliases: ['type', 'customer'], sample: ['End User', 'Partner'] },
            { key: 'natureOfPartner', label: 'Nature of Partner', required: false, aliases: ['partner type', 'nature of partner'], sample: ['', 'TALLY-3STAR PARTNER'] },
            { key: 'accountStatus', label: 'Status', required: false, aliases: ['status', 'account status'], sample: ['Active', 'Active'] },
            { key: 'billingAddress', label: 'Billing Street', required: false, aliases: ['street', 'address', 'billing address', 'billing street'], sample: ['12 MG Road', '45 Park Street'] },
            { key: 'billingCity', label: 'Billing City', required: false, aliases: ['city'], sample: ['Mumbai', 'Bengaluru'] },
            { key: 'billingState', label: 'Billing State', required: false, aliases: ['state'], sample: ['Maharashtra', 'Karnataka'] },
            { key: 'gstNumber', label: 'GST Number', required: false, aliases: ['gst', 'gstin', 'gst no'], sample: ['27ABCDE1234F1Z5', '29ABCDE1234F1Z5'] },
        ],
    },
    contacts: {
        entity: 'contacts',
        singular: 'Contact',
        plural: 'Contacts',
        fields: [
            { key: 'name', label: 'Name', required: true, aliases: ['full name', 'contact name', 'contact'], sample: ['Rahul Sharma', 'Priya Verma'] },
            { key: 'mobile', label: 'Mobile', required: false, aliases: ['phone', 'mobile no', 'mobile_no', 'telephone', 'cell', 'contact number'], sample: ['9876543210', '9123456780'] },
            { key: 'emailAddress', label: 'Email Address', required: false, aliases: ['email', 'e-mail', 'mail', 'email id'], sample: ['rahul@example.com', 'priya@example.com'] },
            { key: 'organizationName', label: 'Organization', required: false, aliases: ['organization', 'company', 'company name', 'account'], sample: ['Acme Traders Pvt Ltd', 'Bright Tech Solutions'] },
            { key: 'designation', label: 'Designation', required: false, aliases: ['title', 'job title', 'role', 'position'], sample: ['Purchase Head / Manager', 'Director / Partner'] },
            { key: 'department', label: 'Department', required: false, aliases: ['dept'], sample: ['Purchase', 'Management'] },
            { key: 'officePhone', label: 'Office Phone', required: false, aliases: ['office', 'landline', 'work phone'], sample: ['02212345678', ''] },
            { key: 'addDescription', label: 'Add Description', required: false, aliases: ['notes', 'remarks', 'comments'], sample: ['Key decision maker', ''] },
        ],
    },
    products: {
        entity: 'products',
        singular: 'Product',
        plural: 'Products',
        fields: [
            { key: 'productName', label: 'Product Name', required: true, aliases: ['name', 'product', 'item', 'item name'], sample: ['TallyPrime Silver', 'Tally AMC Annual'] },
            { key: 'hsnCode', label: 'HSN Code', required: false, aliases: ['hsn', 'sac', 'hsn/sac'], sample: ['998431', '998313'] },
            { key: 'category', label: 'Category', required: false, aliases: ['product category', 'group'], sample: ['TallyPrime', 'Tally AMC'] },
            { key: 'type', label: 'Type', required: false, aliases: ['product type'], sample: ['Product', 'Service'] },
            { key: 'manufacturer', label: 'Manufacturer', required: false, aliases: ['brand', 'vendor', 'make'], sample: ['Tally Solutions', 'Tally Solutions'] },
            { key: 'taxRate', label: 'Tax Rate', required: false, aliases: ['tax', 'gst rate', 'gst %'], sample: ['18%', '18%'] },
            { key: 'cost', label: 'Cost', required: false, aliases: ['purchase price', 'cost price'], sample: ['16000', '4000'] },
            { key: 'mrp', label: 'MRP', required: false, aliases: ['price', 'selling price', 'list price'], sample: ['22500', '5400'] },
            { key: 'description', label: 'Description', required: false, aliases: ['details', 'notes'], sample: ['Single user license', 'Annual maintenance'] },
        ],
    },
    leads: {
        entity: 'leads',
        singular: 'Lead',
        plural: 'Leads',
        fields: [
            { key: 'name', label: 'Name', required: true, aliases: ['full name', 'lead name', 'contact name'], sample: ['Amit Patel', 'Neha Gupta'] },
            { key: 'mobile', label: 'Mobile', required: false, aliases: ['phone', 'mobile no', 'mobile_no', 'telephone', 'contact number'], sample: ['9988776655', '9090909090'] },
            { key: 'emailAddress', label: 'Email Address', required: false, aliases: ['email', 'e-mail', 'mail', 'email id'], sample: ['amit@example.com', 'neha@example.com'] },
            { key: 'organizationName', label: 'Organization', required: false, aliases: ['organization', 'company', 'company name'], sample: ['Patel Enterprises', 'Gupta & Co'] },
            { key: 'registrationType', label: 'Registration Type', required: false, aliases: ['gst registration', 'gst type'], sample: ['Unregistered', 'Registered'] },
            { key: 'gstNumber', label: 'GST Number', required: false, aliases: ['gst', 'gstin', 'gst no'], sample: ['', '27ABCDE1234F1Z5'] },
            { key: 'customerResponse', label: 'Customer Response', required: false, aliases: ['response'], sample: ['', ''] },
            { key: 'leadSource', label: 'Lead Source', required: false, aliases: ['source'], sample: ['Website Enquiry', 'CA'] },
            // Required when Lead Source is CA / Reference (Referred By) or Partner (Partner Company).
            { key: 'referredBy', label: 'Referred By', required: false, aliases: ['referred by', 'reference by', 'referrer'], sample: ['', 'Rajesh Kumar'] },
            { key: 'partnerCompany', label: 'Partner Company', required: false, aliases: ['partner', 'partner company', 'partner name'], sample: ['', ''] },
            { key: 'leadType', label: 'Lead Type', required: false, aliases: ['type'], sample: ['Inbound', 'Outbound'] },
            { key: 'status', label: 'Status', required: false, aliases: ['lead status', 'stage'], sample: ['New', 'Contacted'] },
            { key: 'primaryCity', label: 'City', required: false, aliases: ['city', 'billing city'], sample: ['Pune', 'Delhi'] },
            { key: 'primaryState', label: 'State / Region', required: false, aliases: ['state', 'billing state'], sample: ['Maharashtra', 'Delhi'] },
            { key: 'remarks', label: 'Remarks', required: false, aliases: ['notes', 'follow up remarks', 'description'], sample: ['Interested in TallyPrime', ''] },
        ],
    },
    opportunities: {
        entity: 'opportunities',
        singular: 'Opportunity',
        plural: 'Opportunities',
        fields: [
            { key: 'organizationName', label: 'Organization Name', required: true, aliases: ['organization', 'company', 'company name', 'account'], sample: ['Acme Traders Pvt Ltd', 'Bright Tech Solutions'] },
            { key: 'contact', label: 'Contact', required: true, aliases: ['contact', 'contact person', 'person name'], sample: ['Rahul Sharma', 'Priya Verma'] },
            { key: 'contactNumber', label: 'Contact Number', required: false, aliases: ['mobile', 'phone', 'contact mobile', 'mobile no', 'telephone'], sample: ['9876543210', '9123456780'] },
            { key: 'contactEmail', label: 'Contact Email', required: false, aliases: ['email address', 'contact email', 'e-mail'], sample: ['rahul@example.com', 'priya@example.com'] },
            { key: 'productCategory', label: 'Product Category', required: false, aliases: ['product', 'category', 'products'], sample: ['TallyPrime', 'Biz Analyst'] },
            { key: 'type', label: 'Type', required: false, aliases: ['type', 'opportunity type', 'deal type'], sample: ['New Business', 'Existing Business'] },
            { key: 'salesStage', label: 'Sales Stage', required: false, aliases: ['stage', 'status', 'pipeline stage'], sample: ['Qualification', 'Proposal/Price Quote'] },
            { key: 'leadSource', label: 'Lead Source', required: false, aliases: ['source'], sample: ['Website Enquiry', 'Partner'] },
            // Required when Lead Source is CA / Reference (Referred By) or Partner (Partner Company).
            { key: 'referredBy', label: 'Referred By', required: false, aliases: ['reference by', 'referrer'], sample: ['', ''] },
            { key: 'partnerCompany', label: 'Partner Company', required: false, aliases: ['partner', 'partner company', 'partner name'], sample: ['', 'ACME PARTNERS PVT LTD'] },
            // Blank samples: a response needs a follow-up time, Commission Yes an amount and Add Document Yes a file.
            { key: 'customerResponse', label: 'Customer Response', required: false, aliases: ['response'], sample: ['', ''] },
            { key: 'commission', label: 'Commission', required: false, aliases: [], sample: ['No', 'No'] },
            { key: 'addDocument', label: 'Add Document', required: false, aliases: [], sample: ['No', 'No'] },
            { key: 'leadGivenBy', label: 'Lead Given By', required: false, aliases: ['given by', 'referred by'], sample: ['Direct', 'Partner Network'] },
            { key: 'remarks', label: 'Remarks', required: false, aliases: ['notes', 'follow up remarks', 'requirement', 'add description'], sample: ['Requirement for 5 TallyPrime Silver licenses', 'Annual cloud renewal discussion'] },
        ],
    },
    tickets: {
        entity: 'tickets',
        singular: 'Ticket',
        plural: 'Tickets',
        fields: [
            { key: 'organizationName', label: 'Organization Name', required: true, aliases: ['organization', 'company', 'company name', 'account'], sample: ['Acme Traders Pvt Ltd', 'Bright Tech Solutions'] },
            { key: 'contact', label: 'Contact', required: true, aliases: ['contact', 'contact name', 'contact person', 'name'], sample: ['Rahul Sharma', 'Priya Verma'] },
            { key: 'contactNumber', label: 'Contact Number', required: false, aliases: ['mobile', 'phone', 'contact phone', 'telephone'], sample: ['9876543210', '9123456780'] },
            { key: 'contactEmail', label: 'Contact Email', required: false, aliases: ['email', 'email address'], sample: ['rahul@example.com', 'priya@example.com'] },
            // Matched against the Nature Of Call master; a blank or unknown value falls back to the first active entry.
            { key: 'natureOfCall', label: 'Nature Of Call', required: false, aliases: ['nature', 'issue type', 'call nature', 'category'], sample: ['Excel Import Issue', 'Banking Related Issue'] },
            { key: 'ticketSubject', label: 'Ticket Subject', required: false, aliases: ['subject', 'title', 'summary'], sample: ['Tally data error on startup', 'Single user license reactivation'] },
            { key: 'problemReported', label: 'Problem Reported', required: true, aliases: ['problem', 'issue', 'description', 'reported problem'], sample: ['Error while opening company data after power cut', 'Need license reactivation on new system'] },
            { key: 'ticketPriority', label: 'Priority', required: false, aliases: ['ticket priority', 'urgency'], sample: ['High', 'Normal'] },
            { key: 'ticketStatus', label: 'Status', required: false, aliases: ['ticket status', 'stage'], sample: ['New', 'Assigned'] },
            { key: 'supportType', label: 'Support Type', required: false, aliases: ['type'], sample: ['AMC', 'Free'] },
            { key: 'supportMode', label: 'Support Mode', required: false, aliases: ['mode'], sample: ['Remote Support (AnyDesk/TeamViewer)', 'Phone Consultation'] },
        ],
    },
    'partner-companies': {
        entity: 'partner-companies',
        singular: 'Partner Company',
        plural: 'Partner Companies',
        fields: [
            { key: 'partnerName', label: 'Partner Name', required: true, aliases: ['partner name', 'name', 'company', 'organization', 'partner company'], sample: ['Apex Tally Solutions', 'Synergy Softwares'] },
            { key: 'natureOfPartner', label: 'Nature of Partner', required: false, aliases: ['nature', 'partner type', 'type'], sample: ['TALLY-3STAR PARTNER', 'TALLY-REFERRAL PARTNER'] },
            { key: 'officePhone', label: 'Office Phone', required: false, aliases: ['phone', 'mobile', 'contact number', 'telephone'], sample: ['9876543210', '9123456780'] },
            { key: 'emailAddress', label: 'Email Address', required: true, aliases: ['email address', 'e-mail', 'mail'], sample: ['info@apextally.com', 'contact@synergysoft.in'] },
            { key: 'billingAddress', label: 'Billing Street', required: false, aliases: ['street', 'address', 'billing address', 'billing street'], sample: ['12 Nehru Place', '45 MG Road'] },
            { key: 'billingCity', label: 'Billing City', required: false, aliases: ['city'], sample: ['New Delhi', 'Mumbai'] },
            { key: 'billingState', label: 'Billing State', required: false, aliases: ['state'], sample: ['Delhi', 'Maharashtra'] },
            { key: 'billingPostalCode', label: 'Billing PIN Code', required: false, aliases: ['pin', 'pincode', 'postal code', 'zip'], sample: ['110019', '400001'] },
            { key: 'gstNumber', label: 'GST Number', required: false, aliases: ['gst', 'gstin', 'gst no'], sample: ['07ABCDE1234F1Z5', '27ABCDE1234F1Z5'] },
            { key: 'principalCompany', label: 'Principal Company', required: false, aliases: ['principal'], sample: ['Tally Solutions Pvt Ltd', 'Tally Solutions Pvt Ltd'] },
        ],
    },
};

const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-./]+/g, ' ').trim();

/** Pre-selects a file header for each entity field using exact label/key matches, then aliases. */
export function autoMapColumns(config: ImportEntityConfig, headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};
    const used = new Set<string>();
    const normHeaders = headers.map((h) => ({ header: h, norm: normalize(h) }));
    const fields = config.fields;

    const claim = (fieldKey: string, candidates: string[]) => {
        const hit = normHeaders.find((h) => !used.has(h.header) && candidates.includes(h.norm));
        if (hit) {
            mapping[fieldKey] = hit.header;
            used.add(hit.header);
        }
    };

    fields.forEach((f) => {
        mapping[f.key] = '';
    });
    // Exact label/key matches take priority over aliases so e.g. "Name" never steals "Organization Name".
    fields.forEach((f) => claim(f.key, [normalize(f.label), normalize(f.key)]));
    fields.forEach((f) => {
        if (!mapping[f.key]) claim(f.key, f.aliases.map(normalize));
    });
    return mapping;
}

/**
 * Applies the column mapping, then reads and checks every cell as the creation form would (required fields,
 * dropdown options, dates, phones, emails, numbers) plus the row's conditional rules. Values come back normalized
 * (dropdowns as their stored value, dates as `YYYY-MM-DD`), ready to send.
 */
export function mapAndValidateRows(config: ImportEntityConfig, parsed: ParsedFile, mapping: ColumnMapping): MappedRow[] {
    return parsed.rows.map((raw, idx) => {
        const values: Record<string, string> = {};
        const errors: string[] = [];
        const cellErrors: Record<string, string> = {};
        config.fields.forEach((f) => {
            const header = mapping[f.key];
            const cell = header ? (raw[header] ?? '').trim() : '';
            if (!cell) {
                values[f.key] = '';
                if (f.required) {
                    const error = header ? `${f.label} is required` : `${f.label} is required: map a column to it`;
                    errors.push(error);
                    cellErrors[f.key] = error;
                }
                return;
            }
            const read = normalizeImportCell(f, cell);
            values[f.key] = read.value;
            if (read.error) {
                errors.push(read.error);
                cellErrors[f.key] = read.error;
            }
        });
        errors.push(...(config.rowRules?.(values) ?? []));
        return { rowNumber: idx + 2, values, errors, cellErrors };
    });
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Downloads a CSV with every importable field's header label and two illustrative rows. */
export function downloadSampleTemplate(config: ImportEntityConfig): void {
    const { fields, plural } = config;
    const lines = [
        fields.map((f) => csvCell(f.label)).join(','),
        fields.map((f) => csvCell(f.sample[0])).join(','),
        fields.map((f) => csvCell(f.sample[1])).join(','),
    ];
    // A BOM so Excel opens the UTF-8 file (₹, accented names) correctly.
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${plural.toLowerCase().replace(/\s+/g, '_')}_import_template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
