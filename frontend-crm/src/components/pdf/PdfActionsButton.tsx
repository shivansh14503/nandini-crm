'use client';

import React, { useState } from 'react';
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    IconButton,
    ListItemIcon,
    ListItemText,
    ListSubheader,
    Menu,
    MenuItem,
    Tooltip,
} from '@mui/material';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { AppToast } from '@/components/common/AppToast';
import { usePdfTemplates } from '@/hooks/queries/usePdfTemplates';
import type { PdfModule } from '@/types/pdfTemplate.types';
import { usePdfActions } from './usePdfActions';
import { useSelectedPdfTemplate } from './useSelectedPdfTemplate';

export interface PdfActionsButtonProps {
    module: PdfModule;
    recordId: string | undefined;
    /** `split` (page headers) or a compact `icon` button (drawer headers). */
    variant?: 'split' | 'icon';
    disabled?: boolean;
}

const gradient = 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)';
const gradientHover = 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)';

const baseSx = {
    background: gradient,
    color: '#fff',
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.82rem',
    height: 36,
    boxShadow: 'none',
    '&:hover': { background: gradientHover, boxShadow: 'none' },
    '&.Mui-disabled': { background: '#cbd5e1', color: '#fff' },
} as const;

const menuItemSx = { fontSize: '0.84rem', fontWeight: 500, color: '#334155' } as const;
const menuTextProps = { primary: { sx: { fontSize: '0.84rem' } } } as const;

const iconButtonSx = {
    width: 30,
    height: 30,
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    color: '#64748b',
    backgroundColor: '#ffffff',
    '&:hover': { color: '#1d4ed8', backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
} as const;

/** "Print / PDF" split button: preview (main action), download, print and the template to use. */
export function PdfActionsButton({ module, recordId, variant = 'split', disabled }: PdfActionsButtonProps) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [open, setOpen] = useState(false);
    const templatesQuery = usePdfTemplates({ module });
    const templates = templatesQuery.data;
    const { selected, select } = useSelectedPdfTemplate(module, templates);
    const { preview, download, print, busy, toast, closeToast } = usePdfActions({ module, recordId });

    const noTemplates = templatesQuery.isSuccess && (templates?.length ?? 0) === 0;
    const isDisabled = Boolean(disabled || !recordId || noTemplates || templatesQuery.isError);
    const tooltip = noTemplates
        ? 'No active PDF templates. Ask an administrator to activate one.'
        : templatesQuery.isError
          ? 'PDF templates could not be loaded.'
          : '';

    const run = (fn: () => void) => () => {
        setOpen(false);
        fn();
    };
    const templateId = selected?.id;
    const busyIcon = <CircularProgress size={14} sx={{ color: 'inherit' }} />;

    const trigger =
        variant === 'icon' ? (
            <Tooltip title={tooltip || 'Print / PDF'}>
                <span>
                    <IconButton
                        size="small"
                        ref={setAnchorEl}
                        aria-label="Print or download PDF"
                        aria-haspopup="menu"
                        aria-expanded={open}
                        disabled={isDisabled}
                        onClick={() => setOpen((o) => !o)}
                        sx={iconButtonSx}
                    >
                        {busy ? busyIcon : <PictureAsPdfOutlinedIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                </span>
            </Tooltip>
        ) : (
            <Tooltip title={tooltip}>
                <Box ref={setAnchorEl} sx={{ display: 'inline-flex' }}>
                    <Button
                        variant="contained"
                        size="small"
                        disabled={isDisabled}
                        startIcon={busy ? busyIcon : <PictureAsPdfOutlinedIcon sx={{ fontSize: 16 }} />}
                        onClick={() => preview(templateId)}
                        aria-label={`Preview PDF${selected ? ` (${selected.name} template)` : ''}`}
                        sx={{ ...baseSx, px: 2, borderRadius: '8px 0 0 8px' }}
                    >
                        Print / PDF
                    </Button>
                    <Button
                        variant="contained"
                        size="small"
                        disabled={isDisabled}
                        aria-label="More PDF options"
                        aria-haspopup="menu"
                        aria-expanded={open}
                        onClick={() => setOpen((o) => !o)}
                        sx={{ ...baseSx, minWidth: 34, px: 0.5, borderRadius: '0 8px 8px 0', borderLeft: '1px solid rgba(255,255,255,0.35)' }}
                    >
                        <KeyboardArrowDownIcon sx={{ fontSize: 20 }} />
                    </Button>
                </Box>
            </Tooltip>
        );

    return (
        <>
            {trigger}
            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={() => setOpen(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                // Detail drawers sit at z-index 1310–1400 (CommonMasterView); MUI's default 1300 would open the menu behind them.
                sx={{ zIndex: 1450 }}
                slotProps={{
                    paper: { sx: { mt: 0.5, minWidth: 250, border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(15,23,42,0.10)' } },
                }}
            >
                <MenuItem onClick={run(() => preview(templateId))} sx={menuItemSx}>
                    <ListItemIcon sx={{ minWidth: 30 }}>
                        <OpenInNewIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                    </ListItemIcon>
                    <ListItemText slotProps={menuTextProps}>Preview</ListItemText>
                </MenuItem>
                <MenuItem onClick={run(() => void download(templateId))} disabled={busy !== null} sx={menuItemSx}>
                    <ListItemIcon sx={{ minWidth: 30 }}>
                        {busy === 'download' ? <CircularProgress size={16} /> : <DownloadIcon sx={{ fontSize: 18, color: '#2563eb' }} />}
                    </ListItemIcon>
                    <ListItemText slotProps={menuTextProps}>Download PDF</ListItemText>
                </MenuItem>
                <MenuItem onClick={run(() => void print(templateId))} disabled={busy !== null} sx={menuItemSx}>
                    <ListItemIcon sx={{ minWidth: 30 }}>
                        {busy === 'print' ? <CircularProgress size={16} /> : <PrintIcon sx={{ fontSize: 18, color: '#2563eb' }} />}
                    </ListItemIcon>
                    <ListItemText slotProps={menuTextProps}>Print</ListItemText>
                </MenuItem>
                <Divider sx={{ my: 0.5 }} />
                <ListSubheader sx={{ lineHeight: '28px', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Template
                </ListSubheader>
                {(templates ?? []).map((t) => {
                    const checked = t.id === templateId;
                    return (
                        <MenuItem
                            key={t.id}
                            role="menuitemradio"
                            aria-checked={checked}
                            selected={checked}
                            onClick={() => select(t.id)}
                            sx={menuItemSx}
                        >
                            <ListItemIcon sx={{ minWidth: 30 }}>
                                {checked ? <RadioButtonCheckedIcon sx={{ fontSize: 18, color: '#2563eb' }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: '#94a3b8' }} />}
                            </ListItemIcon>
                            <ListItemText slotProps={menuTextProps}>{t.name}</ListItemText>
                            {t.isDefault && (
                                <Box
                                    component="span"
                                    sx={{ ml: 1, px: 0.75, py: 0.1, borderRadius: '6px', fontSize: '0.66rem', fontWeight: 700, color: '#1d4ed8', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}
                                >
                                    Default
                                </Box>
                            )}
                        </MenuItem>
                    );
                })}
            </Menu>
            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={closeToast} />
        </>
    );
}

export default PdfActionsButton;
