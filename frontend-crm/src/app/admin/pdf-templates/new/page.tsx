'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ROUTES } from '@/config/constants';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { AdminPageShell } from '@/components/pdf/admin/AdminPageShell';
import { PdfTemplateEditor } from '@/components/pdf/editor/PdfTemplateEditor';
import { PDF_MODULES, type PdfModule } from '@/types/pdfTemplate.types';

function NewPdfTemplateContent() {
    const searchParams = useSearchParams();
    const moduleParam = searchParams.get('module');
    const pdfModule: PdfModule = (PDF_MODULES as readonly string[]).includes(moduleParam ?? '') ? (moduleParam as PdfModule) : 'QUOTATION';
    return (
        <AdminPageShell
            loadingMessage="Loading editor..."
            footer={false}
            maxWidth={false}
            breadcrumbs={[{ label: 'Administration', href: ROUTES.ADMIN }, { label: 'PDF Templates', href: ROUTES.PDF_TEMPLATES }, { label: 'New template' }]}
        >
            <PdfTemplateEditor module={pdfModule} sourceTemplateId={searchParams.get('from')} />
        </AdminPageShell>
    );
}

export default function NewPdfTemplatePage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading editor..." />}>
            <NewPdfTemplateContent />
        </Suspense>
    );
}
