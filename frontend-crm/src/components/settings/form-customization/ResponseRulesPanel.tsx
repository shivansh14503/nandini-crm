'use client';

import React, { useMemo } from 'react';
import { Box, Button, Checkbox, Tooltip, Typography } from '@mui/material';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { DropdownOptionDto, FormConfigsPayload } from '@/types/formConfig.types';
import {
    allowedStagesFromMeta,
    CLOSED_STAGES,
    isStageAllowed,
    NO_FOLLOW_UP_META_KEY,
    noFollowUpFromMeta,
    OPPORTUNITY_STAGES_META_KEY,
    opportunityResponseConfig,
} from '@/utils/opportunityResponseRules';
import { Badge, EmptyState, errorMessage, LabeledSwitch, panelHeaderSx, secondaryButtonSx, surfaceSx } from './builderUi';
import { useConfigDraftActions, useHasUnsavedChanges } from './useConfigDraft';

const headSx = { fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--mui-palette-text-secondary)' } as const;
const checkboxSx = { p: 0.75, '& .MuiSvgIcon-root': { fontSize: 20 } } as const;

export interface ResponseRulesPanelProps {
    configs: FormConfigsPayload;
    canEdit: boolean;
    notify: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
    /** Opens the Dropdowns view, where Customer Response and Sales Stage options are added, renamed or deleted. */
    onManageOptions: () => void;
}

/**
 * Form Builder › Opportunities › Response Rules: which Customer Responses each open Sales Stage offers, and which
 * responses take no further follow-up. Stored on the response options' meta (`opportunityStages`, `noFollowUp`); a
 * response ticked at every stage stores none, so stages added later offer it too. Edits go into the page's draft
 * and are saved with "Save Changes". The server applies the same rules (opportunity.followUp.ts).
 */
export function ResponseRulesPanel({ configs, canEdit, notify, onManageOptions }: ResponseRulesPanelProps) {
    const draft = useConfigDraftActions();
    const rules = useMemo(() => opportunityResponseConfig(configs), [configs]);
    const responses = (rules.responseCategory?.options ?? []).filter((o) => o.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    const stages = (rules.stageCategory?.options ?? [])
        .filter((o) => o.isActive && !CLOSED_STAGES.has(o.value))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    const grid = `minmax(170px, 1.6fr) repeat(${stages.length}, minmax(76px, 1fr)) minmax(96px, 0.8fr)`;
    const minWidth = 200 + stages.length * 84 + 110;

    const setMeta = (option: DropdownOptionDto, key: string, value: unknown) => {
        try {
            const meta = { ...(option.meta ?? {}) };
            if (value === undefined) delete meta[key];
            else meta[key] = value;
            draft.updateOption(option.id, { meta });
        } catch (err) {
            notify(errorMessage(err), 'error');
        }
    };
    const toggleStage = (option: DropdownOptionDto, stage: string, on: boolean) => {
        const current = stages.filter((s) => isStageAllowed(option, s.value)).map((s) => s.value);
        const next = on ? [...current, stage] : current.filter((s) => s !== stage);
        // Every open stage: no list, so stages added later offer the response too.
        setMeta(option, OPPORTUNITY_STAGES_META_KEY, next.length === stages.length ? undefined : stages.map((s) => s.value).filter((s) => next.includes(s)));
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 0.5 }}>
                <InfoOutlinedIcon sx={{ fontSize: 18, mt: 0.15, color: 'var(--mui-palette-text-muted)' }} />
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>
                    On an opportunity edit, the <strong>Sales Stage</strong> decides which <strong>Customer Responses</strong> can be picked; changing the
                    stage clears a response that doesn&apos;t fit. <strong>Closed Won</strong> and <strong>Closed Lost</strong> take no response and no next
                    follow-up. The same list is used on Leads, where each option sets the Rating.
                </Typography>
            </Box>

            <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
                <Box sx={{ ...panelHeaderSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>Customer Response by Sales Stage</Typography>
                        <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>
                            Tick the stages a response can be picked at. A response ticked at every stage also shows at stages added later.
                        </Typography>
                    </Box>
                    <Button variant="outlined" size="small" startIcon={<ListAltOutlinedIcon sx={{ fontSize: 16 }} />} onClick={onManageOptions} sx={secondaryButtonSx}>
                        Manage options
                    </Button>
                </Box>

                {responses.length === 0 || stages.length === 0 ? (
                    <EmptyState
                        title={responses.length === 0 ? 'No Customer Response options' : 'No open Sales Stages'}
                        description="Add the options in Dropdowns."
                    />
                ) : (
                    <Box sx={{ overflowX: 'auto' }}>
                        <Box sx={{ minWidth }}>
                            <Box sx={{ display: 'grid', gridTemplateColumns: grid, gap: 1, alignItems: 'end', px: 2, py: 1, borderBottom: '1px solid var(--mui-palette-border-light)' }}>
                                <Typography sx={headSx}>Customer Response</Typography>
                                {stages.map((s) => (
                                    <Typography key={s.id} sx={{ ...headSx, textAlign: 'center', overflowWrap: 'anywhere' }}>
                                        {s.label}
                                    </Typography>
                                ))}
                                <Tooltip title="Picking it removes the next follow-up (the response is kept)." arrow disableInteractive>
                                    <Typography sx={{ ...headSx, textAlign: 'center' }}>No follow-up</Typography>
                                </Tooltip>
                            </Box>
                            {responses.map((option) => (
                                <ResponseRow
                                    key={option.id}
                                    option={option}
                                    stages={stages}
                                    grid={grid}
                                    canEdit={canEdit}
                                    onToggleStage={(stage, on) => toggleStage(option, stage, on)}
                                    onNoFollowUp={(on) => setMeta(option, NO_FOLLOW_UP_META_KEY, on ? true : undefined)}
                                />
                            ))}
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
}

function ResponseRow({
    option,
    stages,
    grid,
    canEdit,
    onToggleStage,
    onNoFollowUp,
}: {
    option: DropdownOptionDto;
    stages: DropdownOptionDto[];
    grid: string;
    canEdit: boolean;
    onToggleStage: (stage: string, on: boolean) => void;
    onNoFollowUp: (on: boolean) => void;
}) {
    const unsaved = useHasUnsavedChanges(option.id);
    const everyStage = allowedStagesFromMeta(option.meta) === null;
    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: grid,
                gap: 1,
                alignItems: 'center',
                px: 2,
                py: 0.5,
                borderBottom: '1px solid var(--mui-palette-border-light)',
                '&:last-of-type': { borderBottom: 'none' },
                '&:hover': { backgroundColor: 'var(--mui-palette-background-hover)' },
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>{option.label}</Typography>
                {everyStage && <Badge tone="neutral" title="Offered at every open stage, including stages added later">Every stage</Badge>}
                {unsaved && <Badge tone="unsaved">Unsaved</Badge>}
            </Box>
            {stages.map((stage) => (
                <Box key={stage.id} sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Checkbox
                        checked={isStageAllowed(option, stage.value)}
                        disabled={!canEdit}
                        onChange={(e) => onToggleStage(stage.value, e.target.checked)}
                        sx={checkboxSx}
                        slotProps={{ input: { 'aria-label': `${option.label} at ${stage.label}` } }}
                    />
                </Box>
            ))}
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <LabeledSwitch checked={noFollowUpFromMeta(option.meta)} onChange={onNoFollowUp} disabled={!canEdit} label={`${option.label} takes no follow-up`} />
            </Box>
        </Box>
    );
}
