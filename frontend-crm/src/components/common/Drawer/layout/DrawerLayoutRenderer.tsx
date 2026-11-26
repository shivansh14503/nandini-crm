'use client';

import React, { useMemo, useState } from 'react';
import { Box, Chip, IconButton, Tooltip, Typography, type SxProps, type Theme } from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import StarOutlineRoundedIcon from '@mui/icons-material/StarOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { getCountryNameByCode } from '@/data/addressMaster';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { useDrawerLayouts } from '@/hooks/queries/useDrawerLayouts';
import { LINE_ITEM_MODULES, pruneLayout, type DrawerBadge, type DrawerBlock, type DrawerLayoutDocument, type DrawerLayoutModule, type DrawerSection, type SectionStyle } from '@/lib/drawer-layout';
import type { FormConfigsPayload } from '@/types/formConfig.types';
import { ReadOnlyField } from '@/components/forms/ReadOnlyField';
import { EmailActions, PhoneActions } from '@/components/common/ContactActions';
import { DoubleClickCopyText } from '@/components/common/useDoubleClickCopy';
import { useScorecardBadge } from '@/components/common/scorecard/scorecardDisplay';
import { scorecardPaletteHex, scorecardTextColor } from '@/components/common/scorecard/scorecardUtils';
import { findCrmUser } from '@/services/masterData.store';
import { UserAvatar } from '@/components/common/UserAvatar';
import { TICKET_PRIORITY_COLORS, TICKET_STATUS_COLORS } from '@/components/tickets/TicketBadges';
import type { TicketPriority, TicketStatus } from '@/types/ticket.types';
import { DrawerChannelRow, DrawerCopyButton, DrawerSectionCard } from '../DrawerPrimitives';
import { PrimaryTag } from '@/components/common/PrimaryTag';
import { formatAddressLine } from '@/utils/address';
import { useDisplayFormats } from '@/utils/formats';
import type { DrawerBadgeItem } from '../types';
import { avatarBackground, avatarContent } from './avatar';
import { defaultLayoutFor } from './defaultLayouts';
import { drawerAddressesFor, drawerFieldsFor, fieldDisplayEntries, fieldDisplayValues, formatRupees, isOn, rawFieldValue, type AddressDef, type DrawerFieldDef, type FieldDisplayEntry } from './drawerFields';

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
    // Field values are formatted while rendering: every drawer using this context re-renders on a formats change.
    useDisplayFormats();
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
        return { layout: pruneLayout(saved, (k) => known.has(k), (p) => addresses.has(p), defaultLayoutFor(module).header.titleField).doc, isCustom: true };
    }, [saved, configs, module]);
}

// ─── Values ─────────────────────────────────────────────────────────────────────

export function fieldValues(ctx: LayoutCtx, key: string): string[] {
    if (ctx.hidden.has(key)) return [];
    const def = ctx.fields.get(key);
    return def ? fieldDisplayValues(ctx.record, def, ctx.configs) : [];
}

/** `fieldValues` with each entry's primary flag (the primary email comes first and carries the Primary tag). */
function fieldEntries(ctx: LayoutCtx, key: string): FieldDisplayEntry[] {
    if (ctx.hidden.has(key)) return [];
    const def = ctx.fields.get(key);
    return def ? fieldDisplayEntries(ctx.record, def, ctx.configs) : [];
}

function addressParts(ctx: LayoutCtx, prefix: string) {
    const r = ctx.record ?? {};
    const text = (k: string) => (typeof r[`${prefix}${k}`] === 'string' ? String(r[`${prefix}${k}`]).trim() : '');
    const country = text('Country');
    return { street: text('Address') || text('Street'), city: text('City'), state: text('State'), pin: text('PostalCode'), country: country ? getCountryNameByCode(country) || country : '' };
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
        case 'lineItems':
            return lineItemsOf(ctx).length > 0;
        case 'totals':
            return lineItemsOf(ctx).length > 0 || num(ctx.record?.grandTotal) > 0;
        default:
            // Headings, text and dividers don't count: a section of only those is "empty".
            return false;
    }
}

/** Whether the block renders anything for this record (an empty field still shows its empty text unless hidden). */
export function blockIsVisible(block: DrawerBlock, ctx: LayoutCtx): boolean {
    if (block.type === 'field') return !block.hideEmpty || blockHasContent(block, ctx);
    if (block.type === 'customFields' || block.type === 'totals') return blockHasContent(block, ctx);
    return true;
}

