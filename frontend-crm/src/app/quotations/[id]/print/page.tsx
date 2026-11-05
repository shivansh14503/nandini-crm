'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { AppToast } from '@/components/common/AppToast';
import { PdfViewerPage } from '@/components/pdf/PdfViewerPage';
import { pdfErrorMessage, saveBlob } from '@/components/pdf/usePdfActions';
import { useSelectedPdfTemplate } from '@/components/pdf/useSelectedPdfTemplate';
import { usePdfTemplates } from '@/hooks/queries/usePdfTemplates';
import { useQuotation } from '@/hooks/queries/useQuotations';
import { pdfTemplateService } from '@/services/pdfTemplate.service';

const MODULE = 'QUOTATION' as const;

function QuotationPrintContent() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const id = (params?.id as string) || '';
    const { user, loading: authLoading, isAuthenticated } = useAuth();

    const templatesQuery = usePdfTemplates({ module: MODULE }, { enabled: isAuthenticated });
    const { selected, select } = useSelectedPdfTemplate(MODULE, templatesQuery.data, searchParams.get('templateId'));
    const quotationQuery = useQuotation(id);
    const templateId = selected?.id;

    const [attempt, setAttempt] = useState(0);
    /** Result of the latest request, tagged with its key so a stale result reads as "loading". */
    const [result, setResult] = useState<{ key: string; url?: string; error?: string } | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const requestKey = templateId ? `${templateId}:${attempt}` : null;

    useEffect(() => {
        if (!authLoading && !isAuthenticated) router.push(ROUTES.LOGIN);
    }, [authLoading, isAuthenticated, router]);

    // Fetch (and re-fetch on template change / retry); the previous blob URL is revoked when replaced.
    useEffect(() => {
        if (!isAuthenticated || !id || !templateId || !requestKey) return;
        const controller = new AbortController();
        pdfTemplateService
            .fetchRecordPdf(MODULE, id, templateId, 'inline', controller.signal)
            .then(({ blob }) => {
                const url = URL.createObjectURL(blob);
                setResult((previous) => {
                    if (previous?.url) URL.revokeObjectURL(previous.url);
                    return { key: requestKey, url };
                });
            })
            .catch((err: unknown) => {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                setResult((previous) => {
                    if (previous?.url) URL.revokeObjectURL(previous.url);
                    return { key: requestKey, error: pdfErrorMessage(err) };
                });
            });
        return () => controller.abort();
    }, [id, isAuthenticated, requestKey, templateId]);

    const configError = templatesQuery.isError
        ? pdfErrorMessage(templatesQuery.error, 'PDF templates could not be loaded.')
        : templatesQuery.isSuccess && !templateId
          ? 'No active PDF templates are available. Ask an administrator to activate one.'
          : null;
    const current = result && result.key === requestKey ? result : null;
    const error = configError ?? current?.error ?? null;
    const loading = !configError && !current;
    const pdfUrl = current?.url ?? null;

    // Revoke the current blob URL when the page unmounts.
    const pdfUrlRef = useRef<string | null>(null);
    useEffect(() => {
        pdfUrlRef.current = result?.url ?? null;
    }, [result]);
    useEffect(
        () => () => {
            if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
        },
        [],
    );

    const changeTemplate = useCallback(
        (nextId: string) => {
            select(nextId);
            router.replace(ROUTES.QUOTATION_PRINT(id, nextId));
        },
        [id, router, select],
    );

    const download = useCallback(async () => {
        if (!templateId) return;
        setDownloading(true);
        try {
            const { blob, fileName } = await pdfTemplateService.fetchRecordPdf(MODULE, id, templateId, 'attachment');
            saveBlob(blob, fileName);
        } catch (err) {
            setToast(pdfErrorMessage(err));
        } finally {
            setDownloading(false);
        }
    }, [id, templateId]);

    const print = useCallback(() => {
        try {
            const win = iframeRef.current?.contentWindow;
            if (!win) throw new Error('not ready');
            win.focus();
            win.print();
        } catch {
            setToast('Use the print button in the PDF viewer toolbar to print this document.');
        }
    }, []);

    const close = useCallback(() => {
        window.close();
        // window.close() is ignored for tabs the script didn't open; fall back to the quotation.
        window.setTimeout(() => router.push(ROUTES.QUOTATION_DETAIL(id)), 150);
    }, [id, router]);

    if (authLoading) return <LoadingScreen message="Loading..." />;
    if (!user) return null;

    const quotation = quotationQuery.data;
    const title = quotation ? `${quotation.quotationCode} · ${quotation.quotationTitle}` : 'Quotation PDF';
    const subtitle = quotation ? [quotation.organizationName || quotation.contactName, selected?.name].filter(Boolean).join(' · ') : selected?.name;

    return (
        <>
            <PdfViewerPage
                title={title}
                subtitle={subtitle}
                templates={templatesQuery.data ?? []}
                templateId={templateId}
                onTemplateChange={changeTemplate}
                pdfUrl={pdfUrl}
                loading={loading}
                error={error}
                onRetry={() => setAttempt((n) => n + 1)}
                onDownload={() => void download()}
                onPrint={print}
                onBack={() => router.push(ROUTES.QUOTATION_DETAIL(id))}
                onClose={close}
                downloading={downloading}
                iframeRef={iframeRef}
            />
            <AppToast open={Boolean(toast)} message={toast ?? ''} severity="error" onClose={() => setToast(null)} />
        </>
    );
}

export default function QuotationPrintPage() {
    return (
        <Suspense fallback={<LoadingScreen message="Loading PDF..." />}>
            <QuotationPrintContent />
        </Suspense>
    );
}
