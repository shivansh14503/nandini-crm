'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { ROUTES } from '@/config/constants';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { PdfTemplateBuilder } from '@/components/pdf/builder/PdfTemplateBuilder';

function EditPdfTemplateContent() {
    const params = useParams();
    const id = (params?.id as string) || '';
    return (
        <AdminPageShell
            loadingMessage="Loading template..."
            footer={false}
            maxWidth={false}
            breadcrumbs={[{ label: 'Administration', href: ROUTES.ADMIN }, { label: 'PDF Templates', href: ROUTES.PDF_TEMPLATES }, { label: 'Edit template' }]}
        >
            <PdfTemplateBuilder templateId={id} />
        </AdminPageShell>
    );
}

export default function EditPdfTemplatePage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading template..." />}>
            <EditPdfTemplateContent />
        </Suspense>
    );
}
