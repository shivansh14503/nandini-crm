'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { EditorContent, Node, mergeAttributes, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import { Box, Divider, IconButton, Tooltip } from '@mui/material';
import FormatBoldRoundedIcon from '@mui/icons-material/FormatBoldRounded';
import FormatItalicRoundedIcon from '@mui/icons-material/FormatItalicRounded';
import FormatUnderlinedRoundedIcon from '@mui/icons-material/FormatUnderlinedRounded';
import FormatAlignLeftRoundedIcon from '@mui/icons-material/FormatAlignLeftRounded';
import FormatAlignCenterRoundedIcon from '@mui/icons-material/FormatAlignCenterRounded';
import FormatAlignRightRoundedIcon from '@mui/icons-material/FormatAlignRightRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { richTextSchema, type BlockOf, type RichMark, type RichText, type Theme } from '@/lib/pdf-document';
import { FieldPickerButton } from '../common/FieldPicker';
import { useBuilder, useBuilderEnv } from '../state/builderState';

/**
 * Inline editing of a Title / Text block on the canvas (double-click). The content is TipTap JSON restricted to
 * the document's rich-text subset (paragraphs, bold / italic / underline / colour, alignment, line breaks and
 * field chips), validated before it is stored.
 */

const FieldNode = Node.create<{ labelFor: (path: string) => string }>({
    name: 'field',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addOptions() {
        return { labelFor: (path: string) => path };
    },
    addAttributes() {
        return { path: { default: '' } };
    },
    parseHTML() {
        return [{ tag: 'span[data-field]', getAttrs: (el) => ({ path: (el as HTMLElement).getAttribute('data-field') ?? '' }) }];
    },
    renderHTML({ node, HTMLAttributes }) {
        const path = String(node.attrs.path ?? '');
        return [
            'span',
            mergeAttributes(HTMLAttributes, {
                'data-field': path,
                contenteditable: 'false',
                style: 'display:inline-block;padding:0 4px;margin:0 1px;border-radius:4px;background:#dbeafe;color:#1e40af;font-size:0.9em;font-weight:600;line-height:1.35;white-space:nowrap',
            }),
            this.options.labelFor(path),
        ];
    },
    renderText({ node }) {
        return `{${String(node.attrs.path ?? '')}}`;
    },
});

/** TipTap JSON → the document's rich-text subset (unknown nodes / marks / attrs dropped). */
function toRichText(json: JSONContent): RichText {
    const paragraphs = (json.content ?? []).map((p) => {
        const align = p.attrs?.textAlign;
        const content = (p.content ?? []).flatMap((n): NonNullable<RichText['content'][number]['content']> => {
            const marks = (n.marks ?? []).flatMap((m): RichMark[] => {
                if (m.type === 'bold' || m.type === 'italic' || m.type === 'underline') return [{ type: m.type }];
                if (m.type === 'textStyle' && typeof m.attrs?.color === 'string' && m.attrs.color) return [{ type: 'textStyle' as const, attrs: { color: m.attrs.color as string } }];
                return [];
            });
            const withMarks = marks.length ? { marks } : {};
            if (n.type === 'text' && n.text) return [{ type: 'text', text: n.text, ...withMarks }];
            if (n.type === 'field' && typeof n.attrs?.path === 'string' && n.attrs.path) return [{ type: 'field', attrs: { path: n.attrs.path }, ...withMarks }];
            if (n.type === 'hardBreak') return [{ type: 'hardBreak' }];
            return [];
        });
        return {
            type: 'paragraph' as const,
            ...(align && align !== 'left' ? { attrs: { textAlign: align as 'center' | 'right' | 'justify' } } : {}),
            ...(content.length ? { content } : {}),
        };
    });
    const candidate: RichText = { type: 'doc', content: paragraphs.length ? paragraphs : [{ type: 'paragraph' }] };
    const parsed = richTextSchema.safeParse(candidate);
    return parsed.success ? parsed.data : { type: 'doc', content: [{ type: 'paragraph' }] };
}

const SWATCHES = ['#0f172a', '#475569', '#94a3b8', '#1d4ed8', '#047857', '#b91c1c', '#b45309', '#7c3aed'];

const tbBtn = (active: boolean) => ({ width: 26, height: 26, borderRadius: '6px', color: active ? '#1d4ed8' : '#334155', backgroundColor: active ? '#dbeafe' : 'transparent' });

