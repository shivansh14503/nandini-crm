'use client';

import { ROUTES } from '@/config/constants';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { PdfTemplatesListView } from '@/components/pdf/admin/PdfTemplatesListView';

export default function PdfTemplatesPage() {
    return (
        <AdminPageShell
            loadingMessage="Loading PDF templates..."
            breadcrumbs={[{ label: 'Administration', href: ROUTES.ADMIN }, { label: 'PDF Templates' }]}
        >
            <PdfTemplatesListView />
        </AdminPageShell>
    );
}
