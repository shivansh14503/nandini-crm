import type { CorporateEmail } from './organization.types';

export interface ContactFormData {
    /** Admin-defined custom field values, keyed by FormFieldDefinition.fieldKey (cf_…). */
    customFields?: Record<string, unknown>;

    name: string;
    organizationName: string;
    organizationId?: string;
    mobile: string;
    officePhone: string;
    phone3: string;
    phone4: string;
    phone5: string;
    emailAddresses: CorporateEmail[];
    assignedTo: string;
    isPrimaryContact: boolean;
    designation: string;
    department: string;
    leftJob: 'No' | 'Yes';
    communicationType: string[]; // ['Call', 'Email', 'Meeting', 'WhatsApp']
    doNotCall: boolean;
    description: string;
}

export interface Contact extends ContactFormData {
    id: string;
    contactCode: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy?: string;
}

export const CONTACT_DESIGNATIONS: string[] = [
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
];

export const CONTACT_DEPARTMENTS: string[] = [
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
];

export const COMMUNICATION_TYPES: string[] = [
    'Call',
    'Email',
    'Meeting',
    'WhatsApp',
];