export function sectionIsVisible(section: DrawerSection, ctx: LayoutCtx): boolean {
    if (!section.hideEmpty) return section.blocks.length > 0;
    return section.blocks.some((b) => blockHasContent(b, ctx) || (b.type === 'field' && !b.hideEmpty) || b.type === 'lineItems');
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
    const entries = fieldEntries(ctx, block.field);
    const values = entries.map((entry) => entry.text);
    // The Primary tag only means something when the list has a primary entry (emails); other lists show none.
    const isPrimaryAt = (index: number) => entries[index]?.primary === true;
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
                        {block.display === 'chip' ? (
                            <Chip label={values.join(', ')} size="small" sx={chipSx(attention)} />
                        ) : (
                            values.map((v, i) => (
                                <Box key={`${v}-${i}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, maxWidth: '100%' }}>
                                    <Chip label={v} size="small" sx={[chipSx(attention), { maxWidth: '100%' }] as SxProps<Theme>} />
                                    {isPrimaryAt(i) && <PrimaryTag />}
                                </Box>
                            ))
                        )}
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
                            tag={isPrimaryAt(i) ? <PrimaryTag /> : undefined}
                            valueWeight={700}
                            caption={block.showLabel ? label : undefined}
                            actions={isEmail ? <EmailActions email={v} /> : <PhoneActions phone={String(rawPhone(ctx, block.field, i) ?? v)} />}
                        />
                    ))}
                </Box>
            );
        }
        case 'person':
            return (
                <Box>
                    {heading}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {(rawList(ctx, block.field).length ? rawList(ctx, block.field) : values).map((raw, i) => (
                            <PersonRow key={`${raw}-${i}`} value={raw} fallback={values[i] ?? raw} />
                        ))}
                    </Box>
                </Box>
            );
        case 'code':
            return (
                <Box>
                    {heading}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        {values.map((v, i) => (
                            <Box key={`${v}-${i}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, minWidth: 0, maxWidth: '100%' }}>
                                <Box component="span" sx={codeSx}>
                                    {v}
                                </Box>
                                <DrawerCopyButton text={v} title={`Copy ${label}`} iconColor="var(--mui-palette-text-secondary)" />
                            </Box>
                        ))}
                    </Box>
                </Box>
            );
        case 'masked':
            return (
                <Box>
                    {heading}
                    <MaskedValue value={values.join(', ')} label={label} />
                </Box>
            );
        default:
            return block.showLabel ? (
                <ReadOnlyField label={label} value={copyable(values.join(', '))} />
            ) : (
                <Typography sx={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--crm-slate-900)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{copyable(values.join(', '))}</Typography>
            );
    }
}

const codeSx: SxProps<Theme> = {
    fontFamily: 'monospace',
    fontSize: '0.82rem',
    fontWeight: 700,
    color: 'var(--crm-slate-900)',
    backgroundColor: 'var(--mui-palette-background-hover)',
    border: '1px solid var(--mui-palette-border-main)',
    borderRadius: '6px',
    px: 1,
    py: 0.2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

/** Stored values of a field as a list of strings (users are stored by username). */
function rawList(ctx: LayoutCtx, key: string): string[] {
    const def = ctx.fields.get(key);
    if (!def || ctx.hidden.has(key)) return [];
    const raw = rawFieldValue(ctx.record, def);
    return (Array.isArray(raw) ? raw : [raw]).filter((v) => typeof v === 'string' && v.trim()).map((v) => String(v));
}

/** A user: profile photo (else initials in a brand circle), name, and role • department when the user is known. */
function PersonRow({ value, fallback }: { value: string; fallback: string }) {
    const user = findCrmUser(value);
    const name = user?.name || fallback;
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <UserAvatar
                name={name}
                photoUrl={user?.photoUrl}
                size={34}
                sx={{
                    fontSize: '0.78rem',
                    background: 'linear-gradient(135deg, var(--crm-fill-blue-600) 0%, var(--crm-fill-blue-700) 100%)',
                    boxShadow: '0 2px 8px rgb(var(--crm-accent-rgb) / 0.25)',
                }}
            />
            <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--crm-slate-900)', lineHeight: 1.3 }}>
                    {name}
                </Typography>
                {user && (
                    <Typography noWrap sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {[user.role, user.department].filter(Boolean).join(' • ')}
                    </Typography>
                )}
            </Box>
        </Box>
    );
}

