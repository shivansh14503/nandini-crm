/**
 * Reference masters seeded in every environment. Generated from frontend-crm/src/data/mockNatureOfCalls.ts and
 * mockPartners.ts so the backend doesn't depend on the frontend repo at deploy time; edit here (the database is
 * the source of truth once seeded).
 */

export interface NatureOfCallSeed {
    name: string;
    priority: 'High' | 'Medium' | 'Low';
}

export interface PartnerCompanySeed {
    companyName: string;
    natureOfPartner: string;
    phone: string;
    email: string;
    city: string;
    billingCountry: string;
    assignedTo: string;
    website?: string;
    description?: string;
    billingCity?: string;
    billingState?: string;
}

export interface PartnerContactSeed {
    name: string;
    designation: string;
    /** companyName of the partner this contact works for. */
    partnerCompany: string;
    mobile: string;
    officePhone?: string;
    email: string;
    location: string;
}

export const NATURE_OF_CALLS: NatureOfCallSeed[] = [
    {
        name: 'Excel Import Issue',
        priority: 'Medium'
    },
    {
        name: 'Banking Related Issue',
        priority: 'High'
    },
    {
        name: 'Whatsapp Issue',
        priority: 'Medium'
    },
    {
        name: 'Auto Backup Issue',
        priority: 'Medium'
    },
    {
        name: 'Forex Gain/Loss',
        priority: 'High'
    },
    {
        name: 'Tally IRA',
        priority: 'Medium'
    },
    {
        name: 'Tally Installation',
        priority: 'High'
    },
    {
        name: 'Payroll',
        priority: 'Low'
    },
    {
        name: 'BPM Related Issue',
        priority: 'Low'
    },
    {
        name: 'Tally Release Update',
        priority: 'Low'
    },
    {
        name: 'LAN Problem',
        priority: 'Low'
    },
    {
        name: 'Ledger Master Issue',
        priority: 'Low'
    },
    {
        name: 'Stock Problem',
        priority: 'Low'
    },
    {
        name: 'Cloud Related issue',
        priority: 'High'
    },
    {
        name: 'License Issue',
        priority: 'High'
    },
    {
        name: 'Sync Issue',
        priority: 'High'
    },
    {
        name: 'New Implementation',
        priority: 'Low'
    },
    {
        name: 'Data Problem',
        priority: 'High'
    },
    {
        name: 'Printing Issue',
        priority: 'Medium'
    },
    {
        name: 'Taxation Problem',
        priority: 'Medium'
    },
    {
        name: 'Data Splitting',
        priority: 'Medium'
    },
    {
        name: 'Purchase Issue',
        priority: 'Low'
    },
    {
        name: 'E-Invoicing Issue',
        priority: 'High'
    },
    {
        name: 'TDL Issue',
        priority: 'High'
    },
    {
        name: 'Re-Installation',
        priority: 'Low'
    },
    {
        name: 'E-way Bill Issue',
        priority: 'High'
    },
    {
        name: 'Training',
        priority: 'Low'
    },
    {
        name: 'Remote Access Issue',
        priority: 'High'
    },
    {
        name: 'Item Master Issue',
        priority: 'Low'
    },
    {
        name: 'Feedback Call',
        priority: 'Low'
    },
    {
        name: 'Billing Issue',
        priority: 'Medium'
    },
    {
        name: 'Reporting Issue',
        priority: 'Low'
    },
    {
        name: 'GST Related Issue',
        priority: 'Medium'
    },
    {
        name: 'Security Control',
        priority: 'Low'
    },
    {
        name: 'Test',
        priority: 'Medium'
    }
];

export const PARTNER_COMPANIES: PartnerCompanySeed[] = [
    {
        companyName: 'Computer Care',
        natureOfPartner: 'TALLY-REFERRAL PARTNER',
        phone: '8295058024',
        email: 'tdl.kamal@gmail.com',
        city: 'Karnal',
        billingCountry: 'India',
        assignedTo: 'vishal'
    },
    {
        companyName: 'Tophra Infotech',
        natureOfPartner: 'TALLY-REFERRAL PARTNER',
        phone: '9764543111',
        email: 'sunny@tophrainfotech.com',
        city: 'Alwar',
        billingCountry: 'India',
        assignedTo: 'preeti.chawla'
    },
    {
        companyName: 'Mittal Enterprises',
        natureOfPartner: 'TALLY-3STAR PARTNER',
        phone: '9050300353',
        email: 'mittalenterprises38@gmail.com',
        city: 'Delhi',
        billingCountry: 'India',
        assignedTo: 'mittal.sharma'
    },
    {
        companyName: 'Apex Tech Solutions',
        natureOfPartner: 'TALLY-5STAR-SS',
        phone: '9811223344',
        email: 'contact@apextech.in',
        city: 'Gurugram',
        billingCountry: 'India',
        assignedTo: 'govind.tandon'
    }
];

/** Nature of Partner used for the OEM / product (principal) companies below. */
export const PRODUCT_COMPANY_NATURE = 'PRODUCT COMPANY';

/**
 * Dummy OEM / product companies. They live in the PartnerCompany master (so they show up in the organization
 * form's Partner Company lookup and Partner Licensing tab) and are linked to organizations via
 * ORGANIZATION_PRODUCT_COMPANIES. Names, phones, emails and websites are fictitious.
 */
