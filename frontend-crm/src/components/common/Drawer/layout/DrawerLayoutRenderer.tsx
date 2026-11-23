'use client';

import React, { useMemo } from 'react';
import { Box, Chip, Typography, type SxProps, type Theme } from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import StarOutlineRoundedIcon from '@mui/icons-material/StarOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import { getCountryNameByCode } from '@/data/addressMaster';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { useDrawerLayouts } from '@/hooks/queries/useDrawerLayouts';
import { pruneLayout, type DrawerBadge, type DrawerBlock, type DrawerLayoutDocument, type DrawerLayoutModule, type DrawerSection, type SectionStyle } from '@/lib/drawer-layout';
import type { FormConfigsPayload } from '@/types/formConfig.types';
import { ratingChipColors } from '@/utils/leadRating';
import { ReadOnlyField } from '@/components/forms/ReadOnlyField';
import { EmailActions, PhoneActions } from '@/components/common/ContactActions';
import { DoubleClickCopyText } from '@/components/common/useDoubleClickCopy';
import { useScorecardBadge } from '@/components/common/scorecard/scorecardDisplay';
import { DrawerChannelRow, DrawerSectionCard } from '../DrawerPrimitives';
import type { DrawerBadgeItem } from '../types';
import { avatarBackground, avatarContent } from './avatar';
import { defaultLayoutFor } from './defaultLayouts';
import { drawerAddressesFor, drawerFieldsFor, fieldDisplayValues, rawFieldValue, type AddressDef, type DrawerFieldDef } from './drawerFields';

/**
 * Renders a drawer layout for a record: the header (title, subtitle, avatar, badges) and each tab's sections. The
 * builder canvas uses the same pieces (SectionShell, BlockBody), so what an admin sees while editing is exactly what
 * users get.
 */

type AnyRecord = Record<string, unknown>;

export interface LayoutCtx {
    module: DrawerLayoutModule;
    record: AnyRecord | null;
    configs: FormConfigsPayload | null;
    fields: Map<string, DrawerFieldDef>;
    addresses: AddressDef[];
    /** Fields a block places explicitly (the "Other custom fields" block skips them). */
    placed: Set<string>;
    /** Values not to show at all (e.g. the record number when Document Series hides it). */
    hidden: ReadonlySet<string>;
}

export function placedFieldsOf(layout: DrawerLayoutDocument): Set<string> {
    const placed = new Set<string>();
    for (const sections of Object.values(layout.tabs)) for (const s of sections) for (const b of s.blocks) if (b.type === 'field') placed.add(b.field);
    return placed;
}

