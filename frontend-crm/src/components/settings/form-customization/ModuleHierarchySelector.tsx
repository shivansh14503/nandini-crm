'use client';

import React, { useRef } from 'react';
import { Box, Typography } from '@mui/material';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import SupportAgentRoundedIcon from '@mui/icons-material/SupportAgentRounded';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import AppsRoundedIcon from '@mui/icons-material/AppsRounded';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import MonetizationOnOutlinedIcon from '@mui/icons-material/MonetizationOnOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import TransformOutlinedIcon from '@mui/icons-material/TransformOutlined';
import { CRM_MODULE_GROUPS, type CrmModuleGroupKey, type CrmModuleKey } from '@/types/formConfig.types';
import { CONVERT_TINT } from './ConvertLeadFieldsPanel';

const ICON_SX = { fontSize: 17 } as const;

export const GROUP_ICONS: Record<CrmModuleGroupKey, React.ReactNode> = {
    sales: <TrendingUpRoundedIcon sx={{ fontSize: 15 }} />,
    support: <SupportAgentRoundedIcon sx={{ fontSize: 15 }} />,
    inventory: <Inventory2OutlinedIcon sx={{ fontSize: 15 }} />,
    all: <AppsRoundedIcon sx={{ fontSize: 15 }} />,
};

export const MODULE_ICONS: Record<CrmModuleKey, React.ReactNode> = {
    organizations: <BusinessOutlinedIcon sx={ICON_SX} />,
    contacts: <PeopleOutlinedIcon sx={ICON_SX} />,
    leads: <LightbulbOutlinedIcon sx={ICON_SX} />,
    opportunities: <MonetizationOnOutlinedIcon sx={ICON_SX} />,
    quotations: <RequestQuoteOutlinedIcon sx={ICON_SX} />,
    tickets: <ConfirmationNumberOutlinedIcon sx={ICON_SX} />,
    products: <CategoryOutlinedIcon sx={ICON_SX} />,
    'partner-companies': <HandshakeOutlinedIcon sx={ICON_SX} />,
};

export const CONVERT_ICON = <TransformOutlinedIcon sx={ICON_SX} />;

/** Selector id of the Convert Lead entry (not a module of its own: it composes the contact, organization and opportunity forms). */
const CONVERT_ID = 'convert-lead';
type EntryId = CrmModuleKey | typeof CONVERT_ID;
interface Entry {
    id: EntryId;
    label: string;
}

/** The forms of a group in navbar order; Convert Lead follows Leads, as a lead is converted into the other forms. */
const entriesOf = (group: (typeof CRM_MODULE_GROUPS)[number]): Entry[] =>
    group.modules.flatMap((m): Entry[] => {
        const entry: Entry = { id: m.key, label: m.label };
        return m.key === 'leads' ? [entry, { id: CONVERT_ID, label: 'Convert Lead' }] : [entry];
    });

/** Every form in navbar order: the arrow keys walk this list across groups. */
const ORDER: EntryId[] = CRM_MODULE_GROUPS.flatMap((g) => entriesOf(g).map((e) => e.id));

/**
 * The forms grouped like the top navbar (Sales, Support, Inventory, All). Each form shows its icon, its number
 * of active fields and an amber dot while it has unsaved changes.
 *
 * Keyboard: one tab stop (the selected form, or the first form while none is selected); arrow keys / Home / End move between forms, Enter or Space opens one.
 */