/** All but the last 4 characters hidden until the eye button is pressed; copy always copies the whole value. */
function MaskedValue({ value, label }: { value: string; label: string }) {
    const [shown, setShown] = useState(false);
    const masked = value.length > 4 ? `•••• ${value.slice(-4)}` : value;
    return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, maxWidth: '100%' }}>
            <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.86rem', fontWeight: 600, color: 'var(--crm-slate-900)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {shown ? value : masked}
            </Box>
            <Tooltip title={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>
                <IconButton
                    size="small"
                    onClick={() => setShown((v) => !v)}
                    aria-label={shown ? `Hide ${label}` : `Show ${label}`}
                    sx={{ width: 32, height: 32, color: 'var(--mui-palette-text-secondary)', '&:hover': { color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)' } }}
                >
                    {shown ? <VisibilityOffOutlinedIcon sx={{ fontSize: 16 }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />}
                </IconButton>
            </Tooltip>
            <DrawerCopyButton text={value} title={`Copy ${label}`} iconColor="var(--mui-palette-text-secondary)" />
        </Box>
    );
}

/** The stored phone (E.164) behind a formatted value, so call / SMS links get the real number. */
function rawPhone(ctx: LayoutCtx, key: string, index: number): unknown {
    const def = ctx.fields.get(key);
    if (!def) return undefined;
    const raw = rawFieldValue(ctx.record, def);
    return Array.isArray(raw) ? raw[index] : raw;
}

/** The address on one line (street, city, state, PIN, country), as the record's detail view shows it. */
function AddressBlockBody({ block, ctx }: { block: Extract<DrawerBlock, { type: 'address' }>; ctx: LayoutCtx }) {
    const a = addressParts(ctx, block.prefix);
    if (!a.street && !a.city && !a.state && !a.pin) return <EmptyValue text={block.emptyText || 'No address'} />;
    const line = formatAddressLine({ street: a.street, city: a.city, state: a.state, postalCode: a.pin, country: a.country });
    return (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', minWidth: 0 }}>
            <PlaceOutlinedIcon sx={{ fontSize: 16, mt: 0.2, flexShrink: 0, color: 'var(--crm-text-blue-600)' }} />
            <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.84rem', color: 'var(--mui-palette-text-primary)', fontWeight: 500, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {line}
            </Typography>
            <DrawerCopyButton text={line} title="Copy address" iconColor="var(--mui-palette-text-secondary)" />
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

// ─── Line items & totals (opportunities, quotations) ────────────────────────────

interface LineItem {
    id?: string;
    productName?: string;
    description?: string;
    quantity?: number;
    amount?: number;
    discount?: number;
    discountType?: string;
    taxRate?: string;
    taxAmount?: number;
    total?: number;
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);

function lineItemsOf(ctx: LayoutCtx): LineItem[] {
    if (!LINE_ITEM_MODULES.includes(ctx.module)) return [];
    const items = ctx.record?.lineItems;
    return Array.isArray(items) ? (items as LineItem[]) : [];
}

const smallLabelSx: SxProps<Theme> = { fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)' };

function LineItemsBody({ block, ctx }: { block: Extract<DrawerBlock, { type: 'lineItems' }>; ctx: LayoutCtx }) {
    const items = lineItemsOf(ctx);
    const group = typeof ctx.record?.groupName === 'string' ? ctx.record.groupName.trim() : '';
    const currency = typeof ctx.record?.currency === 'string' ? ctx.record.currency.trim() : '';
    if (items.length === 0) {
        return (
            <Box sx={{ p: 2.5, textAlign: 'center', backgroundColor: 'var(--mui-palette-background-subtle)', borderRadius: '8px', border: '1px dashed var(--mui-palette-border-main)' }}>
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)' }}>{block.emptyText || 'No line items yet.'}</Typography>
            </Box>
        );
    }
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {(group || currency) && (
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--mui-palette-text-primary)' }}>{group || 'Products & Services'}</Typography>
                    {currency && <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>Currency: {currency}</Typography>}
                </Box>
            )}
            {items.map((item, idx) => (
                <Box key={item.id || idx} sx={{ p: 1.5, borderRadius: '8px', border: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-paper)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 1 }}>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-slate-900)', wordBreak: 'break-word' }}>{item.productName || 'Item'}</Typography>
                            {item.description && <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', mt: 0.3, lineHeight: 1.4 }}>{item.description}</Typography>}
                        </Box>
                        <Typography sx={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--crm-green-700)', whiteSpace: 'nowrap' }}>{formatRupees(num(item.total))}</Typography>
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1, pt: 1, borderTop: '1px dashed var(--mui-palette-border-main)', fontSize: '0.75rem' }}>
                        <Box>
                            <Typography sx={smallLabelSx}>Qty</Typography>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{num(item.quantity)}</Typography>
                        </Box>
                        <Box>
                            <Typography sx={smallLabelSx}>Unit Price</Typography>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{formatRupees(num(item.amount))}</Typography>
                        </Box>
                        <Box>
                            <Typography sx={smallLabelSx}>Discount</Typography>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: num(item.discount) > 0 ? 'var(--mui-palette-error-main)' : undefined }}>
                                {num(item.discount) > 0 ? (item.discountType === 'percentage' ? `${num(item.discount)}%` : formatRupees(num(item.discount))) : '—'}
                            </Typography>
                        </Box>
                        <Box>
                            <Typography sx={smallLabelSx}>Tax{item.taxRate ? ` (${item.taxRate})` : ''}</Typography>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{formatRupees(num(item.taxAmount))}</Typography>
                        </Box>
                    </Box>
                </Box>
            ))}
        </Box>
    );
}

