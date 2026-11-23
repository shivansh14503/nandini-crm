'use client';

import React, { useMemo } from 'react';
import { Box, Button, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { RatingBadge } from '@/components/common/RatingBadge';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { DropdownOptionDto, FormConfigsPayload } from '@/types/formConfig.types';
import {
    CLOSES_LEAD_META_KEY,
    CONVERTED_STATUS,
    coldRange,
    DEFAULT_RESPONSE_RULE,
    describeLimits,
    leadRatingConfig,
    MAX_RATING_CALLS,
    MAX_RATING_DAYS,
    NEW_LEAD_RATING_SETTING,
    RATING_RULE_KINDS,
    RATING_RULE_META_KEY,
    RATINGS,
    ratingRuleFromMeta,
    RULE_HINTS,
    RULE_LABELS,
    unitOf,
    type RangedRuleKind,
    type Rating,
    type RatingLimits,
    type RatingRule,
    type RatingRuleKind,
} from '@/utils/leadRating';
import { Badge, EmptyState, errorMessage, inputSx, LabeledSwitch, panelHeaderSx, secondaryButtonSx, surfaceSx } from './builderUi';
import { useConfigDraftActions, useHasUnsavedChanges } from './useConfigDraft';

/** Starting limits when an admin switches an option to a rule (the plan's defaults). */
const RULE_STARTS: Record<RatingRuleKind, RatingRule> = {
    followUpGap: { rule: 'followUpGap', hot: 5, warm: 'noLimit' },
    daysSinceResponse: { rule: 'daysSinceResponse', hot: 6, warm: 14 },
    unansweredCalls: { rule: 'unansweredCalls', hot: 2, warm: 4 },
    always: { rule: 'always', rating: 'Cold' },
};

/** Day / call counts offered in the limit dropdowns (every value up to 60 days or 20 calls, then coarser steps). */
const DAY_STEPS = [...Array.from({ length: 61 }, (_, i) => i), 75, 90, 120, 150, 180, 270, MAX_RATING_DAYS];
const CALL_STEPS = [...Array.from({ length: 20 }, (_, i) => i + 1), 25, 30, 40, MAX_RATING_CALLS];

const OFF = 'off';
const NO_LIMIT = 'noLimit';

const GRID = 'minmax(170px, 1.5fr) minmax(170px, 1fr) minmax(130px, 0.9fr) minmax(150px, 1fr) minmax(90px, 0.6fr)';

const selectSx = { ...inputSx, '& .MuiSelect-select': { py: '6px', fontSize: '0.8rem' } } as const;
const menuItemSx = { fontSize: '0.8rem' } as const;
const headSx = { fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mui-palette-text-secondary)' } as const;

export interface RatingRulesPanelProps {
    configs: FormConfigsPayload;
    canEdit: boolean;
    notify: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
    /** Opens the Dropdowns view, where Customer Response and Status options are added, renamed or deleted. */
    onManageOptions: () => void;
}

/**
 * Form Builder › Leads › Rating Rules: how a lead's Rating (Hot / Warm / Cold) is worked out — the limits for new
 * leads, one rule per Customer Response option, and the statuses that close a lead. Edits go into the page's
 * draft and are saved with "Save Changes". docs/lead-rating-rules.md
 */
export function RatingRulesPanel({ configs, canEdit, notify, onManageOptions }: RatingRulesPanelProps) {
    const draft = useConfigDraftActions();
    const rating = useMemo(() => leadRatingConfig(configs), [configs]);
    const responses = (rating.responseCategory?.options ?? []).filter((o) => o.isActive);
    const statuses = (rating.statusCategory?.options ?? []).filter((o) => o.isActive);

    const run = (action: () => void) => {
        try {
            action();
        } catch (err) {
            notify(errorMessage(err), 'error');
        }
    };
    const setNewLead = (limits: RatingLimits) =>
        run(() => draft.setModuleSetting('leads', NEW_LEAD_RATING_SETTING, limits, `Rating Rules for new leads: ${describeLimits(limits, 'days')}`));
    const setRule = (option: DropdownOptionDto, rule: RatingRule) =>
        run(() => draft.updateOption(option.id, { meta: { ...(option.meta ?? {}), [RATING_RULE_META_KEY]: rule } }));
    const setCloses = (option: DropdownOptionDto, closes: boolean) =>
        run(() => draft.updateOption(option.id, { meta: { ...(option.meta ?? {}), [CLOSES_LEAD_META_KEY]: closes } }));

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 0.5 }}>
                <InfoOutlinedIcon sx={{ fontSize: 18, mt: 0.15, color: 'var(--mui-palette-text-muted)' }} />
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>
                    Every lead gets a <strong>Rating</strong> (Hot, Warm or Cold) worked out by the CRM; it is not on any form. Counts are calendar days
                    (IST). Changes apply from the next save of a lead; leads already ageing keep the limits they started with.
                </Typography>
            </Box>

            {/* ── New leads ── */}
            <Card title="New leads" subtitle="Days from the day a lead is created to its first follow-up.">
                <Box sx={{ overflowX: 'auto' }}>
                    <Box sx={{ minWidth: 640 }}>
                        <HeaderRow first="When" />
                        <Box sx={{ display: 'grid', gridTemplateColumns: GRID, gap: 1.5, alignItems: 'center', px: 2, py: 1.25 }}>
                            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>A lead is created</Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>Days to first follow-up</Typography>
                            <LimitCells kind="newLead" limits={rating.newLeadLimits} disabled={!canEdit} onChange={setNewLead} />
                        </Box>
                    </Box>
                </Box>
            </Card>

            {/* ── Follow-ups ── */}
            <Card
                title="Follow-ups"
                subtitle="The Customer Response a user records sets the Rating. Options added in Dropdowns appear here with the default rule until you change it."
                action={
                    <Button variant="outlined" size="small" startIcon={<ListAltOutlinedIcon sx={{ fontSize: 16 }} />} onClick={onManageOptions} sx={secondaryButtonSx}>
                        Manage options
                    </Button>
                }
            >
                {responses.length === 0 ? (
                    <EmptyState
                        title="No Customer Response options"
                        description="The leads Customer Response field has no list linked, or the list is empty. Add options in Dropdowns."
                    />
                ) : (
                    <Box sx={{ overflowX: 'auto' }}>
                        <Box sx={{ minWidth: 760 }}>
                            <HeaderRow first="Customer Response" />
                            {responses.map((option) => (
                                <ResponseRow key={option.id} option={option} canEdit={canEdit} onChange={(rule) => setRule(option, rule)} />
                            ))}
                        </Box>
                    </Box>
                )}
                <Box sx={{ px: 2, py: 1.25, borderTop: '1px solid var(--mui-palette-border-light)', display: 'grid', gap: 0.4 }}>
                    {RATING_RULE_KINDS.map((kind) => (
                        <Typography key={kind} sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                            <strong style={{ color: 'var(--crm-slate-700)' }}>{RULE_LABELS[kind]}</strong> — {RULE_HINTS[kind]}
                            {kind === 'unansweredCalls' ? '; any other response resets the count.' : '.'}
                        </Typography>
                    ))}
                    <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                        <strong style={{ color: 'var(--crm-slate-700)' }}>Cold</strong> is everything after Warm, so the ranges never leave a gap.
                    </Typography>
                </Box>
            </Card>

            {/* ── Closing statuses ── */}
            <Card title="Statuses that close a lead" subtitle="Moving a lead to one of these keeps its Rating as it is and removes its next follow-up.">
                {statuses.length === 0 ? (
                    <EmptyState title="No Status options" description="Add the lead statuses in Dropdowns." />
                ) : (
                    <Box>
                        {statuses.map((option) => (
                            <StatusRow key={option.id} option={option} canEdit={canEdit} closes={rating.closingStatuses.has(option.value)} onChange={(closes) => setCloses(option, closes)} />
                        ))}
                    </Box>
                )}
            </Card>
        </Box>
    );
}

