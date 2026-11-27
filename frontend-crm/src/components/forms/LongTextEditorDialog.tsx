'use client';

import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { fieldSx } from './FormField';
import { CharacterCounter } from './CharacterCounter';

export interface LongTextEditorDialogProps {
    open: boolean;
    /** Field label, shown as the dialog title. */
    label: string;
    value: string;
    maxLength?: number;
    placeholder?: string;
    /** Called with the edited text when the user presses Done (Ctrl / ⌘ + Enter). */
    onApply: (value: string) => void;
    onClose: () => void;
}

/**
 * Larger editor for a long text field, opened from the field's expand button. Edits a copy: Done writes it back to
 * the field, Cancel / Escape / the close button leave the field as it was.
 */
export function LongTextEditorDialog({ open, label, value, maxLength, placeholder, onApply, onClose }: LongTextEditorDialogProps) {
    const [draft, setDraft] = React.useState(value);
    const titleId = React.useId();
    const inputRef = React.useRef<HTMLTextAreaElement>(null);

    // Each opening starts from the field's current text (state adjusted while rendering, not in an effect).
    const [wasOpen, setWasOpen] = React.useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setDraft(value);
    }

    const apply = () => {
        onApply(maxLength ? draft.slice(0, maxLength) : draft);
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="md"
            aria-labelledby={titleId}
            slotProps={{
                // The dialog's focus trap takes focus as it opens: hand it to the text once the dialog is in.
                transition: { onEntered: () => inputRef.current?.focus() },
                paper: {
                    sx: {
                        borderRadius: '12px',
                        // Phones: full width minus a small margin, content scrolls inside.
                        m: { xs: 1.5, sm: 4 },
                        width: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 64px)' },
                        maxHeight: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 64px)' },
                        backgroundColor: 'var(--mui-palette-background-paper)',
                    },
                },
            }}
        >
            <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1, pr: 1.5 }}>
                <Typography id={titleId} sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: '1.02rem', color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>
                    {label}
                </Typography>
                <IconButton
                    onClick={onClose}
                    aria-label="Close without applying"
                    sx={{
                        width: 36,
                        height: 36,
                        color: 'var(--mui-palette-text-secondary)',
                        border: '1px solid transparent',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                            color: 'var(--mui-palette-error-main)',
                            backgroundColor: 'var(--mui-palette-error-soft)',
                            borderColor: 'var(--mui-palette-error-softBorder)',
                        },
                    }}
                >
                    <CloseRoundedIcon sx={{ fontSize: 20 }} />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ pt: '4px !important', pb: 1 }}>
                <TextField
                    autoFocus
                    inputRef={inputRef}
                    fullWidth
                    multiline
                    minRows={12}
                    maxRows={24}
                    size="small"
                    value={draft}
                    placeholder={placeholder}
                    onChange={(e) => setDraft(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
                    onFocus={(e) => {
                        // Caret at the end, where people usually carry on writing.
                        const el = e.target as HTMLTextAreaElement;
                        el.setSelectionRange(el.value.length, el.value.length);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            apply();
                        }
                        // Enter adds a new line here: keep it from reaching "Enter to save" handlers of the form or
                        // dialog this editor was opened from. Escape still closes the editor.
                        if (e.key !== 'Escape') e.stopPropagation();
                    }}
                    slotProps={{
                        htmlInput: { maxLength, 'aria-labelledby': titleId },
                    }}
                    sx={{
                        ...fieldSx,
                        '& textarea': { resize: 'none', lineHeight: 1.55 },
                    }}
                />
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    {maxLength ? <CharacterCounter length={draft.length} maxLength={maxLength} /> : null}
                    <Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>
                        Ctrl / ⌘ + Enter to apply
                    </Typography>
                </Box>
                <Button
                    variant="outlined"
                    onClick={onClose}
                    sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: '1px solid var(--mui-palette-border-main)',
                        color: 'var(--crm-slate-700)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                            borderColor: 'var(--crm-blue-300)',
                            backgroundColor: 'var(--mui-palette-primary-soft)',
                            color: 'var(--crm-text-blue-700)',
                        },
                    }}
                >
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={apply}
                    sx={{
                        textTransform: 'none',
                        fontWeight: 700,
                        borderRadius: '8px',
                        boxShadow: 'none',
                        color: '#ffffff',
                        background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                        '&:hover': {
                            boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
                            background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
                        },
                    }}
                >
                    Done
                </Button>
            </DialogActions>
        </Dialog>
    );
}
