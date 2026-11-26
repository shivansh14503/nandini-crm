'use client';

import { ROUTES } from '@/config/constants';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { CompanyFormatsView } from '@/components/settings/company-formats/CompanyFormatsView';

export default function CompanyFormatsPage() {
    return (
        <AdminPageShell
            loadingMessage="Loading company formats..."
            breadcrumbs={[{ label: 'Admin', href: ROUTES.ADMIN }, { label: 'Company Formats' }]}
            deniedMessage="Only administrators can change company formats. Ask an Admin or Super Admin for access."
            maxWidth="lg"
        >
            <CompanyFormatsView />
        </AdminPageShell>
    );
}
