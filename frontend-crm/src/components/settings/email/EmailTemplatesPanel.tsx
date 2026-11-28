'use client';

import React, { useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Skeleton, TextField, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { AppToast } from '@/components/common/AppToast';
import { LongTextInput } from '@/components/forms/LongTextInput';
import { ConfirmDeleteDialog, errorMessage, inputSx, panelHeaderSx, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { useLeaveGuard } from '@/components/settings/useLeaveGuard';
import { useEmailTemplates, useResetEmailTemplate, useSaveEmailTemplate } from '@/hooks/queries/useEmailAdmin';
import { emailAdminService } from '@/services/emailAdmin.service';
import { ApiClientError } from '@/services/apiClient';
import type { EmailTemplateContent, EmailTemplateDto, EmailTemplateKey, RenderedEmailPreview } from '@/types/emailAdmin.types';
import { fmtInstant } from '@/utils/formats';
import { buttonSize, fieldLabelSx, hintSx, StatusChip } from './emailUi';

type FieldKey = keyof EmailTemplateContent;

interface Draft {
    subject: string;
    heading: string;
    body: string;
    buttonLabel: string;
    afterButton: string;
    footer: string;
}

const draftOf = (c: EmailTemplateContent): Draft => ({
    subject: c.subject,
    heading: c.heading,
    body: c.body,
    buttonLabel: c.buttonLabel ?? '',
    afterButton: c.afterButton ?? '',
    footer: c.footer ?? '',
});

const contentOf = (d: Draft): EmailTemplateContent => ({
    subject: d.subject,
    heading: d.heading,
    body: d.body,
    buttonLabel: d.buttonLabel.trim() || null,
    afterButton: d.afterButton.trim() || null,
    footer: d.footer.trim() || null,
});

const sameDraft = (a: Draft, b: Draft) => (Object.keys(a) as (keyof Draft)[]).every((k) => a[k] === b[k]);

function fieldErrorsOf(err: unknown): Record<string, string> {
    if (!(err instanceof ApiClientError)) return {};
    return Object.fromEntries((err.details?.errors ?? []).map((e) => [String(e.path?.[0] ?? ''), e.message]));
}

/** Templates: the wording of each system email, with merge fields, a preview and Reset to default. */
export function EmailTemplatesPanel() {
    const query = useEmailTemplates();
    const theme = useTheme();
    const wide = useMediaQuery(theme.breakpoints.up('md'));
    const [selected, setSelected] = useState<EmailTemplateKey>('user_invite');

    if (query.isPending) return <Skeleton variant="rounded" height={480} sx={{ borderRadius: '12px' }} aria-busy="true" />;
    if (!query.data) {
        return (
            <Alert severity="error" sx={{ borderRadius: '10px' }} action={<Button size="small" onClick={() => void query.refetch()}>Try again</Button>}>
                {errorMessage(query.error, 'Could not load the email templates.')}
            </Alert>
        );
    }
    const templates = query.data;
    const current = templates.find((t) => t.key === selected) ?? templates[0];

    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '280px minmax(0, 1fr)' }, gap: 2, alignItems: 'start', minWidth: 0 }}>
            {wide ? (
                <Box sx={{ ...surfaceSx, overflow: 'hidden' }} role="listbox" aria-label="Email templates">
                    {templates.map((t) => {
                        const active = t.key === current.key;
                        return (
                            <Box
                                key={t.key}
                                role="option"
                                aria-selected={active}
                                tabIndex={0}
                                onClick={() => setSelected(t.key)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setSelected(t.key);
                                    }
                                }}
                                sx={{
                                    px: 2,
                                    py: 1.5,
                                    cursor: 'pointer',
                                    borderBottom: '1px solid var(--mui-palette-border-light)',
                                    borderLeft: '3px solid',
                                    borderLeftColor: active ? 'var(--crm-text-blue-600)' : 'transparent',
                                    backgroundColor: active ? 'var(--mui-palette-primary-soft)' : 'transparent',
                                    transition: 'all 0.15s ease',
                                    '&:hover': { backgroundColor: active ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-hover)' },
                                    '&:focus-visible': { outline: 'none', boxShadow: 'inset 0 0 0 2px rgb(var(--crm-accent-rgb) / 0.35)' },
                                }}
                            >
                                <Typography sx={{ fontWeight: 600, fontSize: '0.84rem', color: active ? 'var(--crm-text-blue-900)' : 'var(--crm-slate-900)' }}>{t.name}</Typography>
                                <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
                                    {t.status === 'reserved' && <StatusChip tone="neutral">Reserved</StatusChip>}
                                    {t.customised ? <StatusChip tone="info">Edited</StatusChip> : <StatusChip tone="neutral">Default</StatusChip>}
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            ) : (
                <TextField select size="small" label="Template" value={current.key} onChange={(e) => setSelected(e.target.value as EmailTemplateKey)} sx={inputSx} fullWidth>
                    {templates.map((t) => (
                        <MenuItem key={t.key} value={t.key}>
                            {t.name}
                            {t.status === 'reserved' ? ' (reserved)' : ''}
                        </MenuItem>
                    ))}
                </TextField>
            )}
            {/* Remount per template so its draft starts from that template. */}
            <TemplateEditor key={`${current.key}:${current.updatedAt ?? 'default'}`} template={current} />
        </Box>
    );
}

