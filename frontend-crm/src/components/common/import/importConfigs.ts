import type { ColumnMapping, ImportEntityConfig, ImportEntityType, MappedRow, ParsedFile } from './types';

export const IMPORT_CONFIGS: Record<ImportEntityType, ImportEntityConfig> = {
    organizations: {
        entity: 'organizations',
        singular: 'Organization',
        plural: 'Organizations',
        fields: [
            { key: 'organizationName', label: 'Organization Name', required: true, aliases: ['name', 'organization', 'company', 'company name', 'account name', 'org name'], sample: ['Acme Traders Pvt Ltd', 'Bright Tech Solutions'] },
            { key: 'natureOfBusiness', label: 'Nature of Business', required: false, aliases: ['industry', 'business', 'nature'], sample: ['Distributor / Trading / Wholesale', 'IT / Software'] },
            { key: 'customerType', label: 'Customer Type', required: false, aliases: ['type', 'customer'], sample: ['End User', 'Distributor'] },
            { key: 'accountStatus', label: 'Status', required: false, aliases: ['status', 'account status'], sample: ['Active', 'Active'] },
            { key: 'billingStreet', label: 'Billing Street', required: false, aliases: ['street', 'address', 'billing address'], sample: ['12 MG Road', '45 Park Street'] },
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
            { key: 'email', label: 'Email', required: false, aliases: ['email address', 'e-mail', 'mail', 'email id'], sample: ['rahul@example.com', 'priya@example.com'] },
            { key: 'organizationName', label: 'Organization', required: false, aliases: ['organization', 'company', 'company name', 'account'], sample: ['Acme Traders Pvt Ltd', 'Bright Tech Solutions'] },
            { key: 'designation', label: 'Designation', required: false, aliases: ['title', 'job title', 'role', 'position'], sample: ['Purchase Head / Manager', 'Director / Partner'] },
            { key: 'department', label: 'Department', required: false, aliases: ['dept'], sample: ['Purchase', 'Management'] },
            { key: 'officePhone', label: 'Office Phone', required: false, aliases: ['office', 'landline', 'work phone'], sample: ['02212345678', ''] },
            { key: 'description', label: 'Description', required: false, aliases: ['notes', 'remarks', 'comments'], sample: ['Key decision maker', ''] },
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
            { key: 'email', label: 'Email', required: false, aliases: ['email address', 'e-mail', 'mail', 'email id'], sample: ['amit@example.com', 'neha@example.com'] },
            { key: 'organizationName', label: 'Organization', required: false, aliases: ['organization', 'company', 'company name'], sample: ['Patel Enterprises', 'Gupta & Co'] },
            { key: 'leadSource', label: 'Lead Source', required: false, aliases: ['source'], sample: ['Website', 'Referral'] },
            { key: 'leadType', label: 'Lead Type', required: false, aliases: ['type'], sample: ['Hot', 'Warm'] },
            { key: 'status', label: 'Status', required: false, aliases: ['lead status', 'stage'], sample: ['New', 'Contacted'] },
            { key: 'primaryCity', label: 'City', required: false, aliases: ['city'], sample: ['Pune', 'Delhi'] },
            { key: 'primaryState', label: 'State', required: false, aliases: ['state'], sample: ['Maharashtra', 'Delhi'] },
            { key: 'addDescription', label: 'Description', required: false, aliases: ['notes', 'remarks', 'description'], sample: ['Interested in TallyPrime', ''] },
        ],
    },
};

const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-./]+/g, ' ').trim();

/** Pre-selects a file header for each entity field using exact label/key matches, then aliases. */
export function autoMapColumns(entity: ImportEntityType, headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};
    const used = new Set<string>();
    const normHeaders = headers.map((h) => ({ header: h, norm: normalize(h) }));
    const fields = IMPORT_CONFIGS[entity].fields;

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Applies the column mapping and validates required fields / email format. */
export function mapAndValidateRows(entity: ImportEntityType, parsed: ParsedFile, mapping: ColumnMapping): MappedRow[] {
    const fields = IMPORT_CONFIGS[entity].fields;
    return parsed.rows.map((raw, idx) => {
        const values: Record<string, string> = {};
        const errors: string[] = [];
        fields.forEach((f) => {
            const header = mapping[f.key];
            values[f.key] = header ? (raw[header] ?? '').trim() : '';
            if (f.required && !values[f.key]) errors.push(`${f.label} is required`);
        });
        if (values.email && !EMAIL_RE.test(values.email)) errors.push('Invalid email');
        return { rowNumber: idx + 2, values, errors };
    });
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Downloads a CSV with the exact header labels and two illustrative rows. */
export function downloadSampleTemplate(entity: ImportEntityType): void {
    const { fields, plural } = IMPORT_CONFIGS[entity];
    const lines = [
        fields.map((f) => csvCell(f.label)).join(','),
        fields.map((f) => csvCell(f.sample[0])).join(','),
        fields.map((f) => csvCell(f.sample[1])).join(','),
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${plural.toLowerCase()}_import_template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
