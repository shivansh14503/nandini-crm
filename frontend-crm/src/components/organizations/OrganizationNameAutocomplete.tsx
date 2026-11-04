'use client';

import React from 'react';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
    InputAdornment,
    Paper,
    Popper,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import ApartmentIcon from '@mui/icons-material/Apartment';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { fieldSx, FIELD_MAX_LENGTH } from '@/components/forms';
import { ROUTES } from '@/config/constants';
import { isDuplicateMatchKind } from '@/utils/organizationName';
import type { OrganizationNameSuggestion, OrganizationSuggestionRecord } from './useOrganizationNameCheck';

export interface OrganizationNameAutocompleteProps {
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    /** Id of the organization being edited (only used to build stable element ids). */
    organizationId?: string;
    disabled?: boolean;
    readOnly?: boolean;
    placeholder?: string;
    error?: boolean;
    helperText?: React.ReactNode;
    /** Shows a spinner while the server check is pending. */
    checking?: boolean;
    /** Shows the green tick (valid and no exact / canonical duplicate). */
    verified?: boolean;
    suggestions: OrganizationNameSuggestion[];
    /** "Use name" action: adopts the existing organization's exact name. Hidden when omitted. */
    onSelectSuggestion?: (org: OrganizationSuggestionRecord) => void;
    /** Opening a suggestion (row click / Enter). Defaults to the record's detail page in a new tab. */
    onViewSuggestion?: (org: OrganizationSuggestionRecord) => void;
    autoFocus?: boolean;
}

const MIN_OPEN_LENGTH = 2;

const MATCH_LABEL: Record<OrganizationNameSuggestion['matchKind'], string> = {
    exact: 'Same organization',
    canonical: 'Same organization',
    core: 'Same name, different suffix',
    prefix: 'Similar name',
    fuzzy: 'Similar spelling',
};

/** Bolds the parts of `name` that the typed text matches (each typed word of 2+ characters). */
function highlight(name: string, query: string): React.ReactNode {
    const words = query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 2)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (words.length === 0) return name;
    const parts = name.split(new RegExp(`(${words.join('|')})`, 'gi'));
    return parts.map((part, i) =>
        i % 2 === 1 ? (
            <Box key={i} component="span" sx={{ color: '#1d4ed8', fontWeight: 800 }}>
                {part}
            </Box>
        ) : (
            <React.Fragment key={i}>{part}</React.Fragment>
        )
    );
}

const openInNewTab = (org: OrganizationSuggestionRecord) => {
    window.open(ROUTES.ORGANIZATION_DETAIL(org.id), '_blank', 'noopener');
};

/**
 * Organization name input with a dropdown of existing organizations that match it exactly, by legal name
 * ("ABC Private Limited" ≡ "ABC Pvt Ltd"), by core name, or by similar spelling — so users notice a record
 * already exists before creating a duplicate. ↑/↓ + Enter opens a suggestion, Esc closes the list.
 */