export function InlineTextEditor({ block, theme }: { block: BlockOf<'title'> | BlockOf<'text'>; theme: Theme }) {
    const { edit, setEditingBlock } = useBuilder();
    const { registry } = useBuilderEnv();
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const labelFor = useMemo(() => {
        const labels = new Map(registry.fields.map((f) => [f.path, f.label]));
        return (path: string) => labels.get(path) ?? path;
    }, [registry]);

    const blockId = block.id;
    const titleSize = block.type === 'title' && !block.style.fontSize ? ({ 1: 20, 2: 15, 3: 12 } as const)[block.props.level] : null;

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: false,
                bulletList: false,
                orderedList: false,
                listItem: false,
                listKeymap: false,
                blockquote: false,
                codeBlock: false,
                code: false,
                horizontalRule: false,
                strike: false,
                link: false,
            }),
            TextStyle,
            Color,
            TextAlign.configure({ types: ['paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
            FieldNode.configure({ labelFor }),
        ],
        content: block.props.content as JSONContent,
        autofocus: 'end',
        onUpdate: ({ editor: e }) => {
            const content = toRichText(e.getJSON());
            edit(
                (d) => {
                    for (const band of ['header', 'body', 'footer'] as const) {
                        for (const s of d[band]) for (const c of s.columns) for (const b of c.blocks) if (b.id === blockId && (b.type === 'title' || b.type === 'text')) b.props.content = content;
                    }
                },
                { coalesceKey: `text:${blockId}` },
            );
        },
    });

    // Leave edit mode on a click outside the block / toolbar / popovers, or on Escape.
    useEffect(() => {
        const onDown = (e: PointerEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target || wrapRef.current?.contains(target) || target.closest('.MuiPopover-root, .MuiPopper-root, .MuiTooltip-popper')) return;
            setEditingBlock(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setEditingBlock(null);
        };
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [setEditingBlock]);

    const align = (['left', 'center', 'right'] as const).find((a) => editor?.isActive({ textAlign: a })) ?? 'left';

    return (
        <Box ref={wrapRef} sx={{ position: 'relative' }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            {editor && (
                <Box
                    role="toolbar"
                    aria-label="Text formatting"
                    onMouseDown={(e) => e.preventDefault()}
                    sx={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        transform: 'translateY(calc(-100% - 6px))',
                        zIndex: 30,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.25,
                        p: 0.25,
                        borderRadius: '8px',
                        backgroundColor: '#fff',
                        border: '1px solid #bfdbfe',
                        boxShadow: '0 4px 12px rgba(15,23,42,0.14)',
                        fontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
                        whiteSpace: 'nowrap',
                    }}
                >
                    <Tooltip title="Bold (Ctrl+B)" arrow>
                        <IconButton size="small" aria-label="Bold" onClick={() => editor.chain().focus().toggleBold().run()} sx={tbBtn(editor.isActive('bold'))}>
                            <FormatBoldRoundedIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Italic (Ctrl+I)" arrow>
                        <IconButton size="small" aria-label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} sx={tbBtn(editor.isActive('italic'))}>
                            <FormatItalicRoundedIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Underline (Ctrl+U)" arrow>
                        <IconButton size="small" aria-label="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()} sx={tbBtn(editor.isActive('underline'))}>
                            <FormatUnderlinedRoundedIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>
                    <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
                    {([
                        ['left', FormatAlignLeftRoundedIcon],
                        ['center', FormatAlignCenterRoundedIcon],
                        ['right', FormatAlignRightRoundedIcon],
                    ] as const).map(([a, Icon]) => (
                        <Tooltip key={a} title={`Align ${a}`} arrow>
                            <IconButton size="small" aria-label={`Align ${a}`} onClick={() => editor.chain().focus().setTextAlign(a).run()} sx={tbBtn(align === a)}>
                                <Icon sx={{ fontSize: 17 }} />
                            </IconButton>
                        </Tooltip>
                    ))}
                    <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
                    <Box sx={{ display: 'flex', gap: '3px', px: 0.5 }}>
                        {[theme.accentColor, ...SWATCHES].map((c, i) => (
                            <Tooltip key={`${c}-${i}`} title={i === 0 ? 'Accent colour' : c} arrow>
                                <Box
                                    component="button"
                                    type="button"
                                    aria-label={i === 0 ? 'Accent colour' : `Colour ${c}`}
                                    onClick={() => editor.chain().focus().setColor(i === 0 ? 'accent' : c).run()}
                                    sx={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid rgba(15,23,42,0.2)', backgroundColor: c, cursor: 'pointer', p: 0 }}
                                />
                            </Tooltip>
                        ))}
                        <Tooltip title="Default colour" arrow>
                            <Box component="button" type="button" aria-label="Default colour" onClick={() => editor.chain().focus().unsetColor().run()} sx={{ width: 14, height: 14, borderRadius: '50%', border: '1px dashed #94a3b8', backgroundColor: '#fff', cursor: 'pointer', p: 0 }} />
                        </Tooltip>
                    </Box>
                    <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
                    <FieldPickerButton
                        variant="compact"
                        fields={registry.fields}
                        onPick={(f) => editor.chain().focus().insertContent({ type: 'field', attrs: { path: f.path } }).run()}
                    />
                    <Tooltip title="Done (Esc)" arrow>
                        <IconButton size="small" aria-label="Done editing" onClick={() => setEditingBlock(null)} sx={{ ...tbBtn(false), color: '#047857' }}>
                            <CheckRoundedIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            )}
            <Box
                sx={{
                    ...(titleSize ? { fontSize: `${titleSize}pt`, fontWeight: block.style.fontWeight ? undefined : 700, lineHeight: 1.2 } : {}),
                    '& .ProseMirror': { outline: 'none', minHeight: '1.2em', cursor: 'text' },
                    '& .ProseMirror p': { m: 0 },
                    '& .ProseMirror [style*="color: accent"]': { color: theme.accentColor },
                    boxShadow: '0 0 0 2px #93c5fd',
                    borderRadius: '2px',
                }}
            >
                <EditorContent editor={editor} />
            </Box>
        </Box>
    );
}
