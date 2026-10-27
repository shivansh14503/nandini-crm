import type { PartnerCompany, PartnerCompanyContact } from '../types/partner.types';

export type { PartnerCompany, PartnerCompanyContact } from '../types/partner.types';

export const MOCK_PARTNER_COMPANIES: PartnerCompany[] = [
    { id: 'pc-01', companyName: 'Computer Care', natureOfPartner: 'TALLY-REFERRAL PARTNER', phone: '8295058024', email: 'tdl.kamal@gmail.com', city: 'Karnal', billingCountry: 'India', assignedTo: 'vishal' },
    { id: 'pc-02', companyName: 'Tophra Infotech', natureOfPartner: 'TALLY-REFERRAL PARTNER', phone: '9764543111', email: 'sunny@tophrainfotech.com', city: 'Alwar', billingCountry: 'India', assignedTo: 'preeti.chawla' },
    { id: 'pc-03', companyName: 'Mittal Enterprises', natureOfPartner: 'TALLY-3STAR PARTNER', phone: '9050300353', email: 'mittalenterprises38@gmail.com', city: 'Delhi', billingCountry: 'India', assignedTo: 'mittal.sharma' },
    { id: 'pc-04', companyName: 'Apex Tech Solutions', natureOfPartner: 'TALLY-5STAR-SS', phone: '9811223344', email: 'contact@apextech.in', city: 'Gurugram', billingCountry: 'India', assignedTo: 'govind.tandon' },
];

export const MOCK_PARTNER_CONTACTS: PartnerCompanyContact[] = [
    { id: 'pcc-01', name: 'Lakshay', designation: 'Technical Lead', partnerCompany: 'Computer Care', mobile: '8295058024', email: 'tdl.kamal@gmail.com', location: 'Karnal' },
    { id: 'pcc-02', name: 'Mr Himanshu Mittal', designation: 'Managing Director', partnerCompany: 'Mittal Enterprises', mobile: '9050300353', email: 'mittalenterprises38@gmail.com', location: 'Delhi' },
    { id: 'pcc-03', name: 'Sunny Tophra', designation: 'Principal Partner', partnerCompany: 'Tophra Infotech', mobile: '9764543111', email: 'sunny@tophrainfotech.com', location: 'Alwar' },
];

export function getPartnerCompanies(): PartnerCompany[] {
    return MOCK_PARTNER_COMPANIES;
}

export function getPartnerContacts(): PartnerCompanyContact[] {
    return MOCK_PARTNER_CONTACTS;
}