export function useLayoutCtx(
    module: DrawerLayoutModule,
    record: unknown,
    layout: DrawerLayoutDocument,
    hidden: ReadonlySet<string> = EMPTY_SET,
    configsOverride?: FormConfigsPayload | null,
): LayoutCtx {
    const loaded = useFormConfigs();
    const configs = configsOverride ?? loaded;
    const fields = useMemo(() => new Map(drawerFieldsFor(configs, module).map((f) => [f.key, f])), [configs, module]);
    const addresses = useMemo(() => drawerAddressesFor(configs, module), [configs, module]);
    const placed = useMemo(() => placedFieldsOf(layout), [layout]);
    return { module, record: (record as AnyRecord | null) ?? null, configs, fields, addresses, placed, hidden };
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * The module's layout for drawers: the admin's saved one (minus anything pointing at fields the form no longer
 * has), or the built-in one until it is saved / while it loads.
 */
export function useDrawerLayout(module: DrawerLayoutModule): { layout: DrawerLayoutDocument; isCustom: boolean } {
    const { data } = useDrawerLayouts();
    const configs = useFormConfigs();
    const saved = data?.[module]?.layout;
    return useMemo(() => {
        if (!saved) return { layout: defaultLayoutFor(module), isCustom: false };
        if (!configs) return { layout: saved, isCustom: true };
        const known = new Set(drawerFieldsFor(configs, module).map((f) => f.key));
        const addresses = new Set(drawerAddressesFor(configs, module).map((a) => a.prefix));
        return { layout: pruneLayout(saved, (k) => known.has(k), (p) => addresses.has(p), 'name').doc, isCustom: true };
    }, [saved, configs, module]);
}

// ─── Values ─────────────────────────────────────────────────────────────────────

export function fieldValues(ctx: LayoutCtx, key: string): string[] {
    if (ctx.hidden.has(key)) return [];
    const def = ctx.fields.get(key);
    return def ? fieldDisplayValues(ctx.record, def, ctx.configs) : [];
}

function addressParts(ctx: LayoutCtx, prefix: string) {
    const r = ctx.record ?? {};
    const text = (k: string) => (typeof r[`${prefix}${k}`] === 'string' ? String(r[`${prefix}${k}`]).trim() : '');
    const country = text('Country');
    return { street: text('Address'), city: text('City'), state: text('State'), pin: text('PostalCode'), country: country ? getCountryNameByCode(country) || country : '' };
}

/** Custom fields the "Other custom fields" block lists: visible in drawer, not placed elsewhere, with a value. */
function remainingCustomFields(ctx: LayoutCtx): DrawerFieldDef[] {
    return [...ctx.fields.values()].filter((f) => f.custom && f.visibleInDrawer && !ctx.placed.has(f.key) && fieldDisplayValues(ctx.record, f, ctx.configs).length > 0);
}

export function blockHasContent(block: DrawerBlock, ctx: LayoutCtx): boolean {
    switch (block.type) {
        case 'field':
            return fieldValues(ctx, block.field).length > 0;
        case 'address': {
            const a = addressParts(ctx, block.prefix);
            return Boolean(a.street || a.city || a.state || a.pin);
        }
        case 'customFields':
            return remainingCustomFields(ctx).length > 0;
        default:
            // Headings, text and dividers don't count: a section of only those is "empty".
            return false;
    }
}

/** Whether the block renders anything for this record (an empty field still shows its empty text unless hidden). */
export function blockIsVisible(block: DrawerBlock, ctx: LayoutCtx): boolean {
    if (block.type === 'field') return !block.hideEmpty || blockHasContent(block, ctx);
    if (block.type === 'customFields') return blockHasContent(block, ctx);
    return true;
}

export function sectionIsVisible(section: DrawerSection, ctx: LayoutCtx): boolean {
    if (!section.hideEmpty) return section.blocks.length > 0;
    return section.blocks.some((b) => blockHasContent(b, ctx) || (b.type === 'field' && !b.hideEmpty));
}

// ─── Section shell & grid ───────────────────────────────────────────────────────

const SECTION_LOOKS: Record<SectionStyle, { bg: string; border: string; title?: SxProps<Theme>; p?: number }> = {
    card: { bg: 'var(--mui-palette-background-paper)', border: 'var(--mui-palette-border-light)' },
    subtle: { bg: 'var(--mui-palette-background-subtle)', border: 'var(--mui-palette-border-light)' },
    highlight: { bg: 'var(--mui-palette-primary-soft)', border: 'var(--mui-palette-primary-softBorder)', title: { color: 'var(--crm-text-blue-900)' } },
    attention: { bg: 'var(--mui-palette-warning-soft)', border: 'var(--mui-palette-warning-softBorder)', title: { color: 'var(--crm-amber-800)', borderLeftColor: 'var(--mui-palette-warning-main)' } },
    plain: { bg: 'transparent', border: 'transparent', p: 0.5 },
};

export const SECTION_STYLE_LABELS: Record<SectionStyle, string> = {
    card: 'Card',
    subtle: 'Subtle',
    highlight: 'Brand',
    attention: 'Amber',
    plain: 'Plain',
};

export function SectionShell({ section, children, action, sx }: { section: DrawerSection; children: React.ReactNode; action?: React.ReactNode; sx?: SxProps<Theme> }) {
    const look = SECTION_LOOKS[section.style] ?? SECTION_LOOKS.card;
    return (
        <DrawerSectionCard title={section.title.trim() || undefined} bg={look.bg} borderColor={look.border} titleSx={look.title} p={look.p ?? 2} action={action} sx={sx}>
            {children}
        </DrawerSectionCard>
    );
}

export const sectionGridSx = (columns: 1 | 2): SxProps<Theme> => ({
    display: 'grid',
    gridTemplateColumns: columns === 2 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
    gap: 1.5,
    mt: 0.75,
});

/** Takes the whole row of a two-column section. */
export const blockSpansRow = (block: DrawerBlock): boolean => block.type !== 'field' || block.width === 'full';

// ─── Blocks ─────────────────────────────────────────────────────────────────────

const labelSx: SxProps<Theme> = {
    fontSize: '0.68rem',
    fontWeight: 600,
    color: 'var(--mui-palette-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    mb: 0.4,
};

function EmptyValue({ text }: { text: string }) {
    return <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-muted)', fontStyle: 'italic' }}>{text || 'Not provided'}</Typography>;
}

