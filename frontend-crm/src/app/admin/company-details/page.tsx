'use client';

import { ROUTES } from '@/config/constants';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { CompanyDetailsView } from '@/components/settings/company-details/CompanyDetailsView';

export default function CompanyDetailsPage() {
    return (
        <AdminPageShell
            loadingMessage="Loading company details..."
            breadcrumbs={[{ label: 'Admin', href: ROUTES.ADMIN }, { label: 'Company Details' }]}
            deniedMessage="Only administrators can change company details. Ask an Admin or Super Admin for access."
            maxWidth="lg"
        >
            <CompanyDetailsView />
        </AdminPageShell>
    );
}
