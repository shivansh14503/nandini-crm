'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import AlternateEmailOutlinedIcon from '@mui/icons-material/AlternateEmailOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import { PillTabs, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { OutboundEmailPanel } from './OutboundEmailPanel';
import { EmailTemplatesPanel } from './EmailTemplatesPanel';
import { EmailQueuePanel } from './EmailQueuePanel';

type TabKey = 'outbound' | 'templates' | 'queue';
const TABS: TabKey[] = ['outbound', 'templates', 'queue'];

const tabOf = (value: string | null): TabKey => ((TABS as string[]).includes(value ?? '') ? (value as TabKey) : 'outbound');

/**
 * Admin › Email (Jira CRM-121): how the CRM sends email (Outbound Email: Gmail API with the Google Workspace service
 * account, or SMTP), the wording of system emails (Templates, with merge fields) and every email sent (Email Queue,
 * with retry for failed ones).
 */
export function EmailAdminView() {
    // The tab lives in the URL (`?tab=queue`), so it survives a reload and can be linked to. Reads useSearchParams:
    // the page renders this view inside a Suspense boundary.
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const tab = tabOf(params.get('tab'));

    const changeTab = (next: TabKey) => {
        const query = new URLSearchParams(params.toString());
        query.set('tab', next);
        router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <Box sx={{ ...surfaceSx, p: { xs: 2, md: 2.5 }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '10px',
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        border: '1px solid var(--mui-palette-primary-softBorder)',
                        color: 'var(--crm-text-blue-600)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    <AlternateEmailOutlinedIcon />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--crm-slate-900)' }}>
                        Email
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25 }}>
                        Send company email through Google Workspace, edit the wording of system emails, and follow every email the CRM sends.
                    </Typography>
                </Box>
            </Box>

            <PillTabs<TabKey>
                value={tab}
                onChange={changeTab}
                items={[
                    { key: 'outbound', label: 'Outbound Email', icon: <SendOutlinedIcon sx={{ fontSize: 18 }} /> },
                    { key: 'templates', label: 'Templates', icon: <ArticleOutlinedIcon sx={{ fontSize: 18 }} /> },
                    { key: 'queue', label: 'Email Queue', icon: <ListAltOutlinedIcon sx={{ fontSize: 18 }} /> },
                ]}
            />

            {tab === 'outbound' && <OutboundEmailPanel onOpenQueue={() => changeTab('queue')} />}
            {tab === 'templates' && <EmailTemplatesPanel />}
            {tab === 'queue' && <EmailQueuePanel />}
        </Box>
    );
}
