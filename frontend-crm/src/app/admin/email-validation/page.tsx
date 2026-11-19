'use client';

import { ROUTES } from '@/config/constants';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { EmailValidationView } from '@/components/settings/email-validation/EmailValidationView';

export default function EmailValidationPage() {
    return (
        <AdminPageShell
            loadingMessage="Loading email validation..."
            breadcrumbs={[{ label: 'Administration', href: ROUTES.ADMIN }, { label: 'Email Validation' }]}
            deniedMessage="Only administrators can manage email validation. Ask an Admin or Super Admin for access."
        >
            <EmailValidationView />
        </AdminPageShell>
    );
}
