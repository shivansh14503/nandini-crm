import type { ColumnMapping, ImportEntityConfig, ImportEntityType, MappedRow, ParsedFile } from './types';
import { normalizeImportCell } from './importFields';
import { ACTIVITY_RELATED_MODULE_LABELS, ACTIVITY_RELATED_MODULES } from '@/types/activity.types';

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
            { key: 'productCategory', label: 'Product Category', required: false, aliases: ['category', 'product category', 'group'], sample: ['TallyPrime', 'Tally AMC'] },
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
    // One row = one quotation for an opportunity with one line item (backend imports/builders/quotations.ts). The line
    // item columns are import-only: Product / Quantity / Rate / Discount / GST, labelled as on the Line Items editor.
    quotations: {
        entity: 'quotations',
        singular: 'Quotation',
        plural: 'Quotations',
        fields: [
            // Its number (OPP-0042 or the Document Series format), or its exact name.
            { key: 'opportunity', label: 'Opportunity', required: true, aliases: ['opportunity name', 'opportunity number', 'opportunity no', 'opportunity code', 'deal', 'deal name'], sample: ['OPP-0001', 'Annual cloud renewal'] },
            { key: 'quotationTitle', label: 'Quotation Title', required: false, aliases: ['title', 'quote title', 'subject', 'quotation subject'], sample: ['TallyPrime Silver licences', ''] },
            { key: 'company', label: 'Company', required: false, aliases: ['issuing company'], sample: ['Nandini Infosystems', ''] },
            { key: 'quotationDate', label: 'Quotation Date', required: false, aliases: ['quote date', 'date'], sample: ['28-11-2026', ''] },
            { key: 'validationPeriod', label: 'Validation Period', required: false, aliases: ['validity', 'validity period'], sample: ['30 Days', '15 Days'] },
            { key: 'validUntil', label: 'Valid Until', required: false, aliases: ['valid till', 'expiry date', 'valid until date'], sample: ['', ''] },
            { key: 'quoteStage', label: 'Quote Stage', required: false, aliases: ['stage', 'status', 'quotation stage'], sample: ['Draft', 'Negotiation'] },
            { key: 'preparedFor', label: 'Prepared For', required: false, aliases: [], sample: ['Customer', ''] },
            { key: 'otherRef', label: 'Other Ref.', required: false, aliases: ['other ref', 'reference', 'po number', 'ref'], sample: ['PO-4512', ''] },
            { key: 'remarks', label: 'Remarks', required: false, aliases: ['notes', 'comments'], sample: ['Price valid for 5 users', ''] },
            { key: 'organizationName', label: 'Organization Name', required: false, aliases: ['organization', 'company name', 'account', 'customer'], sample: ['', ''] },
            { key: 'contact', label: 'Contact', required: false, aliases: ['contact name', 'contact person'], sample: ['', ''] },
            { key: 'lineProduct', label: 'Product', required: false, importOnly: true, aliases: ['product name', 'item', 'item name', 'product code'], sample: ['TallyPrime Silver', 'Cloud hosting'], section: 'Line Item', hint: 'Product code or Product Catalog name (any other name is a typed product) · Blank → the opportunity\'s line items' },
            { key: 'lineQuantity', label: 'Quantity', required: false, importOnly: true, fieldType: 'number', aliases: ['qty', 'units'], sample: ['5', '1'], section: 'Line Item', hint: 'Blank → 1' },
            { key: 'lineRate', label: 'Rate', required: false, importOnly: true, fieldType: 'amount', aliases: ['unit price', 'price', 'mrp', 'rate per unit'], sample: ['', '12000'], section: 'Line Item', hint: 'A catalog product with an MRP always uses its MRP · needed for a typed product or one without an MRP' },
            { key: 'lineDiscount', label: 'Discount', required: false, importOnly: true, aliases: ['discount %', 'line discount'], sample: ['10%', ''], section: 'Line Item', hint: '10% or a number (its type below) · Blank → none' },
            { key: 'lineDiscountType', label: 'Discount Type', required: false, importOnly: true, fieldType: 'select', options: [{ value: 'percentage', label: 'Percentage' }, { value: 'amount', label: 'Amount' }], aliases: [], sample: ['', ''], section: 'Line Item', hint: 'Percentage or Amount · Blank → Percentage' },
            { key: 'lineTaxRate', label: 'GST', required: false, importOnly: true, fieldType: 'percentage', aliases: ['tax rate', 'gst rate', 'gst %', 'tax'], sample: ['', '18'], section: 'Line Item', hint: 'e.g. 18 · A catalog product with a Tax Rate always uses it · needed for a typed product' },
            { key: 'lineDescription', label: 'Description', required: false, importOnly: true, aliases: ['line description', 'item description'], sample: ['', 'Monthly hosting, 2 users'], section: 'Line Item', hint: 'Blank → the product\'s description' },
            { key: 'lineNote', label: 'Note', required: false, importOnly: true, aliases: ['line note', 'item note'], sample: ['', ''], section: 'Line Item' },
        ],
    },
    // One row = one contract (backend imports/builders/contracts.ts). Organization, contact and opportunity are named by
    // their human value and linked to the live records; an Opportunity brings its organization and contact.
    contracts: {
        entity: 'contracts',
        singular: 'Contract',
        plural: 'Contracts',
        fields: [
            { key: 'contractTitle', label: 'Contract Title', required: true, aliases: ['title', 'contract', 'contract name'], sample: ['AMC', 'TSS Renewal'] },
            { key: 'status', label: 'Status', required: false, aliases: ['contract status', 'stage'], sample: ['Active', 'Not Started'] },
            { key: 'contractValue', label: 'Contract Value', required: false, aliases: ['value', 'amount', 'contract amount'], sample: ['45000', '18000'] },
            { key: 'assignedTo', label: 'Contract Manager', required: false, aliases: ['manager', 'owner', 'assigned to', 'account manager'], sample: ['', ''] },
            { key: 'organizationName', label: 'Organization Name', required: false, aliases: ['organization', 'company', 'company name', 'account', 'customer'], sample: ['Acme Traders Pvt Ltd', ''] },
            { key: 'contact', label: 'Contact Person', required: false, aliases: ['contact', 'contact name'], sample: ['Rahul Sharma', ''] },
            // Its number (OPP-0042 or the Document Series format), or its exact name.
            { key: 'opportunity', label: 'Opportunity', required: false, aliases: ['opportunity name', 'opportunity number', 'opportunity no', 'opportunity code', 'deal'], sample: ['', 'OPP-0001'] },
            { key: 'tallySerialNo', label: 'Tally Serial Number', required: false, aliases: ['tally serial', 'serial number', 'serial no', 'tally serial no'], sample: ['712345678', ''] },
            { key: 'startDate', label: 'Contract Start Date', required: false, aliases: ['start date', 'start', 'from'], sample: ['01-04-2026', ''] },
            { key: 'endDate', label: 'Contract End Date', required: false, aliases: ['end date', 'end', 'to', 'expiry date'], sample: ['31-03-2027', ''] },
            { key: 'contractPeriod', label: 'Contract Period', required: false, aliases: ['period', 'term', 'duration'], sample: ['1 Year', '6 Months'] },
            { key: 'renewalReminderDate', label: 'Renewal Reminder Date', required: false, aliases: ['renewal reminder', 'reminder date', 'renewal date'], sample: ['', ''] },
            { key: 'contractType', label: 'Contract Type', required: false, aliases: ['type', 'contract types'], sample: ['', ''] },
            { key: 'billNumber', label: 'Bill Number', required: false, aliases: ['bill no', 'invoice number', 'invoice no'], sample: ['INV-2026-041', ''] },
            { key: 'billDate', label: 'Bill Date', required: false, aliases: ['invoice date'], sample: ['01-04-2026', ''] },
            { key: 'billAmount', label: 'Bill Amount', required: false, aliases: ['invoice amount'], sample: ['53100', ''] },
            { key: 'description', label: 'Description', required: false, aliases: ['notes', 'remarks', 'details'], sample: ['Annual maintenance for 5 users', ''] },
        ],
    },
    // One row = one referral (backend imports/builders/referrals.ts). A referral links to no other record: Company Name
    // is free text. A Mobile already used by a live referral fails the row.
    referrals: {
        entity: 'referrals',
        singular: 'Referral',
        plural: 'Referrals',
        fields: [
            { key: 'name', label: 'Name', required: true, aliases: ['full name', 'referral name', 'referrer', 'referrer name', 'contact name'], sample: ['Rajesh Kumar', 'Sunita Khanna'] },
            { key: 'mobile', label: 'Mobile', required: true, aliases: ['phone', 'mobile no', 'mobile_no', 'mobile number', 'telephone', 'cell', 'contact number'], sample: ['9876543210', '9123456780'] },
            { key: 'officePhone', label: 'Office Phone', required: false, aliases: ['office', 'landline', 'work phone'], sample: ['01123456789', ''] },
            { key: 'companyName', label: 'Company Name', required: false, aliases: ['company', 'firm', 'firm name', 'organization', 'organization name'], sample: ['KUMAR & CO', 'KHANNA & ASSOCIATES'] },
            { key: 'status', label: 'Status', required: false, aliases: ['referral status'], sample: ['Active', 'Active'] },
            { key: 'emailAddress', label: 'Email Address', required: false, aliases: ['email', 'e-mail', 'mail', 'email id'], sample: ['rajesh@kumarco.in', 'sunita@khanna.in'] },
            { key: 'designation', label: 'Designation', required: false, aliases: ['title', 'job title', 'role', 'position'], sample: ['Director / Partner', 'Proprietor / Owner'] },
            { key: 'department', label: 'Department', required: false, aliases: ['dept'], sample: ['Executive Management', 'Finance & Accounts'] },
            { key: 'assignedTo', label: 'Assigned to', required: false, aliases: ['assigned to', 'owner', 'representative', 'assigned representative'], sample: ['', ''] },
        ],
    },
    // One row = one activity (backend imports/builders/activities.ts). Related To names a record by its number or exact
    // name, with its type in the import-only Related To Type column (blank when the number tells it: OPP-0042). Video
    // meeting, Attendees and recurrence are not imported.
    activities: {
        entity: 'activities',
        singular: 'Activity',
        plural: 'Activities',
        fields: [
            { key: 'followupType', label: 'Followup Type', required: false, aliases: ['type', 'activity type', 'follow up type', 'followup'], sample: ['Meeting', 'Call'] },
            { key: 'subject', label: 'Subject', required: true, aliases: ['title', 'activity', 'activity subject', 'name'], sample: ['Product demo', 'Renewal reminder call'] },
            { key: 'status', label: 'Status', required: false, aliases: ['activity status', 'state'], sample: ['Planned', 'Completed'] },
            { key: 'assignedTo', label: 'Assigned to', required: false, aliases: ['owner', 'assigned', 'user', 'activity owner'], sample: ['', ''] },
            // Its number (OPP-0042 or the Document Series format), or its exact name.
            { key: 'relatedTo', label: 'Related To', required: false, aliases: ['related record', 'record', 'regarding', 'related to record'], sample: ['OPP-0001', 'Acme Traders Pvt Ltd'] },
            { key: 'organizationName', label: 'Organization Name', required: false, aliases: ['organization', 'company', 'company name', 'account', 'customer'], sample: ['', 'Acme Traders Pvt Ltd'] },
            { key: 'contact', label: 'Contact', required: false, aliases: ['contact name', 'contact person'], sample: ['', 'Rahul Sharma'] },
            { key: 'startAt', label: 'Start', required: false, aliases: ['start date', 'start time', 'date', 'from', 'scheduled at', 'start date time'], sample: ['05-12-2026 10:30', '20-11-2026 15:00'] },
            { key: 'endAt', label: 'End', required: false, aliases: ['end date', 'end time', 'to', 'end date time'], sample: ['05-12-2026 11:30', ''] },
            { key: 'allDay', label: 'All Day', required: false, aliases: ['all day event', 'full day'], sample: ['No', 'No'] },
            { key: 'reminder', label: 'Reminder', required: false, aliases: ['remind', 'alert'], sample: ['15 minutes before', ''] },
            { key: 'location', label: 'Location', required: false, aliases: ['venue', 'place', 'address'], sample: ['Client office, Andheri', ''] },
            { key: 'customerResponse', label: 'Customer Response', required: false, aliases: ['response', 'outcome'], sample: ['', ''] },
            { key: 'remarks', label: 'Remarks', required: false, aliases: ['notes', 'description', 'comments', 'details'], sample: ['Demo for 5 users', 'Customer asked for the renewal quote'] },
            {
                key: 'relatedModule',
                label: 'Related To Type',
                required: false,
                importOnly: true,
                fieldType: 'select',
                options: ACTIVITY_RELATED_MODULES.map((value) => ({ value, label: ACTIVITY_RELATED_MODULE_LABELS[value] })),
                aliases: ['related type', 'related module', 'record type', 'related to module'],
                sample: ['Opportunity', 'Organization'],
                section: 'Activity Details',
                hint: `One of: ${ACTIVITY_RELATED_MODULES.map((m) => ACTIVITY_RELATED_MODULE_LABELS[m]).join(', ')} · Blank when Related To is a record number (OPP-0042)`,
            },
            {
                key: 'durationMinutes',
                label: 'Duration (minutes)',
                required: false,
                importOnly: true,
                fieldType: 'number',
                aliases: ['duration', 'duration mins', 'length', 'minutes'],
                sample: ['', '20'],
                section: 'Schedule',
                hint: "Used when End is blank (not on Tasks) · Blank → the Followup Type's default length",
            },
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
