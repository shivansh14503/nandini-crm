'use client';

import { ROUTES } from '@/config/constants';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { DocumentSeriesView } from '@/components/settings/document-series/DocumentSeriesView';

export default function DocumentSeriesPage() {
    return (
        <AdminPageShell
            loadingMessage="Loading document series..."
            breadcrumbs={[{ label: 'Administration', href: ROUTES.ADMIN }, { label: 'Document Series' }]}
            deniedMessage="Only administrators can manage document series. Ask an Admin or Super Admin for access."
        >
            <DocumentSeriesView />
        </AdminPageShell>
    );
}