function Card({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
            <Box sx={{ ...panelHeaderSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>{title}</Typography>
                    <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>{subtitle}</Typography>
                </Box>
                {action}
            </Box>
            {children}
        </Box>
    );
}

function HeaderRow({ first }: { first: string }) {
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: GRID, gap: 1.5, px: 2, py: 0.9, borderBottom: '1px solid var(--mui-palette-border-light)' }}>
            <Typography sx={headSx}>{first}</Typography>
            <Typography sx={headSx}>Rule</Typography>
            <RatingHead rating="Hot" />
            <RatingHead rating="Warm" />
            <RatingHead rating="Cold" />
        </Box>
    );
}

function RatingHead({ rating }: { rating: Rating }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <RatingBadge rating={rating} variant="small" />
        </Box>
    );
}

function ResponseRow({ option, canEdit, onChange }: { option: DropdownOptionDto; canEdit: boolean; onChange: (rule: RatingRule) => void }) {
    const stored = ratingRuleFromMeta(option.meta);
    const rule = stored ?? DEFAULT_RESPONSE_RULE;
    const unsaved = useHasUnsavedChanges(option.id);
    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: 1.5,
                alignItems: 'center',
                px: 2,
                py: 1,
                borderBottom: '1px solid var(--mui-palette-border-light)',
                '&:last-of-type': { borderBottom: 'none' },
                '&:hover': { backgroundColor: 'var(--mui-palette-background-hover)' },
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>{option.label}</Typography>
                {!stored && <Badge tone="neutral" title="No rule set yet: rates with Follow-up gap, Hot 0–5 days, then Warm">Default</Badge>}
                {unsaved && <Badge tone="unsaved">Unsaved</Badge>}
            </Box>
            <TextField
                select
                size="small"
                value={rule.rule}
                disabled={!canEdit}
                onChange={(e) => onChange(e.target.value === rule.rule ? rule : RULE_STARTS[e.target.value as RatingRuleKind])}
                sx={selectSx}
                slotProps={{ htmlInput: { 'aria-label': `Rule for ${option.label}` } }}
            >
                {RATING_RULE_KINDS.map((kind) => (
                    <MenuItem key={kind} value={kind} sx={menuItemSx}>
                        <Tooltip title={RULE_HINTS[kind]} placement="right" arrow disableInteractive>
                            <span>{RULE_LABELS[kind]}</span>
                        </Tooltip>
                    </MenuItem>
                ))}
            </TextField>
            {rule.rule === 'always' ? (
                <Box sx={{ gridColumn: '3 / span 3', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TextField
                        select
                        size="small"
                        value={rule.rating}
                        disabled={!canEdit}
                        onChange={(e) => onChange({ rule: 'always', rating: e.target.value as Rating })}
                        sx={{ ...selectSx, minWidth: 130 }}
                        slotProps={{ htmlInput: { 'aria-label': `Rating for ${option.label}` } }}
                    >
                        {RATINGS.map((r) => (
                            <MenuItem key={r} value={r} sx={menuItemSx}>
                                {r}
                            </MenuItem>
                        ))}
                    </TextField>
                    <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-muted)' }}>whatever the dates</Typography>
                </Box>
            ) : (
                <LimitCells kind={rule.rule} limits={rule} disabled={!canEdit} onChange={(limits) => onChange({ rule: rule.rule as RangedRuleKind, ...limits })} />
            )}
        </Box>
    );
}

