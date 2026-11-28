'use client';

import { ROUTES } from '@/config/constants';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { SecurityGroupsView } from '@/components/settings/security-groups/SecurityGroupsView';

export default function SecurityGroupsPage() {
    return (
        <AdminPageShell
            loadingMessage="Loading security groups..."
            breadcrumbs={[{ label: 'Admin', href: ROUTES.ADMIN }, { label: 'Security Groups' }]}
            deniedMessage="Only administrators can manage security groups. Ask an Admin or Super Admin for access."
        >
            <SecurityGroupsView />
        </AdminPageShell>
    );
}