function TotalsBody({ ctx }: { ctx: LayoutCtx }) {
    const r = ctx.record ?? {};
    const row = (label: string, value: string, color?: string, strong = false) => (
        <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
            <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)' }}>{label}</Typography>
            <Typography sx={{ fontSize: '0.84rem', fontWeight: strong ? 700 : 600, color: color ?? 'var(--mui-palette-text-primary)', whiteSpace: 'nowrap' }}>{value}</Typography>
        </Box>
    );
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {row('Gross Total', formatRupees(num(r.totalAmount)))}
            {num(r.totalDiscount) > 0 && row('Item Discounts', `- ${formatRupees(num(r.totalDiscount))}`, 'var(--mui-palette-error-main)')}
            {num(r.lumpSumDiscount) > 0 && row('Lump Sum Discount', `- ${formatRupees(num(r.lumpSumDiscount))}`, 'var(--mui-palette-error-main)')}
            {row('Subtotal', formatRupees(num(r.subtotal)), 'var(--crm-slate-900)', true)}
            {row('Tax', `+ ${formatRupees(num(r.totalTax))}`, 'var(--crm-text-blue-600)')}
            <Box sx={{ height: '1px', backgroundColor: 'var(--mui-palette-border-strong)', my: 0.5 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--crm-slate-900)' }}>Grand Total</Typography>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--crm-green-700)', whiteSpace: 'nowrap' }}>{formatRupees(num(r.grandTotal))}</Typography>
            </Box>
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
        case 'lineItems':
            return <LineItemsBody block={block} ctx={ctx} />;
        case 'totals':
            return <TotalsBody ctx={ctx} />;
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
    auto: 'Value colours (Rating, stage, status, priority, …)',
    neutral: 'Neutral grey',
    brand: 'Brand (blue / green)',
    success: 'Green',
    warning: 'Amber',
    danger: 'Red',
};

type Tone = Pick<DrawerBadgeItem, 'color' | 'backgroundColor' | 'borderColor'>;
const pill = (c: { bg: string; color: string; border: string }): Tone => ({ color: c.color, backgroundColor: c.bg, borderColor: c.border });

/** Contract status in the colours of its default score cards (palette names), so drawer and list agree. */
const CONTRACT_STATUS_PALETTE: Record<string, string> = { 'Not Started': 'Sky', 'In Progress': 'Yellow', Signed: 'Teal', Expired: 'Red' };

/** The tinted pill a scorecard colour gets (same mix as the scorecard drawer badge). */
const paletteTone = (color: string): Tone => ({
    color: scorecardTextColor(color),
    backgroundColor: `color-mix(in srgb, ${color} 14%, var(--mui-palette-background-paper))`,
    borderColor: `color-mix(in srgb, ${color} 38%, transparent)`,
});

