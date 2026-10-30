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
