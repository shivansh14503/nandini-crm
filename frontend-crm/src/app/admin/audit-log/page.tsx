'use client';

import { ROUTES } from '@/config/constants';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { AuditLogView } from '@/components/settings/audit-log/AuditLogView';

export default function AuditLogPage() {
    return (
        <AdminPageShell
            loadingMessage="Loading the audit log..."
            breadcrumbs={[{ label: 'Admin', href: ROUTES.ADMIN }, { label: 'Audit Log' }]}
            deniedMessage="Only administrators can see the audit log. Ask an Admin or Super Admin for access."
        >
            <AuditLogView />
        </AdminPageShell>
    );
}
