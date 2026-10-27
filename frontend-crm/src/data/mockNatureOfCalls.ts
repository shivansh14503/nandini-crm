import type { NatureOfCallItem } from '../types/ticket.types';

export type { NatureOfCallItem } from '../types/ticket.types';

/** Nature of Call master from the legacy CRM, with each call type's default priority. */
export const MOCK_NATURE_OF_CALLS: NatureOfCallItem[] = [
    { id: 'noc-01', name: 'Excel Import Issue', priority: 'Medium' },
    { id: 'noc-02', name: 'Banking Related Issue', priority: 'High' },
    { id: 'noc-03', name: 'Whatsapp Issue', priority: 'Medium' },
    { id: 'noc-04', name: 'Auto Backup Issue', priority: 'Medium' },
    { id: 'noc-05', name: 'Forex Gain/Loss', priority: 'High' },
    { id: 'noc-06', name: 'Tally IRA', priority: 'Medium' },
    { id: 'noc-07', name: 'Tally Installation', priority: 'High' },
    { id: 'noc-08', name: 'Payroll', priority: 'Low' },
    { id: 'noc-09', name: 'BPM Related Issue', priority: 'Low' },
    { id: 'noc-10', name: 'Tally Release Update', priority: 'Low' },
    { id: 'noc-11', name: 'LAN Problem', priority: 'Low' },
    { id: 'noc-12', name: 'Ledger Master Issue', priority: 'Low' },
    { id: 'noc-13', name: 'Stock Problem', priority: 'Low' },
    { id: 'noc-14', name: 'Cloud Related issue', priority: 'High' },
    { id: 'noc-15', name: 'License Issue', priority: 'High' },
    { id: 'noc-16', name: 'Sync Issue', priority: 'High' },
    { id: 'noc-17', name: 'New Implementation', priority: 'Low' },
    { id: 'noc-18', name: 'Data Problem', priority: 'High' },
    { id: 'noc-19', name: 'Printing Issue', priority: 'Medium' },
    { id: 'noc-20', name: 'Taxation Problem', priority: 'Medium' },
    { id: 'noc-21', name: 'Data Splitting', priority: 'Medium' },
    { id: 'noc-22', name: 'Purchase Issue', priority: 'Low' },
    { id: 'noc-23', name: 'E-Invoicing Issue', priority: 'High' },
    { id: 'noc-24', name: 'TDL Issue', priority: 'High' },
    { id: 'noc-25', name: 'Re-Installation', priority: 'Low' },
    { id: 'noc-26', name: 'E-way Bill Issue', priority: 'High' },
    { id: 'noc-27', name: 'Training', priority: 'Low' },
    { id: 'noc-28', name: 'Remote Access Issue', priority: 'High' },
    { id: 'noc-29', name: 'Item Master Issue', priority: 'Low' },
    { id: 'noc-30', name: 'Feedback Call', priority: 'Low' },
    { id: 'noc-31', name: 'Billing Issue', priority: 'Medium' },
    { id: 'noc-32', name: 'Reporting Issue', priority: 'Low' },
    { id: 'noc-33', name: 'GST Related Issue', priority: 'Medium' },
    { id: 'noc-34', name: 'Security Control', priority: 'Low' },
    { id: 'noc-35', name: 'Test', priority: 'Medium' },
];

export function getNatureOfCalls(): NatureOfCallItem[] {
    return MOCK_NATURE_OF_CALLS;
}