function TemplateEditor({ template }: { template: EmailTemplateDto }) {
    const save = useSaveEmailTemplate();
    const reset = useResetEmailTemplate();
    const [draft, setDraft] = useState<Draft>(() => draftOf(template.content));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [lastField, setLastField] = useState<FieldKey>('body');
    const [preview, setPreview] = useState<RenderedEmailPreview | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [testing, setTesting] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

    const saved = draftOf(template.content);
    const dirty = !sameDraft(draft, saved);
    useLeaveGuard(dirty, 'You have unsaved template changes. Leave this page and lose them?');

    const set = (key: keyof Draft, value: string) => {
        setDraft((d) => ({ ...d, [key]: value }));
        setErrors((e) => ({ ...e, [key]: '' }));
    };

    const insertTag = (tag: string) => {
        const field = lastField === 'buttonLabel' && !template.hasLink ? 'body' : lastField;
        setDraft((d) => {
            const text = d[field] ?? '';
            return { ...d, [field]: `${text}${text && !/\s$/.test(text) ? ' ' : ''}{{${tag}}}` };
        });
    };

    const onSave = async () => {
        setErrors({});
        try {
            await save.mutateAsync({ key: template.key, content: contentOf(draft) });
            setToast({ open: true, message: 'Template saved.', severity: 'success' });
        } catch (err) {
            setErrors(fieldErrorsOf(err));
            setToast({ open: true, message: errorMessage(err, 'Could not save the template.'), severity: 'error' });
        }
    };

    const onReset = async () => {
        setConfirmReset(false);
        try {
            const dto = await reset.mutateAsync(template.key);
            setDraft(draftOf(dto.content));
            setToast({ open: true, message: 'Template reset to the default wording.', severity: 'success' });
        } catch (err) {
            setToast({ open: true, message: errorMessage(err, 'Could not reset the template.'), severity: 'error' });
        }
    };

    const onPreview = async () => {
        setPreviewing(true);
        try {
            setPreview(await emailAdminService.previewTemplate(template.key, contentOf(draft)));
        } catch (err) {
            setErrors(fieldErrorsOf(err));
            setToast({ open: true, message: errorMessage(err, 'Could not build the preview.'), severity: 'error' });
        } finally {
            setPreviewing(false);
        }
    };

    const onTest = async () => {
        setTesting(true);
        try {
            const result = await emailAdminService.sendTemplateTest(template.key);
            setToast({ open: true, message: result.message, severity: result.ok ? 'success' : 'error' });
        } catch (err) {
            setToast({ open: true, message: errorMessage(err, 'The test email could not be sent.'), severity: 'error' });
        } finally {
            setTesting(false);
        }
    };

    const busy = save.isPending || reset.isPending;
    const shortField = (key: 'subject' | 'heading' | 'buttonLabel', label: string, hint?: string) => (
        <Box>
            <Typography component="label" htmlFor={`tpl-${key}`} sx={fieldLabelSx}>
                {label}
            </Typography>
            <TextField
                id={`tpl-${key}`}
                fullWidth
                size="small"
                value={draft[key]}
                onChange={(e) => set(key, e.target.value)}
                onFocus={() => setLastField(key)}
                error={Boolean(errors[key])}
                helperText={errors[key] || hint}
                sx={inputSx}
            />
        </Box>
    );
    const longField = (key: 'body' | 'afterButton' | 'footer', label: string, hint: string) => (
        <Box onFocusCapture={() => setLastField(key)}>
            <Typography sx={fieldLabelSx}>{label}</Typography>
            <LongTextInput label={label} value={draft[key]} onChange={(v) => set(key, v)} error={errors[key] || undefined} helperText={hint} crmFieldStyle={false} sx={inputSx} />
        </Box>
    );

    return (
        <Box sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
            <Box sx={{ ...panelHeaderSx, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--crm-slate-900)' }}>{template.name}</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25 }}>{template.description}</Typography>
                </Box>
                {template.status === 'reserved' && <StatusChip tone="neutral">Reserved: not sent yet</StatusChip>}
            </Box>
            <Box sx={{ p: { xs: 2, md: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                    <Typography sx={fieldLabelSx}>Merge fields</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        {template.mergeFields.map((f) => (
                            <Tooltip key={f.key} title={`${f.label}, e.g. ${f.sample}`} arrow>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => insertTag(f.key)}
                                    sx={{ ...secondaryButtonSx, minHeight: 32, fontFamily: 'Consolas, Menlo, monospace', fontWeight: 500, fontSize: '0.74rem', py: 0.25 }}
                                >
                                    {`{{${f.key}}}`}
                                </Button>
                            </Tooltip>
                        ))}
                    </Box>
                    <Typography sx={hintSx}>Tap a field to add it where you were last typing. Values are filled in when the email is sent.</Typography>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                    {shortField('subject', 'Subject *')}
                    {shortField('heading', 'Heading *')}
                </Box>
                {longField('body', 'Message *', 'Leave a blank line between paragraphs.')}
                {template.hasLink && (
                    <>
                        {shortField('buttonLabel', 'Button label *', 'The button opens the link. The link is also printed under it for mail apps that block buttons.')}
                        {longField('afterButton', 'Text below the button', 'Optional.')}
                    </>
                )}
                {longField('footer', 'Footer', template.hasLink ? 'Optional. A fixed line asking people not to forward the email is always added.' : 'Optional.')}

                <Typography sx={{ ...hintSx, mt: 0 }}>
                    {template.customised
                        ? `Edited${template.updatedBy ? ` by ${template.updatedBy}` : ''}${template.updatedAt ? ` on ${fmtInstant(template.updatedAt)}` : ''}.`
                        : 'Using the default wording.'}
                </Typography>

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    <Button variant="outlined" sx={{ ...secondaryButtonSx, ...buttonSize, flex: { xs: '1 1 45%', sm: 'none' } }} onClick={onPreview} disabled={previewing}>
                        {previewing ? 'Loading…' : 'Preview'}
                    </Button>
                    <Button variant="outlined" sx={{ ...secondaryButtonSx, ...buttonSize, flex: { xs: '1 1 45%', sm: 'none' } }} onClick={onTest} disabled={testing || dirty}>
                        {testing ? 'Sending…' : 'Send test to me'}
                    </Button>
                    <Button
                        variant="outlined"
                        sx={{ ...secondaryButtonSx, ...buttonSize, flex: { xs: '1 1 45%', sm: 'none' } }}
                        onClick={() => setConfirmReset(true)}
                        disabled={busy || !template.customised}
                    >
                        Reset to default
                    </Button>
                    <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
                    <Button variant="outlined" sx={{ ...secondaryButtonSx, ...buttonSize, flex: { xs: '1 1 45%', sm: 'none' } }} disabled={!dirty || busy} onClick={() => setDraft(saved)}>
                        Cancel
                    </Button>
                    <Button variant="contained" sx={{ ...primaryButtonSx, ...buttonSize, flex: { xs: '1 1 100%', sm: 'none' } }} disabled={!dirty || busy} onClick={onSave}>
                        {save.isPending ? 'Saving…' : 'Save template'}
                    </Button>
                </Box>
            </Box>

            <Dialog open={Boolean(preview)} onClose={() => setPreview(null)} fullWidth maxWidth="md" sx={{ '& .MuiDialog-paper': { m: { xs: 1, sm: 4 }, width: { xs: 'calc(100% - 16px)', sm: undefined } } }}>
                <DialogTitle sx={{ fontSize: '0.95rem', fontWeight: 700, overflowWrap: 'anywhere' }}>{preview?.subject}</DialogTitle>
                <DialogContent dividers sx={{ p: 0, backgroundColor: 'var(--mui-palette-background-subtle)' }}>
                    {preview && (
                        // The email's own HTML (rendered and escaped by the server), sandboxed: no scripts, no navigation.
                        <Box component="iframe" title="Email preview" sandbox="" srcDoc={preview.html} sx={{ display: 'block', width: '100%', height: { xs: '65vh', md: '70vh' }, border: 0 }} />
                    )}
                </DialogContent>
                <DialogActions>
                    <Typography sx={{ ...hintSx, mt: 0, flex: 1, px: 1 }}>Shown with sample values.</Typography>
                    <Button variant="outlined" sx={{ ...secondaryButtonSx, ...buttonSize }} onClick={() => setPreview(null)}>
                        Close
                    </Button>
                </DialogActions>
            </Dialog>

            <ConfirmDeleteDialog
                open={confirmReset}
                title="Reset to the default wording?"
                confirmLabel="Reset"
                onConfirm={onReset}
                onClose={() => setConfirmReset(false)}
            >
                Your wording of &ldquo;{template.name}&rdquo; is replaced by the built-in one.
            </ConfirmDeleteDialog>

            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} autoHideDuration={6000} />
        </Box>
    );
}
