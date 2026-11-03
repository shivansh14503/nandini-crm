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
import { CRM_MODULE_GROUPS, type CrmModuleGroupKey, type CrmModuleKey } from '@/types/formConfig.types';

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

/** Every form in navbar order: the arrow keys walk this list across groups. */
const ORDER: CrmModuleKey[] = CRM_MODULE_GROUPS.flatMap((g) => g.modules.map((m) => m.key));

/**
 * The forms grouped like the top navbar (Sales, Support, Inventory, All). Each form shows its icon, its number
 * of active fields and an amber dot while it has unsaved changes.
 *
 * Keyboard: one tab stop (the selected form); arrow keys / Home / End move between forms, Enter or Space opens one.
 */
export function ModuleHierarchySelector({
    value,
    onChange,
    fieldCounts,
    unsaved,
}: {
    value: CrmModuleKey;
    onChange: (module: CrmModuleKey) => void;
    /** Active fields per form. */
    fieldCounts: Partial<Record<CrmModuleKey, number>>;
    /** Forms with unsaved changes. */
    unsaved: Set<CrmModuleKey>;
}) {
    const tabRefs = useRef(new Map<CrmModuleKey, HTMLElement>());

    const focusAt = (index: number) => {
        const key = ORDER[(index + ORDER.length) % ORDER.length];
        tabRefs.current.get(key)?.focus();
    };

    const onKeyDown = (module: CrmModuleKey) => (e: React.KeyboardEvent) => {
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
                onChange(module);
                break;
        }
    };

    return (
        <Box role="tablist" aria-label="CRM forms" aria-orientation="horizontal" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'stretch' }}>
            {CRM_MODULE_GROUPS.map((group) => {
                const groupActive = group.modules.some((m) => m.key === value);
                const headingId = `form-group-${group.key}`;
                return (
                    <Box
                        key={group.key}
                        role="group"
                        aria-labelledby={headingId}
                        sx={{
                            backgroundColor: '#ffffff',
                            border: `1px solid ${groupActive ? '#bfdbfe' : '#e2e8f0'}`,
                            borderRadius: '10px',
                            px: 1.25,
                            py: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.85,
                            // Sales holds five forms: let it take the room, the single-form groups stay compact.
                            flex: group.modules.length > 1 ? '1 1 420px' : '0 1 auto',
                            minWidth: 0,
                            transition: 'border-color 150ms ease',
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, color: groupActive ? '#2563eb' : '#64748b' }}>
                            {GROUP_ICONS[group.key]}
                            <Typography
                                id={headingId}
                                sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748b' }}
                            >
                                {group.label}
                            </Typography>
                            <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>
                                · {group.modules.length} form{group.modules.length === 1 ? '' : 's'}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                            {group.modules.map((m) => {
                                const active = m.key === value;
                                const count = fieldCounts[m.key];
                                const hasUnsaved = unsaved.has(m.key);
                                return (
                                    <Box
                                        key={m.key}
                                        ref={(el: HTMLElement | null) => {
                                            if (el) tabRefs.current.set(m.key, el);
                                            else tabRefs.current.delete(m.key);
                                        }}
                                        role="tab"
                                        aria-selected={active}
                                        aria-label={`${m.label}${count !== undefined ? `, ${count} active fields` : ''}${hasUnsaved ? ', unsaved changes' : ''}`}
                                        tabIndex={active ? 0 : -1}
                                        onClick={() => onChange(m.key)}
                                        onKeyDown={onKeyDown(m.key)}
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
                                            ...(active
                                                ? {
                                                      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                                                      border: '1px solid #60a5fa',
                                                      color: '#1e3a8a',
                                                      boxShadow: '0 1px 3px rgba(37, 99, 235, 0.12)',
                                                  }
                                                : {
                                                      backgroundColor: '#f8fafc',
                                                      border: '1px solid #e2e8f0',
                                                      color: '#334155',
                                                      '&:hover': { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1', color: '#0f172a' },
                                                  }),
                                            '&:focus-visible': { boxShadow: '0 0 0 2px #93c5fd' },
                                        }}
                                    >
                                        <Box component="span" sx={{ display: 'flex', color: active ? '#2563eb' : '#64748b' }}>
                                            {MODULE_ICONS[m.key]}
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
                                                    border: `1px solid ${active ? '#93c5fd' : '#e2e8f0'}`,
                                                    backgroundColor: active ? '#ffffff' : '#ffffff',
                                                    color: active ? '#2563eb' : '#64748b',
                                                }}
                                            >
                                                {count}
                                            </Box>
                                        )}
                                        {hasUnsaved && (
                                            <Box
                                                component="span"
                                                title="Unsaved changes"
                                                sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#f59e0b', flexShrink: 0, boxShadow: '0 0 0 2px #fef3c7' }}
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