function chipSx(attention: boolean): SxProps<Theme> {
    return attention
        ? { height: 22, fontSize: '0.72rem', fontWeight: 700, backgroundColor: 'var(--crm-amber-100)', color: 'var(--crm-amber-700)', border: '1px solid var(--crm-amber-300)' }
        : { height: 24, fontSize: '0.74rem', fontWeight: 600, backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)', border: '1px solid var(--mui-palette-primary-softBorder)' };
}

const ORG_KEY = /organi[sz]ation|company|trade|mailing|partner/i;

function FieldBlockBody({ block, ctx, sectionStyle }: { block: Extract<DrawerBlock, { type: 'field' }>; ctx: LayoutCtx; sectionStyle: SectionStyle }) {
    const def = ctx.fields.get(block.field);
    const values = fieldValues(ctx, block.field);
    const label = block.label.trim() || def?.label || block.field;
    const attention = sectionStyle === 'attention';
    const copyable = (text: string) => (block.copy ? <DoubleClickCopyText>{text}</DoubleClickCopyText> : text);
    const heading = block.showLabel ? <Typography sx={labelSx}>{label}</Typography> : null;

    if (values.length === 0) {
        return (
            <Box>
                {heading}
                <EmptyValue text={block.emptyText} />
            </Box>
        );
    }

    switch (block.display) {
        case 'large':
            return (
                <Box>
                    {heading}
                    <Typography sx={{ fontSize: '0.98rem', fontWeight: 800, color: attention ? 'var(--crm-amber-900)' : 'var(--crm-slate-900)', letterSpacing: '-0.01em' }}>
                        {copyable(values.join(', '))}
                    </Typography>
                </Box>
            );
        case 'emphasis': {
            const Icon = ORG_KEY.test(block.field) ? ApartmentIcon : StarOutlineRoundedIcon;
            return (
                <Box>
                    {heading}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Icon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)' }} />
                        <Typography sx={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--crm-text-blue-700)', wordBreak: 'break-word' }}>{copyable(values.join(', '))}</Typography>
                    </Box>
                </Box>
            );
        }
        case 'chip':
        case 'chips':
            return (
                <Box>
                    {heading}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                        {(block.display === 'chip' ? [values.join(', ')] : values).map((v, i) => (
                            <Chip key={`${v}-${i}`} label={v} size="small" sx={chipSx(attention)} />
                        ))}
                    </Box>
                </Box>
            );
        case 'quote':
            return (
                <Box>
                    {heading}
                    <Box
                        sx={{
                            p: 1.2,
                            borderRadius: '6px',
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            border: `1px solid ${attention ? 'var(--crm-orange-200)' : 'var(--mui-palette-border-main)'}`,
                        }}
                    >
                        <Typography sx={{ fontSize: '0.76rem', color: attention ? 'var(--crm-orange-800)' : 'var(--crm-slate-700)', fontWeight: 500, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                            &quot;{copyable(values.join(', '))}&quot;
                        </Typography>
                    </Box>
                </Box>
            );
        case 'channel': {
            const isEmail = def?.type === 'email';
            return (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {values.map((v, i) => (
                        <DrawerChannelRow
                            key={`${v}-${i}`}
                            icon={
                                isEmail ? (
                                    <EmailOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)' }} />
                                ) : (
                                    <PhoneOutlinedIcon sx={{ fontSize: 16, color: 'var(--mui-palette-success-main)' }} />
                                )
                            }
                            value={v}
                            valueWeight={700}
                            caption={block.showLabel ? label : undefined}
                            actions={isEmail ? <EmailActions email={v} /> : <PhoneActions phone={String(rawPhone(ctx, block.field, i) ?? v)} />}
                        />
                    ))}
                </Box>
            );
        }
        default:
            return block.showLabel ? (
                <ReadOnlyField label={label} value={copyable(values.join(', '))} />
            ) : (
                <Typography sx={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--crm-slate-900)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{copyable(values.join(', '))}</Typography>
            );
    }
}

