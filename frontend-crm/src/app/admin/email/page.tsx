'use client';

import { Suspense } from 'react';
import { ROUTES } from '@/config/constants';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { EmailAdminView } from '@/components/settings/email/EmailAdminView';

export default function EmailAdminPage() {
    return (
        <AdminPageShell
            loadingMessage="Loading email settings..."
            breadcrumbs={[{ label: 'Admin', href: ROUTES.ADMIN }, { label: 'Email' }]}
            deniedMessage="Only administrators can manage email. Ask an Admin or Super Admin for access."
        >
            <Suspense fallback={null}>
                <EmailAdminView />
            </Suspense>
        </AdminPageShell>
    );
}
