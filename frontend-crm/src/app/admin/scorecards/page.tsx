'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ROUTES } from '@/config/constants';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { ScorecardsAdminView } from '@/components/settings/scorecards/ScorecardsAdminView';
import { CRM_MODULE_KEYS, type CrmModuleKey } from '@/types/formConfig.types';

function ListScorecardsContent() {
    const searchParams = useSearchParams();
    const moduleParam = searchParams.get('module') ?? '';
    const selected: CrmModuleKey = (CRM_MODULE_KEYS as readonly string[]).includes(moduleParam) ? (moduleParam as CrmModuleKey) : 'leads';
    return (
        <AdminPageShell
            loadingMessage="Loading list scorecards..."
            breadcrumbs={[{ label: 'Admin', href: ROUTES.ADMIN }, { label: 'List Scorecards' }]}
            deniedMessage="Only administrators can manage list scorecards. Ask an Admin or Super Admin for access."
        >
            <ScorecardsAdminView module={selected} />
        </AdminPageShell>
    );
}

export default function ListScorecardsPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading list scorecards..." />}>
            <ListScorecardsContent />
        </Suspense>
    );
}