export const PRODUCT_COMPANIES: PartnerCompanySeed[] = [
    {
        companyName: 'Nexora Software Labs',
        natureOfPartner: PRODUCT_COMPANY_NATURE,
        phone: '+919810011001',
        email: 'partners@nexora-software.example',
        city: 'Bengaluru',
        billingCity: 'Bengaluru',
        billingState: 'Karnataka',
        billingCountry: 'India',
        assignedTo: 'mittal.sharma',
        website: 'https://nexora-software.example',
        description: 'Accounting & ERP software publisher (dummy record).'
    },
    {
        companyName: 'Quantix Cloud Systems',
        natureOfPartner: PRODUCT_COMPANY_NATURE,
        phone: '+919810011002',
        email: 'alliances@quantix-cloud.example',
        city: 'Pune',
        billingCity: 'Pune',
        billingState: 'Maharashtra',
        billingCountry: 'India',
        assignedTo: 'govind.tandon',
        website: 'https://quantix-cloud.example',
        description: 'Cloud hosting & backup product vendor (dummy record).'
    },
    {
        companyName: 'Veltrix Hardware Pvt Ltd',
        natureOfPartner: PRODUCT_COMPANY_NATURE,
        phone: '+919810011003',
        email: 'channel@veltrix-hw.example',
        city: 'Noida',
        billingCity: 'Noida',
        billingState: 'Uttar Pradesh',
        billingCountry: 'India',
        assignedTo: 'shashi.ranjan',
        website: 'https://veltrix-hw.example',
        description: 'Servers, desktops and peripherals OEM (dummy record).'
    },
    {
        companyName: 'Orbis Networks India',
        natureOfPartner: PRODUCT_COMPANY_NATURE,
        phone: '+919810011004',
        email: 'partners@orbis-networks.example',
        city: 'Hyderabad',
        billingCity: 'Hyderabad',
        billingState: 'Telangana',
        billingCountry: 'India',
        assignedTo: 'gagan.gupta',
        website: 'https://orbis-networks.example',
        description: 'Switching, routing and Wi-Fi product company (dummy record).'
    },
    {
        companyName: 'Sentrik Cybersecurity',
        natureOfPartner: PRODUCT_COMPANY_NATURE,
        phone: '+919810011005',
        email: 'resellers@sentrik-security.example',
        city: 'Gurugram',
        billingCity: 'Gurugram',
        billingState: 'Haryana',
        billingCountry: 'India',
        assignedTo: 'mittal.sharma',
        website: 'https://sentrik-security.example',
        description: 'Firewall and endpoint security vendor (dummy record).'
    }
];

/**
 * organizationName → product companies to link in Organization.partnerCompaniesJson. The seed merges these into
 * whatever partners an organization already has (never removes any), so it is safe to re-run.
 */
export const ORGANIZATION_PRODUCT_COMPANIES: Record<string, string[]> = {
    'IDTR Network': ['Nexora Software Labs', 'Quantix Cloud Systems'],
    'GIRDHAR BUILDTECH LLP': ['Nexora Software Labs'],
    'Nandini Infosys Pvt Ltd': ['Nexora Software Labs', 'Quantix Cloud Systems', 'Veltrix Hardware Pvt Ltd', 'Orbis Networks India', 'Sentrik Cybersecurity'],
    'Apex Technosoft Solutions': ['Nexora Software Labs', 'Sentrik Cybersecurity'],
    'Bharat Heavy Electricals & Engg': ['Veltrix Hardware Pvt Ltd', 'Orbis Networks India'],
    'Apollo Diagnostics & Health Ltd': ['Quantix Cloud Systems', 'Sentrik Cybersecurity'],
    'Zenith Cloud Infotech LLP': ['Quantix Cloud Systems', 'Orbis Networks India'],
    'Vanguard Security & Surveillance': ['Sentrik Cybersecurity', 'Veltrix Hardware Pvt Ltd'],
    'Dynamic System Integrators Pvt': ['Veltrix Hardware Pvt Ltd', 'Orbis Networks India', 'Sentrik Cybersecurity'],
    'TechnoServe Electronics India': ['Veltrix Hardware Pvt Ltd'],
    'Matrix Telecom & Hardware': ['Orbis Networks India', 'Veltrix Hardware Pvt Ltd'],
    'Kalyan Jewellers & Retailers': ['Nexora Software Labs'],
    'CareWell Pharma & Chemicals': ['Nexora Software Labs', 'Quantix Cloud Systems']
};

export const PARTNER_CONTACTS: PartnerContactSeed[] = [
    {
        name: 'Lakshay',
        designation: 'Technical Lead',
        partnerCompany: 'Computer Care',
        mobile: '8295058024',
        email: 'tdl.kamal@gmail.com',
        location: 'Karnal'
    },
    {
        name: 'Mr Himanshu Mittal',
        designation: 'Managing Director',
        partnerCompany: 'Mittal Enterprises',
        mobile: '9050300353',
        email: 'mittalenterprises38@gmail.com',
        location: 'Delhi'
    },
    {
        name: 'Sunny Tophra',
        designation: 'Principal Partner',
        partnerCompany: 'Tophra Infotech',
        mobile: '9764543111',
        email: 'sunny@tophrainfotech.com',
        location: 'Alwar'
    }
];
