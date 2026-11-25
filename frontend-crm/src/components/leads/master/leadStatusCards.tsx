import React from 'react';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import type { StatusSummaryItem } from '../../common/StatusSummaryCards';
import { getLeadStatusBucket, type LeadStatusBucket } from './types';

/**
 * The Leads list's built-in cards (until an admin saves a scorecard): All, New, In Process, Converted and Lost,
 * each counting the leads whose status falls in that bucket. Also drawn by the List Scorecards preview.
 */
export function leadStatusSummaryItems(leads: readonly { status?: string | null }[], allLabel = 'All Leads'): StatusSummaryItem<LeadStatusBucket>[] {
    const counts = { new: 0, in_process: 0, converted: 0, lost: 0 };
    for (const lead of leads) counts[getLeadStatusBucket(lead.status)] += 1;
    return [
        { id: 'all', label: allLabel, count: leads.length, tone: 'brand', icon: <GroupOutlinedIcon />, hint: 'Every status' },
        { id: 'new', label: 'New', count: counts.new, tone: 'brand', icon: <PersonAddAltOutlinedIcon />, hint: 'Not contacted yet' },
        {
            id: 'in_process',
            label: 'In Process',
            count: counts.in_process,
            tone: 'warning',
            icon: <AutorenewOutlinedIcon />,
            hint: 'Contacted to Negotiation',
        },
        { id: 'converted', label: 'Converted', count: counts.converted, tone: 'success', icon: <CheckCircleOutlineIcon />, hint: 'Won' },
        { id: 'lost', label: 'Lost', count: counts.lost, tone: 'error', icon: <HighlightOffOutlinedIcon />, hint: 'Unqualified / Lost' },
    ];
}