export function OrganizationNameAutocomplete({
    value,
    onChange,
    onBlur,
    organizationId,
    disabled = false,
    readOnly = false,
    placeholder = 'e.g. Mohit Traders Pvt Ltd',
    error = false,
    helperText,
    checking = false,
    verified = false,
    suggestions,
    onSelectSuggestion,
    onViewSuggestion = openInNewTab,
    autoFocus,
}: OrganizationNameAutocompleteProps) {
    const [anchorEl, setAnchorEl] = React.useState<HTMLDivElement | null>(null);
    const [focused, setFocused] = React.useState(false);
    const [dismissed, setDismissed] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(-1);

    const listId = `org-name-suggestions-${organizationId ?? 'new'}`;
    const trimmed = value.trim();
    const editable = !disabled && !readOnly;
    const open = editable && focused && !dismissed && trimmed.length >= MIN_OPEN_LENGTH && suggestions.length > 0;
    const duplicateCount = suggestions.filter((s) => isDuplicateMatchKind(s.matchKind)).length;
    const highlighted = activeIndex >= 0 && activeIndex < suggestions.length ? activeIndex : -1;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open) {
            if (e.key === 'ArrowDown' && suggestions.length > 0 && trimmed.length >= MIN_OPEN_LENGTH) {
                e.preventDefault();
                setDismissed(false);
                setActiveIndex(0);
            }
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            // Don't let the Escape also close a surrounding drawer / dialog.
            e.stopPropagation();
            setDismissed(true);
            setActiveIndex(-1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        } else if (e.key === 'Enter' && highlighted >= 0) {
            // Only once the user has moved into the list; a plain Enter keeps its usual meaning.
            e.preventDefault();
            onViewSuggestion(suggestions[highlighted].record);
        }
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Box ref={setAnchorEl}>
                <TextField
                    fullWidth
                    size="small"
                    placeholder={placeholder}
                    value={value}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    onChange={(e) => {
                        onChange(e.target.value);
                        setDismissed(false);
                        setActiveIndex(-1);
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => {
                        setFocused(false);
                        setActiveIndex(-1);
                        onBlur?.();
                    }}
                    onKeyDown={handleKeyDown}
                    error={error}
                    helperText={helperText}
                    sx={fieldSx}
                    slotProps={{
                        input: {
                            readOnly,
                            endAdornment: trimmed ? (
                                <InputAdornment position="end">
                                    {checking ? (
                                        <CircularProgress size={16} />
                                    ) : verified ? (
                                        <VerifiedIcon sx={{ fontSize: 18, color: '#16a34a' }} />
                                    ) : null}
                                </InputAdornment>
                            ) : undefined,
                        },
                        htmlInput: {
                            maxLength: FIELD_MAX_LENGTH.organizationName,
                            role: 'combobox',
                            autoComplete: 'off',
                            'aria-autocomplete': 'list',
                            'aria-expanded': open,
                            'aria-controls': open ? listId : undefined,
                            'aria-activedescendant': open && highlighted >= 0 ? `${listId}-${highlighted}` : undefined,
                        },
                    }}
                />
            </Box>

            <Popper
                open={open}
                anchorEl={anchorEl}
                placement="bottom-start"
                sx={{ zIndex: 1400 }}
                modifiers={[{ name: 'offset', options: { offset: [0, 6] } }]}
            >
                <Paper
                    elevation={0}
                    // Keep focus in the input so clicks inside the list don't close it first.
                    onMouseDown={(e) => e.preventDefault()}
                    sx={{
                        width: Math.max(anchorEl?.clientWidth ?? 0, 380),
                        maxWidth: 'calc(100vw - 32px)',
                        maxHeight: 400,
                        overflowY: 'auto',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.14)',
                    }}
                >
                    {/* Header */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.75,
                            px: 1.75,
                            py: 0.9,
                            borderBottom: '1px solid #f1f5f9',
                            backgroundColor: duplicateCount > 0 ? '#fffbeb' : '#f8fafc',
                            color: duplicateCount > 0 ? '#b45309' : '#64748b',
                            position: 'sticky',
                            top: 0,
                            zIndex: 1,
                        }}
                    >
                        {duplicateCount > 0 ? <WarningAmberRoundedIcon sx={{ fontSize: 16 }} /> : <ApartmentIcon sx={{ fontSize: 16 }} />}
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', flex: 1 }}>
                            {duplicateCount > 0 ? 'Already in CRM' : 'Existing / similar organizations in CRM'}
                        </Typography>
                        <Box
                            component="span"
                            sx={{
                                fontSize: '0.66rem',
                                fontWeight: 700,
                                color: duplicateCount > 0 ? '#b45309' : '#1d4ed8',
                                backgroundColor: duplicateCount > 0 ? '#fef3c7' : '#eff6ff',
                                borderRadius: '999px',
                                px: 0.75,
                                lineHeight: 1.6,
                            }}
                        >
                            {suggestions.length}
                        </Box>
                    </Box>

                    <Box id={listId} role="listbox" aria-label="Existing organizations" sx={{ py: 0.5 }}>
                        {suggestions.map((suggestion, index) => {
                            const { record, matchKind } = suggestion;
                            const same = isDuplicateMatchKind(matchKind);
                            const active = index === highlighted;
                            const isActiveStatus = (record.accountStatus ?? 'Active') === 'Active';
                            const location = [record.billingCity, record.billingState].filter(Boolean).join(', ');
                            const details = [location, record.gstNo ? `GST: ${record.gstNo}` : ''].filter(Boolean).join(' • ');
                            return (
                                <Box
                                    key={record.id}
                                    id={`${listId}-${index}`}
                                    role="option"
                                    aria-selected={active}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onClick={() => onViewSuggestion(record)}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 1.25,
                                        px: 1.75,
                                        py: 1,
                                        cursor: 'pointer',
                                        borderLeft: '3px solid',
                                        borderLeftColor: same ? '#f59e0b' : 'transparent',
                                        backgroundColor: active ? (same ? '#fffbeb' : '#eff6ff') : 'transparent',
                                    }}
                                >
                                    <Box sx={{ color: same ? '#d97706' : active ? '#2563eb' : '#94a3b8', display: 'flex', pt: 0.25 }}>
                                        <ApartmentIcon sx={{ fontSize: 18 }} />
                                    </Box>
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>
                                                {highlight(record.organizationName, trimmed)}
                                            </Typography>
                                            <Typography
                                                component="span"
                                                sx={{
                                                    fontSize: '0.66rem',
                                                    fontWeight: 700,
                                                    color: '#475569',
                                                    backgroundColor: '#f1f5f9',
                                                    borderRadius: '6px',
                                                    px: 0.75,
                                                    py: 0.15,
                                                    fontFamily: 'monospace',
                                                }}
                                            >
                                                {record.accountCode}
                                            </Typography>
                                            <Box
                                                component="span"
                                                title={record.accountStatus || 'Active'}
                                                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: '0.68rem', fontWeight: 600, color: isActiveStatus ? '#15803d' : '#64748b' }}
                                            >
                                                <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: isActiveStatus ? '#22c55e' : '#94a3b8' }} />
                                                {record.accountStatus || 'Active'}
                                            </Box>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.4, flexWrap: 'wrap' }}>
                                            <Chip
                                                size="small"
                                                label={MATCH_LABEL[matchKind]}
                                                sx={{
                                                    height: 20,
                                                    fontSize: '0.66rem',
                                                    fontWeight: 700,
                                                    color: same ? '#b45309' : '#1e40af',
                                                    backgroundColor: same ? '#fef3c7' : '#e0e7ff',
                                                }}
                                            />
                                            {matchKind === 'canonical' && (
                                                <Typography sx={{ fontSize: '0.72rem', color: '#92400e' }}>
                                                    Written as “{record.organizationName}”
                                                </Typography>
                                            )}
                                            {details && (
                                                <Typography noWrap sx={{ fontSize: '0.72rem', color: '#64748b', minWidth: 0 }}>
                                                    {details}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
                                        {onSelectSuggestion && (
                                            <Tooltip title="Replace what you typed with this existing name">
                                                <Button
                                                    size="small"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelectSuggestion(record);
                                                        setDismissed(true);
                                                    }}
                                                    sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 700, minWidth: 0, px: 1, color: '#2563eb' }}
                                                >
                                                    Use name
                                                </Button>
                                            </Tooltip>
                                        )}
                                        <Tooltip title="View existing organization (new tab)">
                                            <IconButton
                                                size="small"
                                                aria-label={`View ${record.organizationName}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onViewSuggestion(record);
                                                }}
                                                sx={{ color: '#64748b', '&:hover': { color: '#2563eb' } }}
                                            >
                                                <OpenInNewIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                </Paper>
            </Popper>
        </Box>
    );
}
