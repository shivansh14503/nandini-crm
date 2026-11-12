'use client';

import React from 'react';
import { Alert, Box } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useBuilder, useBuilderEnv, type PanelTab } from '../state/builderState';
import { ContentsTab } from './ContentsTab';
import { StylingTab, type TemplateMeta } from './StylingTab';

/** Left sidebar: "Contents" (what to add) and "Styling" (settings of the selection; switches here on select). */
export function LeftPanel(props: { meta: TemplateMeta; onMetaChange: (patch: Partial<TemplateMeta>) => void; isNew: boolean; isCurrentDefault: boolean }) {
    const { panelTab, setPanelTab } = useBuilder();
    const { readOnly } = useBuilderEnv();
    const tabs: { key: PanelTab; label: string }[] = [
        { key: 'contents', label: 'Contents' },
        { key: 'styling', label: 'Styling' },
    ];
    return (
        <Box
            component="aside"
            aria-label="Template builder panel"
            sx={{ width: { xs: '100%', md: 380 }, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: { md: '1px solid #e2e8f0' }, backgroundColor: '#fff' }}
        >
            <Box role="tablist" aria-label="Panel" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #e2e8f0' }}>
                {tabs.map((t) => {
                    const active = panelTab === t.key;
                    return (
                        <Box
                            key={t.key}
                            role="tab"
                            tabIndex={0}
                            aria-selected={active}
                            onClick={() => setPanelTab(t.key)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setPanelTab(t.key);
                                }
                            }}
                            sx={{
                                textAlign: 'center',
                                py: 1.5,
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                fontWeight: active ? 700 : 500,
                                color: active ? '#0f172a' : '#64748b',
                                borderBottom: `2px solid ${active ? '#1d4ed8' : 'transparent'}`,
                                mb: '-1px',
                                '&:hover': { color: '#0f172a' },
                            }}
                        >
                            {t.label}
                        </Box>
                    );
                })}
            </Box>
            {readOnly && (
                <Alert severity="info" icon={<LockOutlinedIcon sx={{ fontSize: 18 }} />} sx={{ borderRadius: 0, py: 0.25, fontSize: '0.76rem', alignItems: 'center' }}>
                    Built-in template: settings are read-only. Click <strong>Duplicate to edit</strong> (top right) to change it.
                </Alert>
            )}
            {panelTab === 'contents' ? <ContentsTab /> : <StylingTab {...props} />}
        </Box>
    );
}
