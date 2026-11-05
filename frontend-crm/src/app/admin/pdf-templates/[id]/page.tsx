'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { ROUTES } from '@/config/constants';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { PdfTemplateEditor } from '@/components/pdf/editor/PdfTemplateEditor';

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
            <PdfTemplateEditor templateId={id} />
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
