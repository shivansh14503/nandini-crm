'use client';

import { ROUTES } from '@/config/constants';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { HolidaysView } from '@/components/settings/holidays/HolidaysView';

export default function HolidaysPage() {
    return (
        <AdminPageShell
            loadingMessage="Loading holidays..."
            breadcrumbs={[{ label: 'Admin', href: ROUTES.ADMIN }, { label: 'Holidays' }]}
            deniedMessage="Only administrators can manage holidays. Ask an Admin or Super Admin for access."
        >
            <HolidaysView />
        </AdminPageShell>
    );
}
