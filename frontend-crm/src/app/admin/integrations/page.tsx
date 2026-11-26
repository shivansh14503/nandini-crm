'use client';

import { ROUTES } from '@/config/constants';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { ApiIntegrationsView } from '@/components/settings/integrations/ApiIntegrationsView';

export default function ApiIntegrationsPage() {
    return (
        <AdminPageShell
            loadingMessage="Loading API integrations..."
            breadcrumbs={[{ label: 'Admin', href: ROUTES.ADMIN }, { label: 'API Integrations' }]}
            deniedMessage="Only administrators can manage API integrations. Ask an Admin or Super Admin for access."
        >
            <ApiIntegrationsView />
        </AdminPageShell>
    );
}
