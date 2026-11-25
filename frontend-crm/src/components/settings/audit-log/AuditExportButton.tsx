'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, CircularProgress, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import { errorMessage, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { auditAdminService, type AuditExport, type AuditExportFormat, type AuditListQuery } from '@/services/auditAdmin.service';
import { AUDIT_LOG_KEY } from './auditLogUi';

const FORMATS: { format: AuditExportFormat; label: string; hint: string; icon: React.ReactNode }[] = [
    { format: 'xlsx', label: 'Excel (.xlsx)', hint: 'Up to 500,000 entries', icon: <GridOnOutlinedIcon fontSize="small" /> },
    { format: 'csv', label: 'CSV (.csv)', hint: 'Up to 1,000,000 entries', icon: <DescriptionOutlinedIcon fontSize="small" /> },
];
const POLL_MS = 1500;
const count = (value: number) => value.toLocaleString('en-IN');
const isPending = (row: AuditExport) => row.status === 'queued' || row.status === 'running';

/** Hands the finished file to the browser, which streams it to disk (the session cookie authenticates it). */
function download(id: string) {
    const anchor = document.createElement('a');
    anchor.href = auditAdminService.exportDownloadUrl(id);
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

/**
 * The Export toolbar button (format menu) and the export's progress / result shown under the toolbar. `hint`: the
 * button's tooltip (default: everything that matches the current filter).
 */
export function useAuditExport(query: AuditListQuery, { hint = 'Download everything that matches the current filter, newest first' }: { hint?: string } = {}) {
    const queryClient = useQueryClient();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [current, setCurrent] = useState<AuditExport | null>(null);
    const downloaded = useRef<string | null>(null);

    const start = useMutation({
        mutationFn: (format: AuditExportFormat) => auditAdminService.createExport(format, query),
        onSuccess: (row) => setCurrent(row),
    });
    const poll = useQuery({
        queryKey: [...AUDIT_LOG_KEY, 'export', current?.id],
        queryFn: () => auditAdminService.getExport(current!.id),
        enabled: Boolean(current && isPending(current)),
        // Until the export has finished one way or the other.
        refetchInterval: (q) => (q.state.data && !isPending(q.state.data) ? false : POLL_MS),
    });
    const latest = poll.data && poll.data.id === current?.id ? poll.data : current;

    // Download once, as soon as the file is ready; the export is then in the log too.
    useEffect(() => {
        if (latest?.status !== 'completed' || downloaded.current === latest.id) return;
        downloaded.current = latest.id;
        download(latest.id);
        void queryClient.invalidateQueries({ queryKey: [...AUDIT_LOG_KEY, 'list'] });
    }, [latest, queryClient]);

    const busy = start.isPending || Boolean(latest && isPending(latest));

    // The tooltip wraps only the button: React events from the menu (a portal) would otherwise bubble up and open it.
    const button = (
        <>
            <Tooltip title={hint}>
                <span>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={busy ? <CircularProgress size={14} /> : <FileDownloadOutlinedIcon />}
                        endIcon={<KeyboardArrowDownRoundedIcon />}
                        sx={{ ...secondaryButtonSx, height: 36 }}
                        disabled={busy}
                        onClick={(e) => setAnchor(e.currentTarget)}
                        aria-haspopup="menu"
                    >
                        Export
                    </Button>
                </span>
            </Tooltip>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { borderRadius: '10px', minWidth: 230 } } }}>
                {FORMATS.map((f) => (
                    <MenuItem
                        key={f.format}
                        onClick={() => {
                            setAnchor(null);
                            setCurrent(null);
                            start.mutate(f.format);
                        }}
                    >
                        <ListItemIcon sx={{ color: 'var(--mui-palette-text-secondary)' }}>{f.icon}</ListItemIcon>
                        <ListItemText
                            primary={f.label}
                            secondary={f.hint}
                            slotProps={{ primary: { sx: { fontSize: '0.85rem', fontWeight: 600 } }, secondary: { sx: { fontSize: '0.72rem' } } }}
                        />
                    </MenuItem>
                ))}
            </Menu>
        </>
    );

    const status = start.isError ? (
        <Alert severity="error" onClose={() => start.reset()} sx={{ mx: 2, mt: 1.5, fontSize: '0.8rem' }}>
            {errorMessage(start.error, 'Could not start the export.')}
        </Alert>
    ) : latest ? (
        <ExportStatus row={latest} onDismiss={() => setCurrent(null)} onDownload={() => download(latest.id)} />
    ) : null;

    return { button, status };
}

function ExportStatus({ row, onDismiss, onDownload }: { row: AuditExport; onDismiss: () => void; onDownload: () => void }) {
    const format = row.format === 'csv' ? 'CSV' : 'Excel';
    const sx = { mx: 2, mt: 1.5, fontSize: '0.8rem', alignItems: 'center' } as const;
    if (isPending(row)) {
        return (
            <Alert severity="info" icon={<CircularProgress size={16} />} sx={sx}>
                Preparing the {format} file{row.rowCount > 0 ? `: ${count(row.rowCount)} entries so far` : ''}. It downloads by itself when it’s ready; you can keep
                working here.
            </Alert>
        );
    }
    if (row.status === 'failed' || row.status === 'expired') {
        return (
            <Alert severity="error" onClose={onDismiss} sx={sx}>
                {row.message ?? (row.status === 'expired' ? 'This export has expired. Please export again.' : 'The export failed. Please try again.')}
            </Alert>
        );
    }
    return (
        <Alert
            severity={row.truncated ? 'warning' : 'success'}
            onClose={onDismiss}
            sx={sx}
            action={
                <Button size="small" onClick={onDownload} sx={{ ...secondaryButtonSx, border: 'none', mr: 0.5 }}>
                    Download again
                </Button>
            }
        >
            {row.fileName} · {count(row.rowCount)} entr{row.rowCount === 1 ? 'y' : 'ies'}.
            {row.truncated && row.cap ? ` Only the newest ${count(row.cap)} fit in one file: narrow the dates or filters to export the rest.` : ''} The file is kept for
            24 hours.
        </Alert>
    );
}
