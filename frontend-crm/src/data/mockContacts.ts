import type { Contact, ContactFormData } from '../types/contact.types';

const CONTACTS_STORAGE_KEY = 'nandini_crm_contacts_data_v1';

export const INITIAL_MOCK_CONTACTS: Contact[] = [
    {
        id: 'con-1',
        contactCode: 'CON-1001',
        name: 'Rajesh Sharma',
        organizationName: 'Tata Consultancy Services',
        mobile: '9811234567',
        officePhone: '0114567890',
        phone3: '',
        phone4: '',
        phone5: '',
        emailAddresses: [
            {
                id: 'em-1',
                email: 'rajesh.sharma@tcs.com',
                isPrimary: true,
                isOptedOut: false,
                isInvalidBounce: false,
            },
        ],
        assignedTo: 'mittal.sharma',
        isPrimaryContact: true,
        designation: 'Managing Director / MD',
        department: 'Executive Management',
        leftJob: 'No',
        communicationType: ['Call', 'Email'],
        doNotCall: false,
        description: 'Key decision maker for enterprise cloud migration contracts.',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'mittal.sharma',
    },
    {
        id: 'con-2',
        contactCode: 'CON-1002',
        name: 'Ananya Deshmukh',
        organizationName: 'Infosys Limited',
        mobile: '9723456789',
        officePhone: '0802852026',
        phone3: '',
        phone4: '',
        phone5: '',
        emailAddresses: [
            {
                id: 'em-2',
                email: 'ananya.d@infosys.com',
                isPrimary: true,
                isOptedOut: false,
                isInvalidBounce: false,
            },
        ],
        assignedTo: 'mittal.sharma',
        isPrimaryContact: false,
        designation: 'Purchase Head / Manager',
        department: 'Procurement & Purchase',
        leftJob: 'No',
        communicationType: ['Email', 'WhatsApp'],
        doNotCall: false,
        description: 'Handles software licensing procurement.',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'mittal.sharma',
    },
    {
        id: 'con-3',
        contactCode: 'CON-1003',
        name: 'Vikram Mehta',
        organizationName: 'Reliance Industries Ltd',
        mobile: '9988776655',
        officePhone: '0223555500',
        phone3: '',
        phone4: '',
        phone5: '',
        emailAddresses: [
            {
                id: 'em-3',
                email: 'vikram.mehta@ril.com',
                isPrimary: true,
                isOptedOut: false,
                isInvalidBounce: false,
            },
        ],
        assignedTo: 'rahul.verma',
        isPrimaryContact: true,
        designation: 'Chief Technology Officer (CTO)',
        department: 'Information Technology (IT)',
        leftJob: 'No',
        communicationType: ['Call', 'Meeting'],
        doNotCall: false,
        description: 'Digital transformation committee head.',
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'rahul.verma',
    },
];

export function getStoredContacts(): Contact[] {
    if (typeof window === 'undefined') return INITIAL_MOCK_CONTACTS;
    try {
        const raw = localStorage.getItem(CONTACTS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.map((contact: Contact) => ({
                    ...contact,
                    mobile: contact.mobile ? contact.mobile.replace(/\D/g, '').slice(-10) : contact.mobile,
                    officePhone: contact.officePhone ? contact.officePhone.replace(/\D/g, '').slice(-10) : contact.officePhone,
                    phone3: contact.phone3 ? contact.phone3.replace(/\D/g, '').slice(-10) : contact.phone3,
                    phone4: contact.phone4 ? contact.phone4.replace(/\D/g, '').slice(-10) : contact.phone4,
                    phone5: contact.phone5 ? contact.phone5.replace(/\D/g, '').slice(-10) : contact.phone5,
                }));
            }
        }
        localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(INITIAL_MOCK_CONTACTS));
        return INITIAL_MOCK_CONTACTS;
    } catch {
        return INITIAL_MOCK_CONTACTS;
    }
}

export function saveStoredContacts(contacts: Contact[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
    } catch (e) {
        console.error('Failed to save contacts to localStorage', e);
    }
}

export function getStoredContactById(id: string): Contact | undefined {
    const list = getStoredContacts();
    return list.find((contact) => contact.id === id);
}

export function addStoredContact(data: ContactFormData): Contact {
    const list = getStoredContacts();
    const now = new Date().toISOString();
    const newContact: Contact = {
        ...data,
        id: `contact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        contactCode: `CON-${Math.floor(1000 + Math.random() * 9000)}`,
        createdAt: now,
        updatedAt: now,
        createdBy: data.assignedTo || 'mittal.sharma',
    };
    const updatedList = [newContact, ...list];
    saveStoredContacts(updatedList);
    return newContact;
}

export function updateStoredContact(id: string, updates: Partial<ContactFormData>): Contact | null {
    const list = getStoredContacts();
    const idx = list.findIndex((contact) => contact.id === id);
    if (idx === -1) return null;
    const updated: Contact = {
        ...list[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    saveStoredContacts(list);
    return updated;
}

export function deleteStoredContact(id: string): boolean {
    const list = getStoredContacts();
    const filtered = list.filter((contact) => contact.id !== id);
    if (filtered.length !== list.length) {
        saveStoredContacts(filtered);
        return true;
    }
    return false;
}

export function deleteMultipleStoredContacts(ids: string[]): boolean {
    const idSet = new Set(ids);
    const list = getStoredContacts();
    const filtered = list.filter((contact) => !idSet.has(contact.id));
    saveStoredContacts(filtered);
    return true;
}