/** Colours of an "auto" badge from what the value means (stages, statuses, priorities, money). */
function autoTone(module: DrawerLayoutModule, field: string, value: string): Tone {
    if (module === 'contracts' && field === 'status') {
        const name = CONTRACT_STATUS_PALETTE[value];
        return name ? paletteTone(scorecardPaletteHex(name)) : BADGE_TONES.neutral;
    }
    // A referral's Active / Inactive reads like an organization's Account Status.
    if (module === 'referrals' && field === 'status') return value === 'Inactive' ? BADGE_TONES.warning : BADGE_TONES.success;
    switch (field) {
        case 'status':
        case 'grandTotal':
            return BADGE_TONES.success;
        case 'salesStage':
            if (value === 'Closed Won') return BADGE_TONES.success;
            if (value === 'Closed Lost') return BADGE_TONES.danger;
            if (value === 'Negotiation' || value === 'Proposal/Price Quote') return BADGE_TONES.warning;
            return BADGE_TONES.brand;
        case 'quoteStage':
            return value === 'Accepted' ? BADGE_TONES.success : value === 'Rejected' ? BADGE_TONES.danger : value === 'Sent' ? BADGE_TONES.brand : BADGE_TONES.neutral;
        case 'accountStatus':
            return value === 'Inactive' ? BADGE_TONES.warning : BADGE_TONES.success;
        case 'leftJob':
            return value === 'Yes' ? BADGE_TONES.danger : BADGE_TONES.success;
        case 'ticketPriority': {
            const c = TICKET_PRIORITY_COLORS[value as TicketPriority];
            return c ? pill(c) : BADGE_TONES.neutral;
        }
        case 'ticketStatus': {
            const c = TICKET_STATUS_COLORS[value as TicketStatus];
            return c ? pill(c) : BADGE_TONES.neutral;
        }
        default:
            return BADGE_TONES.neutral;
    }
}

export interface LayoutHeader {
    title: string;
    subtitle: string;
    avatarIcon: React.ReactNode | undefined;
    avatarBg: string;
    /** Badges with the layout badge each came from (`null` when it renders nothing for this record). */
    badges: { badge: DrawerBadge; item: DrawerBadgeItem | null }[];
    /** The lead's Rating (Hot / Warm / Cold) and why: shown in its own box under the header buttons, never as a badge. */
    rating: { value: string; reason?: string } | null;
}

/** The Rating has a fixed place in the header (its own box), so a layout never shows it as a badge. */
export const isRatingBadge = (badge: DrawerBadge) => badge.field === 'rating';

/** Header of a drawer from its layout. `showEmptyBadges` (builder) keeps empty badges, labelled with the field name. */
export function useLayoutHeader(layout: DrawerLayoutDocument, ctx: LayoutCtx, showEmptyBadges = false): LayoutHeader {
    const scorecardBadge = useScorecardBadge(ctx.module, ctx.record);
    const { header } = layout;
    const first = (key: string) => fieldValues(ctx, key).join(', ');
    const title = first(header.titleField) || (ctx.record ? '—' : 'Record');
    const subtitle = header.subtitleFields.map(first).filter(Boolean).join(' • ');
    const hot = header.hotAvatar && ctx.record?.rating === 'Hot';

    const ratingValue = ctx.module === 'leads' && !ctx.hidden.has('rating') && typeof ctx.record?.rating === 'string' ? ctx.record.rating.trim() : '';
    const rating = ratingValue ? { value: ratingValue, reason: typeof ctx.record?.ratingReason === 'string' ? ctx.record.ratingReason : undefined } : null;

    const badges = header.badges.filter((b) => !isRatingBadge(b)).map((badge) => {
        const def = ctx.fields.get(badge.field);
        // A yes / no value shows its badge (the prefix, or the field's name) only while it is on.
        if (def?.type === 'checkbox') {
            const on = !ctx.hidden.has(badge.field) && isOn(def ? rawFieldValue(ctx.record, def) : undefined);
            const text = badge.prefix.trim() || def.label;
            if (!on) return { badge, item: showEmptyBadges ? { label: `${text} (off)`, ...BADGE_TONES.neutral } : null };
            return { badge, item: { label: text, ...(badge.style === 'auto' ? BADGE_TONES.success : BADGE_TONES[badge.style]) } };
        }
        const values = fieldValues(ctx, badge.field);
        if (values.length === 0 && (badge.hideEmpty || !showEmptyBadges)) {
            if (!showEmptyBadges) return { badge, item: null };
            return { badge, item: { label: `${badge.prefix}${def?.label ?? badge.field} (empty)`, ...BADGE_TONES.neutral } };
        }
        const label = `${badge.prefix}${values.join(', ') || '—'}`;
        if (badge.style !== 'auto') return { badge, item: { label, ...BADGE_TONES[badge.style] } };
        if (scorecardBadge && scorecardBadge.fieldKey === badge.field) return { badge, item: { ...scorecardBadge, label: `${badge.prefix}${scorecardBadge.label}` } };
        return { badge, item: { label, ...autoTone(ctx.module, badge.field, String(def ? (rawFieldValue(ctx.record, def) ?? '') : '')) } };
    });

    return { title, subtitle, avatarIcon: avatarContent(header.avatar), avatarBg: avatarBackground(header.avatar, hot), badges, rating };
}
