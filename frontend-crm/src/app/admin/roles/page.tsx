'use client';

import { ROUTES } from '@/config/constants';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { RolesView } from '@/components/settings/roles/RolesView';

export default function RolesPage() {
    return (
        <AdminPageShell
            loadingMessage="Loading roles..."
            breadcrumbs={[{ label: 'Admin', href: ROUTES.ADMIN }, { label: 'Roles' }]}
            deniedMessage="Only administrators can manage roles. Ask an Admin or Super Admin for access."
        >
            <RolesView />
        </AdminPageShell>
    );
}
