import type { Lead, LeadFormData } from '../types/lead.types';

export const INITIAL_MOCK_LEADS: Lead[] = [
    {
        id: 'lea-1001',
        leadCode: 'LEA-1001',
        name: 'Vikram Malhotra',
        organizationName: 'Apex Industrial Solutions Pvt Ltd',
        mailingName: 'Apex Industrial Solutions Pvt Ltd',
        mobile: '9811245890',
        otherPhone: '0114560129',
        emailAddresses: [
            {
                id: 'eml-101',
                email: 'vikram.m@apexindustries.in',
                isPrimary: true,
                isOptedOut: false,
                isInvalidBounce: false,
            },
            {
                id: 'eml-102',
                email: 'purchase@apexindustries.in',
                isPrimary: false,
                isOptedOut: false,
                isInvalidBounce: false,
            },
        ],
        designation: 'Managing Director / MD',
        department: 'Executive Management',
        leadSource: 'Website Enquiry',
        leadType: 'Hot',
        productCategory: ['Biz Analyst', 'TallyPrime', 'CredFlow'],
        status: 'In Discussion',
        followupType: 'Demo / Presentation',
        nextFollowupDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
        nextFollowupTime: '11:30 AM',
        addDescription: 'Customer urgently requested an online live demonstration of Biz Analyst mobile dashboard and automated CredFlow payment reminders linked to multi-user TallyPrime.',
        description: 'Large manufacturing unit based in Manesar Industrial Area looking to migrate 45 branch accounting records onto centralized cloud-synced Tally.',
        registrationType: 'Registered',
        turnover: '₹25 Cr – ₹100 Cr',
        noOfEmployee: '51 – 200 Staff Members',
        assignedTo: 'mittal.sharma',
        referredBy: 'Sunil Mehta (Tally Partner)',
        primaryAddress: 'Plot 48, Sector 8, IMT Manesar',
        primaryCity: 'Gurugram',
        primaryState: 'Haryana',
        primaryPostalCode: '122051',
        primaryCountry: 'India',
        primaryLatitude: '28.35620000',
        otherAddress: 'Head Office: Suite 302, Barakhamba Road',
        otherCity: 'New Delhi',
        otherState: 'Delhi',
        otherPostalCode: '110001',
        otherCountry: 'India',
        copyAddressFromLeft: false,
        otherLongitude: '77.22810000',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        createdBy: 'mittal.sharma',
    },
    {
        id: 'lea-1002',
        leadCode: 'LEA-1002',
        name: 'Pooja Agarwal',
        organizationName: 'Sterling Logistics & Cold Chain',
        mailingName: 'Sterling Logistics & Cold Chain LLP',
        mobile: '9820512344',
        otherPhone: '0222789450',
        emailAddresses: [
            {
                id: 'eml-201',
                email: 'pooja.agarwal@sterlinglogistics.com',
                isPrimary: true,
                isOptedOut: false,
                isInvalidBounce: false,
            },
        ],
        designation: 'IT Manager / Systems Head',
        department: 'Information Technology (IT)',
        leadSource: 'Exhibition / Trade Show',
        leadType: 'Hot',
        productCategory: ['Acronis', 'Cloud Backup Solutions'],
        status: 'Proposal Sent',
        followupType: 'Call',
        nextFollowupDate: new Date().toISOString().split('T')[0], // Today
        nextFollowupTime: '03:00 PM',
        addDescription: 'Commercial proposal sent for 35 TB Acronis Cyber Protect Cloud with immutable ransomware backup for warehousing ERP.',
        description: 'Met at India Warehousing Show Pragati Maidan. High probability deal with end-of-month procurement cycle.',
        registrationType: 'Registered',
        turnover: 'Above ₹100 Cr',
        noOfEmployee: '201 – 500 Staff Members',
        assignedTo: 'mittal.sharma',
        referredBy: 'Trade Show Desk #14',
        primaryAddress: 'Sterling House, Vashi Infotech Park, Sector 30A',
        primaryCity: 'Navi Mumbai',
        primaryState: 'Maharashtra',
        primaryPostalCode: '400705',
        primaryCountry: 'India',
        primaryLatitude: '19.07180000',
        otherAddress: 'Sterling House, Vashi Infotech Park, Sector 30A',
        otherCity: 'Navi Mumbai',
        otherState: 'Maharashtra',
        otherPostalCode: '400705',
        otherCountry: 'India',
        copyAddressFromLeft: true,
        otherLongitude: '72.99820000',
        createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
        updatedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
        createdBy: 'mittal.sharma',
    },
    {
        id: 'lea-1003',
        leadCode: 'LEA-1003',
        name: 'Harish Chandra',
        organizationName: 'Chandra Automotives & Spares',
        mailingName: 'M/s Chandra Automotives & Spares',
        mobile: '9414088219',
        otherPhone: '0141236541',
        emailAddresses: [
            {
                id: 'eml-301',
                email: 'h.chandra@chandraauto.com',
                isPrimary: true,
                isOptedOut: false,
                isInvalidBounce: false,
            },
        ],
        designation: 'Proprietor / Owner',
        department: 'Executive Management',
        leadSource: 'Client Referral',
        leadType: 'Warm',
        productCategory: ['Connect 2T', 'TallyPrime'],
        status: 'Demo Scheduled',
        followupType: 'Demo / Presentation',
        nextFollowupDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
        nextFollowupTime: '04:30 PM',
        addDescription: 'Scheduled Connect 2T barcode scanning & e-invoicing workflow demonstration for spare parts wholesale inventory.',
        description: 'Referred by Girdhar Buildtech. Wants to integrate mobile barcoding scanner with existing TallyPrime Gold release 4.1.',
        registrationType: 'Registered',
        turnover: '₹5 Cr – ₹25 Cr',
        noOfEmployee: '11 – 50 Staff Members',
        assignedTo: 'bhanu.pratap',
        referredBy: 'Girdhar Buildtech',
        primaryAddress: 'Shop 12-14, Motor Market, Transport Nagar',
        primaryCity: 'Jaipur',
        primaryState: 'Rajasthan',
        primaryPostalCode: '302003',
        primaryCountry: 'India',
        primaryLatitude: '26.90240000',
        otherAddress: '',
        otherCity: '',
        otherState: '',
        otherPostalCode: '',
        otherCountry: 'India',
        copyAddressFromLeft: false,
        otherLongitude: '0.00000000',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
        createdBy: 'bhanu.pratap',
    },
    {
        id: 'lea-1004',
        leadCode: 'LEA-1004',
        name: 'Kavita Sundaram',
        organizationName: 'Velocis Health Tech',
        mailingName: 'Velocis Health Tech Solutions Private Limited',
        mobile: '9741190812',
        otherPhone: '0804122889',
        emailAddresses: [
            {
                id: 'eml-401',
                email: 'kavita.s@velocishealth.io',
                isPrimary: true,
                isOptedOut: false,
                isInvalidBounce: false,
            },
        ],
        designation: 'Chief Financial Officer (CFO)',
        department: 'Finance & Accounts',
        leadSource: 'LinkedIn / Social Media',
        leadType: 'Warm',
        productCategory: ['CredFlow', 'B-Softwares'],
        status: 'Contacted',
        followupType: 'Call',
        nextFollowupDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
        nextFollowupTime: '02:00 PM',
        addDescription: 'Initial discovery call completed regarding receivables aging automation with CredFlow and customized B-Softwares MIS connector.',
        description: 'Startup scaling rapidly across 5 metro cities. CFO requires real-time aging reports with WhatsApp payment reminders.',
        registrationType: 'Registered',
        turnover: '₹15 Cr – ₹25 Cr',
        noOfEmployee: '51 – 200 Staff Members',
        assignedTo: 'neha.gupta',
        referredBy: 'LinkedIn InMail Campaign',
        primaryAddress: '4th Floor, Salarpuria Infinity, Bannerghatta Road',
        primaryCity: 'Bengaluru',
        primaryState: 'Karnataka',
        primaryPostalCode: '560029',
        primaryCountry: 'India',
        primaryLatitude: '12.92500000',
        otherAddress: '',
        otherCity: '',
        otherState: '',
        otherPostalCode: '',
        otherCountry: 'India',
        copyAddressFromLeft: false,
        otherLongitude: '0.00000000',
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
        createdBy: 'neha.gupta',
    },
    {
        id: 'lea-1005',
        leadCode: 'LEA-1005',
        name: 'Rameshwar Dayal',
        organizationName: 'Dayal Agro Commodity Traders',
        mailingName: 'Dayal Agro Commodity Traders',
        mobile: '9839055432',
        otherPhone: '0522261890',
        emailAddresses: [
            {
                id: 'eml-501',
                email: 'rameshwardayal@dayalagro.in',
                isPrimary: true,
                isOptedOut: false,
                isInvalidBounce: false,
            },
        ],
        designation: 'Proprietor / Owner',
        department: 'Executive Management',
        leadSource: 'Cold Call',
        leadType: 'Cold',
        productCategory: ['TallyPrime', 'Tally Software Services (TSS)'],
        status: 'New',
        followupType: 'Call',
        nextFollowupDate: new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0],
        nextFollowupTime: '12:00 PM',
        addDescription: 'Expressed interest in renewing expired TSS for 3 licenses and upgrading to latest TallyPrime 4.1 with Connected GST.',
        description: 'Mandi trading house in Lucknow. Currently running on legacy Tally.ERP 9 and facing difficulty generating e-way bills.',
        registrationType: 'Composition Scheme',
        turnover: '₹1.5 Cr – ₹5 Cr',
        noOfEmployee: '1 – 10 Staff Members',
        assignedTo: 'mittal.sharma',
        referredBy: '',
        primaryAddress: 'Kisan Mandi Bhawan, Alambagh',
        primaryCity: 'Lucknow',
        primaryState: 'Uttar Pradesh',
        primaryPostalCode: '226005',
        primaryCountry: 'India',
        primaryLatitude: '26.82060000',
        otherAddress: '',
        otherCity: '',
        otherState: '',
        otherPostalCode: '',
        otherCountry: 'India',
        copyAddressFromLeft: false,
        otherLongitude: '0.00000000',
        createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
        updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        createdBy: 'mittal.sharma',
    },
    {
        id: 'lea-1006',
        leadCode: 'LEA-1006',
        name: 'Deepak Singhania',
        organizationName: 'Singhania Electronics & Appliances',
        mailingName: 'Singhania Electronics Pvt Ltd',
        mobile: '9910066782',
        otherPhone: '0112386123',
        emailAddresses: [
            {
                id: 'eml-601',
                email: 'deepak@singhaniaelectronics.com',
                isPrimary: true,
                isOptedOut: false,
                isInvalidBounce: false,
            },
        ],
        designation: 'Director / Partner',
        department: 'Operations',
        leadSource: 'Tally Partner Network',
        leadType: 'Hot',
        productCategory: ['Tally Server 9', 'Biz Analyst', 'Acronis'],
        status: 'Negotiation',
        followupType: 'Meeting',
        nextFollowupDate: new Date().toISOString().split('T')[0], // Today
        nextFollowupTime: '05:30 PM',
        addDescription: 'Final negotiation on Tally Server 9 enterprise license + 20 user Biz Analyst annual subscription with installation.',
        description: 'Retail electronics chain with 8 showrooms across Delhi NCR. High concurrency causing server bottlenecks on regular Tally Gold.',
        registrationType: 'Registered',
        turnover: '₹25 Cr – ₹100 Cr',
        noOfEmployee: '51 – 200 Staff Members',
        assignedTo: 'mittal.sharma',
        referredBy: 'Chandan Kumar (Senior Account Manager)',
        primaryAddress: 'Singhania Tower, Commercial Complex, Preet Vihar',
        primaryCity: 'New Delhi',
        primaryState: 'Delhi',
        primaryPostalCode: '110092',
        primaryCountry: 'India',
        primaryLatitude: '28.63660000',
        otherAddress: 'Warehouse: C-14, Patparganj Industrial Area',
        otherCity: 'Delhi',
        otherState: 'Delhi',
        otherPostalCode: '110092',
        otherCountry: 'India',
        copyAddressFromLeft: false,
        otherLongitude: '77.30140000',
        createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
        updatedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
        createdBy: 'mittal.sharma',
    },
    {
        id: 'lea-1007',
        leadCode: 'LEA-1007',
        name: 'Sunita Menon',
        organizationName: 'Zenith Biotech Labs',
        mailingName: 'Zenith Biotech Labs LLP',
        mobile: '9447122390',
        otherPhone: '0484255678',
        emailAddresses: [
            {
                id: 'eml-701',
                email: 'sunita.menon@zenithbiotech.in',
                isPrimary: true,
                isOptedOut: false,
                isInvalidBounce: false,
            },
        ],
        designation: 'Purchase Head / Manager',
        department: 'Procurement & Purchase',
        leadSource: 'Partner Referral',
        leadType: 'Warm',
        productCategory: ['Cyber Security & Antivirus', 'Cloud Backup Solutions'],
        status: 'Qualified',
        followupType: 'Email',
        nextFollowupDate: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
        nextFollowupTime: '10:00 AM',
        addDescription: 'Security compliance review completed for clinical diagnostic data protection. Awaiting tender document release.',
        description: 'Diagnostic chain in Kerala needing ISO 27001 compliant cyber endpoint security and offsite data backups.',
        registrationType: 'Registered',
        turnover: '₹5 Cr – ₹25 Cr',
        noOfEmployee: '51 – 200 Staff Members',
        assignedTo: 'amit.verma',
        referredBy: 'South Zone Tally Master',
        primaryAddress: 'Infopark Phase 2, Kakkanad',
        primaryCity: 'Kochi',
        primaryState: 'Kerala',
        primaryPostalCode: '682042',
        primaryCountry: 'India',
        primaryLatitude: '10.01590000',
        otherAddress: '',
        otherCity: '',
        otherState: '',
        otherPostalCode: '',
        otherCountry: 'India',
        copyAddressFromLeft: false,
        otherLongitude: '0.00000000',
        createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        createdBy: 'amit.verma',
    },
    {
        id: 'lea-1008',
        leadCode: 'LEA-1008',
        name: 'Alok Nath Tiwari',
        organizationName: 'Tiwari Construction & Infra',
        mailingName: 'Tiwari Construction & Infra Pvt Ltd',
        mobile: '9711033419',
        otherPhone: '0120499112',
        emailAddresses: [
            {
                id: 'eml-801',
                email: 'alok.tiwari@tiwariinfra.com',
                isPrimary: true,
                isOptedOut: false,
                isInvalidBounce: false,
            },
        ],
        designation: 'Accounts & Finance Head',
        department: 'Finance & Accounts',
        leadSource: 'Website Enquiry',
        leadType: 'Hot',
        productCategory: ['Biz Analyst', 'Connect 2T'],
        status: 'New',
        followupType: 'Call',
        nextFollowupDate: new Date().toISOString().split('T')[0], // Today
        nextFollowupTime: '01:15 PM',
        addDescription: 'Inquired about mobile tally reporting for site engineers to track material purchase orders directly on mobile app.',
        description: 'Civil contractor working on expressway projects. Site supervisors need view-only mobile access to vendor accounts.',
        registrationType: 'Registered',
        turnover: '₹25 Cr – ₹100 Cr',
        noOfEmployee: '201 – 500 Staff Members',
        assignedTo: 'mittal.sharma',
        referredBy: 'Google Ad #TallyOnMobile',
        primaryAddress: 'Tower B, Express Trade Towers, Sector 132',
        primaryCity: 'Noida',
        primaryState: 'Uttar Pradesh',
        primaryPostalCode: '201304',
        primaryCountry: 'India',
        primaryLatitude: '28.51320000',
        otherAddress: '',
        otherCity: '',
        otherState: '',
        otherPostalCode: '',
        otherCountry: 'India',
        copyAddressFromLeft: false,
        otherLongitude: '0.00000000',
        createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
        updatedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
        createdBy: 'mittal.sharma',
    },
    {
        id: 'lea-1009',
        leadCode: 'LEA-1009',
        name: 'Rohit Verma',
        organizationName: '',
        mailingName: '',
        mobile: '9876543210',
        otherPhone: '',
        emailAddresses: [
            {
                id: 'eml-901',
                email: 'rohit.verma@freemail.com',
                isPrimary: true,
                isOptedOut: false,
                isInvalidBounce: false,
            },
        ],
        designation: 'Independent Consultant',
        department: 'Operations',
        leadSource: 'Website Enquiry',
        leadType: 'Warm',
        productCategory: ['Biz Analyst'],
        status: 'New',
        followupType: 'Call',
        nextFollowupDate: new Date().toISOString().split('T')[0],
        nextFollowupTime: '02:30 PM',
        addDescription: 'Inquired about individual license for Biz Analyst without organization affiliation.',
        description: 'Independent business consultant looking for single-user mobile dashboard.',
        registrationType: 'Unregistered',
        turnover: 'Below ₹25 Lakhs',
        noOfEmployee: '1 – 10 Staff Members',
        assignedTo: 'mittal.sharma',
        referredBy: '',
        primaryAddress: 'Flat 402, Sunshine Apartments, Mayur Vihar Phase 1',
        primaryCity: 'Delhi',
        primaryState: 'Delhi',
        primaryPostalCode: '110091',
        primaryCountry: 'India',
        primaryLatitude: '28.60800000',
        otherAddress: '',
        otherCity: '',
        otherState: '',
        otherPostalCode: '',
        otherCountry: 'India',
        copyAddressFromLeft: false,
        otherLongitude: '0.00000000',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'mittal.sharma',
    },
];

