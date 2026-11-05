'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { ApiClientError } from '@/services/apiClient';
import { pdfTemplateService } from '@/services/pdfTemplate.service';
import type { ApiFieldError } from '@/types/api.types';
import type { PdfTemplateDraft } from '@/types/pdfTemplate.types';
import { panelHeaderSx, primaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { QuotationPicker, type PickedRecord } from './QuotationPicker';

const DEBOUNCE_MS = 600;

interface PreviewProblem {
    message: string;
    errors: ApiFieldError[];
}

const toProblem = (err: unknown): PreviewProblem =>
    err instanceof ApiClientError
        ? { message: err.message, errors: err.details?.errors ?? [] }
        : { message: err instanceof Error ? err.message : 'Preview failed.', errors: [] };

/** Debounced copy of `value` (only updates after `delay` ms without changes). */
function useDebounced<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

/**
 * Right-hand preview: fast HTML (sandboxed `srcdoc`, debounced, last request wins) or a full PDF render, for
 * the sample data or a picked quotation. Compile errors (422) are listed with their part / line / column.
 */
export function LivePreviewPane({ draft, draftKey }: { draft: PdfTemplateDraft; draftKey: string }) {
    const [mode, setMode] = useState<'html' | 'pdf'>('html');
    const [record, setRecord] = useState<PickedRecord | null>(null);
    const recordId = record?.id;
    const debouncedKey = useDebounced(`${draftKey}|${recordId ?? ''}`, DEBOUNCE_MS);
    const draftRef = useRef(draft);
    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);

    const [htmlResult, setHtmlResult] = useState<{ key: string; html?: string; problem?: PreviewProblem } | null>(null);
    const [pdfState, setPdfState] = useState<{ url?: string; loading: boolean; problem?: PreviewProblem }>({ loading: false });
    const pdfAbort = useRef<AbortController | null>(null);

    // HTML fast preview: one request per debounced change; the previous one is aborted (last request wins).
    useEffect(() => {
        if (mode !== 'html') return;
        const controller = new AbortController();
        pdfTemplateService
            .previewHtml(draftRef.current, recordId, controller.signal)
            .then((html) => setHtmlResult({ key: debouncedKey, html }))
            .catch((err: unknown) => {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                setHtmlResult({ key: debouncedKey, problem: toProblem(err) });
            });
        return () => controller.abort();
        // recordId is part of debouncedKey.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedKey, mode]);

    useEffect(
        () => () => {
            pdfAbort.current?.abort();
            if (pdfState.url) URL.revokeObjectURL(pdfState.url);
        },
        [pdfState.url],
    );

    const renderPdf = async () => {
        pdfAbort.current?.abort();
        const controller = new AbortController();
        pdfAbort.current = controller;
        setMode('pdf');
        setPdfState((s) => ({ ...s, loading: true, problem: undefined }));
        try {
            const blob = await pdfTemplateService.previewPdf(draftRef.current, recordId, controller.signal);
            setPdfState({ url: URL.createObjectURL(blob), loading: false });
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            setPdfState((s) => ({ ...s, loading: false, problem: toProblem(err) }));
        }
    };

    const htmlCurrent = htmlResult && htmlResult.key === debouncedKey ? htmlResult : null;
    const htmlLoading = mode === 'html' && !htmlCurrent;
    const problem = mode === 'html' ? htmlResult?.problem : pdfState.problem;
    const loading = mode === 'html' ? htmlLoading : pdfState.loading;
    const lastHtml = htmlResult?.html;

    return (
        <Box sx={{ ...surfaceSx, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden' }}>
            <Box sx={{ ...panelHeaderSx, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', mr: 'auto' }}>Live preview</Typography>
                <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={mode}
                    onChange={(_e, next: 'html' | 'pdf' | null) => next && setMode(next)}
                    aria-label="Preview mode"
                    sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: '0.75rem', py: 0.25, px: 1.25 } }}
                >
                    <ToggleButton value="html">HTML (fast)</ToggleButton>
                    <ToggleButton value="pdf">PDF</ToggleButton>
                </ToggleButtonGroup>
                <Button
                    size="small"
                    variant="contained"
                    startIcon={pdfState.loading ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <PictureAsPdfOutlinedIcon sx={{ fontSize: 16 }} />}
                    onClick={() => void renderPdf()}
                    disabled={pdfState.loading}
                    sx={{ ...primaryButtonSx, height: 30 }}
                >
                    Render PDF
                </Button>
            </Box>
            <Box sx={{ px: 2, py: 1, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={record ? 'record' : 'sample'}
                    onChange={(_e, next: 'sample' | 'record' | null) => {
                        if (next === 'sample') setRecord(null);
                    }}
                    aria-label="Preview data"
                    sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: '0.75rem', py: 0.25, px: 1.25 } }}
                >
                    <ToggleButton value="sample">Sample data</ToggleButton>
                    <ToggleButton value="record" disabled={!record}>
                        Record
                    </ToggleButton>
                </ToggleButtonGroup>
                <Box sx={{ flex: '1 1 220px' }}>
                    <QuotationPicker value={record} onChange={setRecord} />
                </Box>
            </Box>

            {problem && (
                <Alert severity="error" sx={{ m: 1.5, mb: 0, borderRadius: '8px', fontSize: '0.78rem' }}>
                    <Box sx={{ fontWeight: 700 }}>{problem.message}</Box>
                    {problem.errors.length > 1 && (
                        <Box component="ul" sx={{ m: 0, pl: 2 }}>
                            {problem.errors.map((e, i) => (
                                <li key={`${e.path.join('.')}-${i}`}>
                                    <strong>{e.path[0]}</strong>: {e.message}
                                </li>
                            ))}
                        </Box>
                    )}
                </Alert>
            )}

            <Box sx={{ position: 'relative', flex: 1, minHeight: 360, m: 1.5, borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', backgroundColor: '#f1f5f9' }}>
                {loading && (
                    <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.25, borderRadius: '9999px', backgroundColor: 'rgba(255,255,255,0.9)', border: '1px solid #e2e8f0' }}>
                        <CircularProgress size={12} />
                        <Typography sx={{ fontSize: '0.7rem', color: '#475569' }}>Updating…</Typography>
                    </Box>
                )}
                {mode === 'html' ? (
                    lastHtml !== undefined ? (
                        <Box component="iframe" title="HTML preview" sandbox="" srcDoc={lastHtml} sx={{ width: '100%', height: '100%', border: 0, backgroundColor: '#fff' }} />
                    ) : null
                ) : pdfState.url ? (
                    <Box component="iframe" title="PDF preview" src={pdfState.url} sx={{ width: '100%', height: '100%', border: 0, backgroundColor: '#fff' }} />
                ) : (
                    !pdfState.loading && (
                        <Box sx={{ p: 3, textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>Click “Render PDF” to generate the real PDF with Chromium.</Box>
                    )
                )}
            </Box>
        </Box>
    );
}