/** Hot / Warm dropdowns and the Cold range they leave, for one ranged rule (or the new-lead rule). */
function LimitCells({
    kind,
    limits,
    disabled,
    onChange,
}: {
    kind: RangedRuleKind | 'newLead';
    limits: RatingLimits;
    disabled: boolean;
    onChange: (limits: RatingLimits) => void;
}) {
    const unit = unitOf(kind);
    const steps = unit === 'calls' ? CALL_STEPS : DAY_STEPS;
    const start = unit === 'calls' ? 1 : 0;
    const max = steps[steps.length - 1];
    const withCurrent = (values: number[], current: number | 'noLimit' | null) =>
        typeof current === 'number' && !values.includes(current) ? [...values, current].sort((a, b) => a - b) : values;
    const hotValues = withCurrent(steps, limits.hot);
    const warmFrom = limits.hot === null ? start : limits.hot + 1;
    const warmValues = withCurrent(steps.filter((n) => n >= warmFrom), limits.warm);
    const noun = (n: number) => (unit === 'calls' ? `${n} call${n === 1 ? '' : 's'}` : `${n} day${n === 1 ? '' : 's'}`);

    const setHot = (raw: string) => {
        const hot = raw === OFF ? null : Number(raw);
        let warm = limits.warm;
        // Warm must still go past Hot: move it just past, or let Warm run on when there is no room.
        if (typeof warm === 'number' && hot !== null && warm <= hot) warm = hot + 1 <= max ? hot + 1 : 'noLimit';
        onChange({ hot, warm });
    };
    const setWarm = (raw: string) => onChange({ hot: limits.hot, warm: raw === OFF ? null : raw === NO_LIMIT ? 'noLimit' : Number(raw) });

    return (
        <>
            <TextField
                select
                size="small"
                value={limits.hot === null ? OFF : String(limits.hot)}
                disabled={disabled}
                onChange={(e) => setHot(e.target.value)}
                sx={selectSx}
                slotProps={{ htmlInput: { 'aria-label': 'Hot up to' }, select: { MenuProps: { slotProps: { paper: { sx: { maxHeight: 320 } } } } } }}
            >
                <MenuItem value={OFF} sx={menuItemSx}>
                    Off
                </MenuItem>
                {hotValues.map((n) => (
                    <MenuItem key={n} value={String(n)} sx={menuItemSx}>
                        {n === start ? noun(n) : `${start}–${noun(n)}`}
                    </MenuItem>
                ))}
            </TextField>
            <TextField
                select
                size="small"
                value={limits.warm === null ? OFF : limits.warm === 'noLimit' ? NO_LIMIT : String(limits.warm)}
                disabled={disabled}
                onChange={(e) => setWarm(e.target.value)}
                sx={selectSx}
                slotProps={{ htmlInput: { 'aria-label': 'Warm up to' }, select: { MenuProps: { slotProps: { paper: { sx: { maxHeight: 320 } } } } } }}
            >
                <MenuItem value={NO_LIMIT} sx={menuItemSx}>
                    {warmFrom === start ? 'Always' : `${warmFrom}+ (no limit)`}
                </MenuItem>
                <MenuItem value={OFF} sx={menuItemSx}>
                    Off
                </MenuItem>
                {warmValues.map((n) => (
                    <MenuItem key={n} value={String(n)} sx={menuItemSx}>
                        {n === warmFrom ? noun(n) : `${warmFrom}–${noun(n)}`}
                    </MenuItem>
                ))}
            </TextField>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: limits.warm === 'noLimit' ? 'var(--mui-palette-text-muted)' : 'var(--crm-slate-700)' }}>
                {coldRange(limits, unit)}
            </Typography>
        </>
    );
}

function StatusRow({ option, canEdit, closes, onChange }: { option: DropdownOptionDto; canEdit: boolean; closes: boolean; onChange: (closes: boolean) => void }) {
    const unsaved = useHasUnsavedChanges(option.id);
    const converted = option.value === CONVERTED_STATUS;
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
                px: 2,
                py: 0.75,
                borderBottom: '1px solid var(--mui-palette-border-light)',
                '&:last-of-type': { borderBottom: 'none' },
                '&:hover': { backgroundColor: 'var(--mui-palette-background-hover)' },
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{option.label}</Typography>
                {converted && <Badge tone="system">Set by Convert</Badge>}
                {unsaved && <Badge tone="unsaved">Unsaved</Badge>}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>Closes the lead</Typography>
                <LabeledSwitch
                    checked={converted || closes}
                    onChange={onChange}
                    disabled={!canEdit || converted}
                    disabledReason={converted ? 'Converting always closes a lead.' : undefined}
                    label={`${option.label} closes the lead`}
                />
            </Box>
        </Box>
    );
}
