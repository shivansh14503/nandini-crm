import type { DrawerLayoutModule } from '@/lib/drawer-layout';

/**
 * Made-up records the Drawer Layout builder previews with until the admin picks a real one: every built-in field
 * filled, so each part of the layout shows something.
 */

const SAMPLE_LEAD: Record<string, unknown> = {
    id: '__sample',
    leadCode: 'LD-00042',
    name: 'Rohan Sharma',
    mobile: '+919876543210',
    otherPhone: '+912240001234',
    emailAddress: [
        { id: 'e1', email: 'rohan.sharma@sunrisedairy.in', isPrimary: true, isOptedOut: false, isInvalidBounce: false },
        { id: 'e2', email: 'accounts@sunrisedairy.in', isPrimary: false, isOptedOut: false, isInvalidBounce: false },
    ],
    organizationName: 'Sunrise Dairy Products Pvt Ltd',
    mailingName: 'Sunrise Dairy',
    tradeName: 'Sunrise',
    designation: 'Purchase Manager',
    department: 'Procurement',
    turnover: '25 - 50 Cr',
    noOfEmployee: '201 - 500',
    leadSource: 'Exhibition / Trade Show',
    referredBy: 'Anita Desai',
    productCategory: ['TallyPrime', 'Tally On Cloud', 'Biz Analyst'],
    followupType: 'Demo / Presentation',
    nextFollowupDate: '2026-11-28',
    nextFollowupTime: '11:30',
    remarks: 'Wants a demo of multi-branch billing for their 3 plants before the new financial year.',
    customerResponse: 'Interested',
    leadType: 'Inbound',
    rating: 'Hot',
    ratingReason: 'Demo booked within 7 days',
    status: 'In Discussion',
    assignedTo: 'Priya Mehta',
    description: 'Met at the Dairy Expo, Pune.',
    registrationType: 'Regular',
    gstNumber: '27AAACS1234F1Z5',
    primaryAddress: 'Plot 14, MIDC Industrial Area\nBhosari',
    primaryCity: 'Pune',
    primaryState: 'Maharashtra',
    primaryPostalCode: '411026',
    primaryCountry: 'IN',
    otherAddress: 'Warehouse 3, Chakan Road',
    otherCity: 'Chakan',
    otherState: 'Maharashtra',
    otherPostalCode: '410501',
    otherCountry: 'IN',
    customFields: {},
};

export const SAMPLE_RECORDS: Record<DrawerLayoutModule, Record<string, unknown>> = { leads: SAMPLE_LEAD };

export const SAMPLE_RECORD_ID = '__sample';
