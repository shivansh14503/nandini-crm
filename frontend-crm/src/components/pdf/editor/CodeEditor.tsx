'use client';

import React, { useMemo } from 'react';
import CodeMirror, { EditorView, type Extension } from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';

export interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    language: 'html' | 'css';
    readOnly?: boolean;
    ariaLabel: string;
    /** Receives the editor view so the parent can insert text at the cursor. */
    onViewReady?: (view: EditorView | null) => void;
    height?: string;
}

const editorTheme = EditorView.theme({
    '&': { fontSize: '12.5px', backgroundColor: '#ffffff' },
    '.cm-content': { fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace" },
    '.cm-gutters': { backgroundColor: '#f8fafc', color: '#94a3b8', borderRight: '1px solid #e2e8f0' },
    '&.cm-focused': { outline: 'none' },
    '.cm-activeLine': { backgroundColor: '#f8fafc' },
});

/** CodeMirror 6 editor (loaded with next/dynamic, client only). */
export default function CodeEditor({ value, onChange, language, readOnly, ariaLabel, onViewReady, height = '100%' }: CodeEditorProps) {
    const extensions = useMemo<Extension[]>(
        () => [
            language === 'html' ? html({ autoCloseTags: true }) : css(),
            EditorView.lineWrapping,
            editorTheme,
            EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
        ],
        [ariaLabel, language],
    );
    return (
        <CodeMirror
            value={value}
            height={height}
            style={{ height }}
            extensions={extensions}
            editable={!readOnly}
            readOnly={readOnly}
            basicSetup={{ foldGutter: true, highlightActiveLine: !readOnly, autocompletion: true }}
            onChange={(next) => onChange(next)}
            onCreateEditor={(view) => onViewReady?.(view)}
        />
    );
}