const LEADS_STORAGE_KEY = 'nandini_crm_leads_data_v1';

export function getStoredLeads(): Lead[] {
    if (typeof window === 'undefined') return INITIAL_MOCK_LEADS;
    try {
        const item = localStorage.getItem(LEADS_STORAGE_KEY);
        if (!item) {
            localStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(INITIAL_MOCK_LEADS));
            return INITIAL_MOCK_LEADS;
        }
        const parsed = JSON.parse(item);
        if (Array.isArray(parsed) && parsed.length > 0) {
            const sanitized = parsed.map((lead: Lead) => ({
                ...lead,
                mobile: lead.mobile ? lead.mobile.replace(/\D/g, '').slice(-10) : lead.mobile,
                otherPhone: lead.otherPhone ? lead.otherPhone.replace(/\D/g, '').slice(-10) : lead.otherPhone,
            }));
            const hasLea1009 = sanitized.some((l: Lead) => l.id === 'lea-1009');
            if (!hasLea1009) {
                const leadWithoutOrg = INITIAL_MOCK_LEADS.find((l) => l.id === 'lea-1009');
                if (leadWithoutOrg) {
                    const updated = [...sanitized, leadWithoutOrg];
                    localStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(updated));
                    return updated;
                }
            }
            return sanitized;
        }
    } catch {
        // Fallback to initial seeds
    }
    return INITIAL_MOCK_LEADS;
}