/** The stored phone (E.164) behind a formatted value, so call / SMS links get the real number. */
function rawPhone(ctx: LayoutCtx, key: string, index: number): unknown {
    const def = ctx.fields.get(key);
    if (!def) return undefined;
    const raw = rawFieldValue(ctx.record, def);
    return Array.isArray(raw) ? raw[index] : raw;
}

function AddressBlockBody({ block, ctx }: { block: Extract<DrawerBlock, { type: 'address' }>; ctx: LayoutCtx }) {
    const a = addressParts(ctx, block.prefix);
    if (!a.street && !a.city && !a.state && !a.pin) return <EmptyValue text={block.emptyText || 'No address'} />;
    const meta = [
        { label: 'CITY / STATE', value: [a.city, a.state].filter(Boolean).join(', ') },
        { label: 'POSTAL PIN', value: a.pin },
        { label: 'COUNTRY', value: a.country },
    ].filter((m) => m.value);
    return (
        <Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <PlaceOutlinedIcon sx={{ fontSize: 16, mt: 0.2, color: 'var(--crm-text-blue-600)' }} />
                <Typography sx={{ fontSize: '0.84rem', color: 'var(--mui-palette-text-primary)', fontWeight: 500, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                    {a.street || <Box component="span" sx={{ color: 'var(--mui-palette-text-muted)', fontStyle: 'italic' }}>No street given</Box>}
                </Typography>
            </Box>
            {meta.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1.2, pt: 1, borderTop: '1px solid var(--mui-palette-border-light)' }}>
                    {meta.map((m) => (
                        <Box key={m.label}>
                            <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 700 }}>{m.label}</Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)' }}>{m.value}</Typography>
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
}

function CustomFieldsBody({ ctx, columns, placeholder }: { ctx: LayoutCtx; columns: 1 | 2; placeholder?: React.ReactNode }) {
    const rest = remainingCustomFields(ctx);
    if (rest.length === 0) return <>{placeholder ?? null}</>;
    return (
        <Box sx={{ ...(sectionGridSx(columns) as object), mt: 0 }}>
            {placeholder}
            {rest.map((f) => {
                const values = fieldDisplayValues(ctx.record, f, ctx.configs);
                const raw = rawFieldValue(ctx.record, f);
                const text = typeof raw === 'string' ? raw : '';
                return (
                    <ReadOnlyField
                        key={f.key}
                        label={f.label}
                        value={values.join(', ')}
                        copyable={f.type === 'uppercase'}
                        actions={f.type === 'phone' && text ? <PhoneActions phone={text} /> : f.type === 'email' && text ? <EmailActions email={text} /> : undefined}
                        sx={f.type === 'textarea' || f.type === 'multiselect' ? { gridColumn: '1 / -1' } : undefined}
                    />
                );
            })}
        </Box>
    );
}

/**
 * One block's content. `placeholder` (builder only) is shown inside the "Other custom fields" block so it can be
 * found and moved even when the sample record has no custom values.
 */
export function BlockBody({ block, ctx, section, placeholder }: { block: DrawerBlock; ctx: LayoutCtx; section: DrawerSection; placeholder?: React.ReactNode }) {
    switch (block.type) {
        case 'field':
            return <FieldBlockBody block={block} ctx={ctx} sectionStyle={section.style} />;
        case 'heading':
            return <Typography sx={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--crm-slate-900)' }}>{block.text || 'Heading'}</Typography>;
        case 'text':
            return <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{block.text}</Typography>;
        case 'divider':
            return <Box sx={{ height: '1px', backgroundColor: 'var(--mui-palette-border-main)', my: 0.5 }} />;
        case 'address':
            return <AddressBlockBody block={block} ctx={ctx} />;
        case 'customFields':
            return <CustomFieldsBody ctx={ctx} columns={section.columns} placeholder={placeholder} />;
        default:
            return null;
    }
}

/** A tab's sections as users see them: empty fields and sections fold away. */
export function LayoutTabSections({ sections, ctx }: { sections: DrawerSection[]; ctx: LayoutCtx }) {
    const visible = sections.filter((s) => sectionIsVisible(s, ctx));
    if (visible.length === 0) {
        return <Typography sx={{ fontSize: '0.84rem', color: 'var(--mui-palette-text-muted)', textAlign: 'center', py: 4 }}>Nothing to show here yet.</Typography>;
    }
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {visible.map((section) => (
                <SectionShell key={section.id} section={section}>
                    <Box sx={sectionGridSx(section.columns)}>
                        {section.blocks
                            .filter((b) => blockIsVisible(b, ctx))
                            .map((b) => (
                                <Box key={b.id} sx={{ minWidth: 0, ...(section.columns === 2 && blockSpansRow(b) ? { gridColumn: '1 / -1' } : {}) }}>
                                    <BlockBody block={b} ctx={ctx} section={section} />
                                </Box>
                            ))}
                    </Box>
                </SectionShell>
            ))}
        </Box>
    );
}

// ─── Header ─────────────────────────────────────────────────────────────────────

const BADGE_TONES: Record<Exclude<DrawerBadge['style'], 'auto'>, Pick<DrawerBadgeItem, 'color' | 'backgroundColor' | 'borderColor'>> = {
    neutral: { color: 'var(--crm-slate-600)', backgroundColor: 'var(--mui-palette-background-hover)', borderColor: 'var(--mui-palette-border-strong)' },
    brand: { color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)', borderColor: 'var(--mui-palette-primary-softBorder)' },
    success: { color: 'var(--crm-emerald-700)', backgroundColor: 'var(--mui-palette-success-soft)', borderColor: 'var(--mui-palette-success-softBorder)' },
    warning: { color: 'var(--crm-amber-700)', backgroundColor: 'var(--mui-palette-warning-soft)', borderColor: 'var(--mui-palette-warning-softBorder)' },
    danger: { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)', borderColor: 'var(--mui-palette-error-softBorder)' },
};

export const BADGE_STYLE_LABELS: Record<DrawerBadge['style'], string> = {
    auto: 'Value colours (Rating, scorecard, Status)',
    neutral: 'Neutral grey',
    brand: 'Brand (blue / green)',
    success: 'Green',
    warning: 'Amber',
    danger: 'Red',
};

export interface LayoutHeader {
    title: string;
    subtitle: string;
    avatarIcon: React.ReactNode | undefined;
    avatarBg: string;
    /** Badges with the layout badge each came from (`null` when it renders nothing for this record). */
    badges: { badge: DrawerBadge; item: DrawerBadgeItem | null }[];
}

/** Header of a drawer from its layout. `showEmptyBadges` (builder) keeps empty badges, labelled with the field name. */
export function useLayoutHeader(layout: DrawerLayoutDocument, ctx: LayoutCtx, showEmptyBadges = false): LayoutHeader {
    const scorecardBadge = useScorecardBadge(ctx.module, ctx.record);
    const { header } = layout;
    const first = (key: string) => fieldValues(ctx, key).join(', ');
    const title = first(header.titleField) || (ctx.record ? '—' : 'Record');
    const subtitle = header.subtitleFields.map(first).filter(Boolean).join(' • ');
    const hot = header.hotAvatar && ctx.record?.rating === 'Hot';

    const badges = header.badges.map((badge) => {
        const values = fieldValues(ctx, badge.field);
        const def = ctx.fields.get(badge.field);
        if (values.length === 0 && (badge.hideEmpty || !showEmptyBadges)) {
            if (!showEmptyBadges) return { badge, item: null };
            return { badge, item: { label: `${badge.prefix}${def?.label ?? badge.field} (empty)`, ...BADGE_TONES.neutral } };
        }
        const label = `${badge.prefix}${values.join(', ') || '—'}`;
        if (badge.style !== 'auto') return { badge, item: { label, ...BADGE_TONES[badge.style] } };
        if (badge.field === 'rating') {
            const rating = String(ctx.record?.rating ?? '');
            return {
                badge,
                item: {
                    label,
                    ...ratingChipColors(rating),
                    icon: rating === 'Hot' ? <LocalFireDepartmentIcon sx={{ fontSize: '13px !important' }} /> : undefined,
                    tooltip: typeof ctx.record?.ratingReason === 'string' ? ctx.record.ratingReason : undefined,
                },
            };
        }
        if (scorecardBadge && scorecardBadge.fieldKey === badge.field) return { badge, item: { ...scorecardBadge, label: `${badge.prefix}${scorecardBadge.label}` } };
        if (badge.field === 'status') return { badge, item: { label, ...BADGE_TONES.success } };
        return { badge, item: { label, ...BADGE_TONES.neutral } };
    });

    return { title, subtitle, avatarIcon: avatarContent(header.avatar), avatarBg: avatarBackground(header.avatar, hot), badges };
}