export function ModuleHierarchySelector({
    value,
    onChange,
    fieldCounts,
    unsaved,
    convert,
}: {
    /** The open form, or null while none has been picked yet. While Convert Lead is open, the record it shows. */
    value: CrmModuleKey | null;
    onChange: (module: CrmModuleKey) => void;
    /** Active fields per form. */
    fieldCounts: Partial<Record<CrmModuleKey, number>>;
    /** Forms with unsaved changes. */
    unsaved: Set<CrmModuleKey>;
    /** The Convert Lead entry: whether it is open, how to open it, its field count and whether it has unsaved changes. */
    convert: { active: boolean; onSelect: () => void; fieldCount?: number; hasUnsaved: boolean };
}) {
    const tabRefs = useRef(new Map<EntryId, HTMLElement>());

    const focusAt = (index: number) => {
        const key = ORDER[(index + ORDER.length) % ORDER.length];
        tabRefs.current.get(key)?.focus();
    };

    const open = (id: EntryId) => (id === CONVERT_ID ? convert.onSelect() : onChange(id));

    const onKeyDown = (module: EntryId) => (e: React.KeyboardEvent) => {
        const index = ORDER.indexOf(module);
        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                focusAt(index + 1);
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                focusAt(index - 1);
                break;
            case 'Home':
                e.preventDefault();
                focusAt(0);
                break;
            case 'End':
                e.preventDefault();
                focusAt(ORDER.length - 1);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                open(module);
                break;
        }
    };

    return (
        <Box role="tablist" aria-label="CRM forms" aria-orientation="horizontal" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'stretch' }}>
            {CRM_MODULE_GROUPS.map((group) => {
                const entries = entriesOf(group);
                const groupActive = entries.some((m) => (m.id === CONVERT_ID ? convert.active : !convert.active && m.id === value));
                const headingId = `form-group-${group.key}`;
                return (
                    <Box
                        key={group.key}
                        role="group"
                        aria-labelledby={headingId}
                        sx={{
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            border: `1px solid ${groupActive ? 'var(--mui-palette-primary-softBorder)' : 'var(--mui-palette-border-main)'}`,
                            borderRadius: '10px',
                            px: 1.25,
                            py: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.85,
                            // Sales holds five forms: let it take the room, the single-form groups stay compact.
                            flex: entries.length > 1 ? '1 1 420px' : '0 1 auto',
                            minWidth: 0,
                            transition: 'border-color 150ms ease',
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, color: groupActive ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-secondary)' }}>
                            {GROUP_ICONS[group.key]}
                            <Typography
                                id={headingId}
                                sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mui-palette-text-secondary)' }}
                            >
                                {group.label}
                            </Typography>
                            <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-muted)', fontWeight: 600 }}>
                                · {entries.length} form{entries.length === 1 ? '' : 's'}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                            {entries.map((m) => {
                                const isConvert = m.id === CONVERT_ID;
                                const active = isConvert ? convert.active : !convert.active && m.id === value;
                                const count = isConvert ? convert.fieldCount : fieldCounts[m.id as CrmModuleKey];
                                const hasUnsaved = isConvert ? convert.hasUnsaved : unsaved.has(m.id as CrmModuleKey);
                                return (
                                    <Box
                                        key={m.id}
                                        ref={(el: HTMLElement | null) => {
                                            if (el) tabRefs.current.set(m.id, el);
                                            else tabRefs.current.delete(m.id);
                                        }}
                                        role="tab"
                                        aria-selected={active}
                                        aria-label={`${m.label}${count !== undefined ? `, ${count} active fields` : ''}${hasUnsaved ? ', unsaved changes' : ''}`}
                                        // With nothing selected yet, the first form keeps the tablist reachable by keyboard.
                                        tabIndex={active || (value === null && !convert.active && m.id === ORDER[0]) ? 0 : -1}
                                        onClick={() => open(m.id)}
                                        onKeyDown={onKeyDown(m.id)}
                                        sx={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 0.75,
                                            px: 1.25,
                                            py: 0.6,
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            userSelect: 'none',
                                            whiteSpace: 'nowrap',
                                            outline: 'none',
                                            fontSize: '0.82rem',
                                            fontWeight: active ? 700 : 600,
                                            transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease',
                                            ...(isConvert
                                                ? // Tinted with a dashed edge: Convert Lead is composed of other forms, not a form of its own.
                                                  {
                                                      backgroundColor: active ? CONVERT_TINT.strong : CONVERT_TINT.soft,
                                                      border: `1px ${active ? 'solid' : 'dashed'} ${CONVERT_TINT.border}`,
                                                      color: active ? 'var(--crm-slate-900)' : 'var(--crm-slate-700)',
                                                      ...(active ? { borderColor: 'var(--mui-palette-warning-main)' } : {}),
                                                      '&:hover': { backgroundColor: CONVERT_TINT.strong, borderColor: 'var(--mui-palette-warning-main)', color: 'var(--crm-slate-900)' },
                                                  }
                                                : active
                                                  ? {
                                                        background: 'linear-gradient(135deg, var(--crm-blue-50) 0%, var(--crm-blue-100) 100%)',
                                                        border: '1px solid var(--crm-blue-400)',
                                                        color: 'var(--crm-text-blue-900)',
                                                        boxShadow: '0 1px 3px rgb(var(--crm-accent-rgb) / 0.12)',
                                                    }
                                                  : {
                                                        backgroundColor: 'var(--mui-palette-background-subtle)',
                                                        border: '1px solid var(--mui-palette-border-main)',
                                                        color: 'var(--crm-slate-700)',
                                                        '&:hover': { backgroundColor: 'var(--mui-palette-background-hover)', borderColor: 'var(--mui-palette-border-strong)', color: 'var(--crm-slate-900)' },
                                                    }),
                                            '&:focus-visible': { boxShadow: '0 0 0 2px var(--crm-blue-300)' },
                                        }}
                                    >
                                        <Box
                                            component="span"
                                            sx={{ display: 'flex', color: isConvert ? CONVERT_TINT.text : active ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-secondary)' }}
                                        >
                                            {isConvert ? CONVERT_ICON : MODULE_ICONS[m.id as CrmModuleKey]}
                                        </Box>
                                        <span>{m.label}</span>
                                        {count !== undefined && (
                                            <Box
                                                component="span"
                                                title={`${count} active field${count === 1 ? '' : 's'}`}
                                                sx={{
                                                    px: 0.7,
                                                    borderRadius: '9999px',
                                                    fontSize: '0.66rem',
                                                    fontWeight: 700,
                                                    lineHeight: 1.6,
                                                    border: `1px solid ${isConvert ? CONVERT_TINT.border : active ? 'var(--crm-blue-300)' : 'var(--mui-palette-border-main)'}`,
                                                    backgroundColor: 'var(--mui-palette-background-paper)',
                                                    color: isConvert ? CONVERT_TINT.text : active ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-secondary)',
                                                }}
                                            >
                                                {count}
                                            </Box>
                                        )}
                                        {hasUnsaved && (
                                            <Box
                                                component="span"
                                                title="Unsaved changes"
                                                sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#f59e0b', flexShrink: 0, boxShadow: '0 0 0 2px var(--crm-amber-100)' }}
                                            />
                                        )}
                                    </Box>
                                );
                            })}
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
}