export function saveStoredLeads(leads: Lead[]) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(leads));
    } catch (e) {
        console.error('Failed to save leads to localStorage', e);
    }
}

export function getStoredLeadById(id: string): Lead | undefined {
    const list = getStoredLeads();
    return list.find((lead) => lead.id === id);
}

export function addStoredLead(data: LeadFormData): Lead {
    const list = getStoredLeads();
    const nextSeq = list.length + 1001;
    const newLead: Lead = {
        ...data,
        id: `lea-${nextSeq}`,
        leadCode: `LEA-${nextSeq}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: data.assignedTo || 'mittal.sharma',
    };
    const updatedList = [newLead, ...list];
    saveStoredLeads(updatedList);
    return newLead;
}

export function updateStoredLead(id: string, updates: Partial<LeadFormData>): Lead | null {
    const list = getStoredLeads();
    const idx = list.findIndex((lead) => lead.id === id);
    if (idx === -1) return null;
    const updated: Lead = {
        ...list[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    saveStoredLeads(list);
    return updated;
}

export function deleteStoredLead(id: string): boolean {
    const list = getStoredLeads();
    const filtered = list.filter((lead) => lead.id !== id);
    if (filtered.length !== list.length) {
        saveStoredLeads(filtered);
        return true;
    }
    return false;
}

export function deleteMultipleStoredLeads(ids: string[]): boolean {
    const idSet = new Set(ids);
    const list = getStoredLeads();
    const filtered = list.filter((lead) => !idSet.has(lead.id));
    saveStoredLeads(filtered);
    return true;
}
