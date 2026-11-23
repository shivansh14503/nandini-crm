import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cloneSection, documentSchema, isSingleEmoji, layoutFieldRefs, pruneLayout, summarizeLayout, type DrawerLayoutDocument } from './index.js';

const field = (id: string, key: string) => ({
    id,
    type: 'field' as const,
    field: key,
    display: 'standard' as const,
    label: '',
    showLabel: true,
    width: 'half' as const,
    hideEmpty: true,
    emptyText: '',
    copy: false,
});

const layout = (): DrawerLayoutDocument => ({
    version: 1,
    header: {
        titleField: 'name',
        subtitleFields: ['leadCode', 'organizationName'],
        avatar: { kind: 'icon', icon: 'person' },
        hotAvatar: true,
        badges: [{ id: 'g1', field: 'rating', prefix: 'Rating: ', style: 'auto', hideEmpty: true }],
    },
    tabs: {
        overview: [
            { id: 's1', title: 'KEY FACTS', style: 'card', columns: 2, hideEmpty: true, blocks: [field('b1', 'designation'), field('b2', 'cf_budget')] },
        ],
        address: [{ id: 's2', title: 'BILLING', style: 'card', columns: 1, hideEmpty: false, blocks: [{ id: 'b3', type: 'address', prefix: 'primary', emptyText: '' }] }],
    },
});

describe('documentSchema', () => {
    it('accepts a full layout', () => {
        assert.equal(documentSchema.safeParse(layout()).success, true);
    });

    it('rejects duplicate ids anywhere in the layout', () => {
        const doc = layout();
        doc.tabs.address[0].blocks[0].id = 'b1';
        const result = documentSchema.safeParse(doc);
        assert.equal(result.success, false);
        assert.match(JSON.stringify(result.error?.issues), /Duplicate id/);
    });

    it('rejects colours, CSS or unknown presets', () => {
        const doc = layout() as unknown as { tabs: { overview: { style: string }[] } };
        doc.tabs.overview[0].style = 'background:red';
        assert.equal(documentSchema.safeParse(doc).success, false);
    });

    it('caps badges and subtitle fields', () => {
        const doc = layout();
        doc.header.subtitleFields = ['a', 'b', 'c', 'd', 'e'];
        assert.equal(documentSchema.safeParse(doc).success, false);
    });

    it('takes one emoji as an avatar, never text', () => {
        const withEmoji = (emoji: string) => ({ ...layout(), header: { ...layout().header, avatar: { kind: 'emoji', emoji } } });
        assert.equal(documentSchema.safeParse(withEmoji('🦁')).success, true);
        assert.equal(documentSchema.safeParse(withEmoji('ab')).success, false);
        assert.equal(documentSchema.safeParse(withEmoji('🦁🐯')).success, false);
    });
});

describe('isSingleEmoji', () => {
    it('accepts emoji the OS picker inserts: skin tones, ZWJ sequences, flags, keycaps', () => {
        for (const e of ['😀', '👍🏽', '👩‍💻', '👨‍👩‍👧‍👦', '🇮🇳', '1️⃣', '❤️', '🏴󠁧󠁢󠁥󠁮󠁧󠁿']) assert.equal(isSingleEmoji(e), true, e);
    });
    it('rejects letters, spaces, several emoji and empty values', () => {
        for (const e of ['', 'A', 'hi', '😀 ', '😀😀', '<b>']) assert.equal(isSingleEmoji(e), false, e);
    });
});

describe('refs', () => {
    it('lists every field the layout shows, with where', () => {
        const refs = layoutFieldRefs(layout());
        assert.deepEqual(
            refs.map((r) => r.field),
            ['name', 'leadCode', 'organizationName', 'rating', 'designation', 'cf_budget'],
        );
        assert.equal(refs.at(-1)?.where, 'overview › KEY FACTS');
    });

    it('prunes fields and addresses the form no longer has', () => {
        const { doc, removed } = pruneLayout(layout(), (k) => k !== 'cf_budget' && k !== 'rating', (p) => p !== 'primary', 'name');
        assert.equal(removed, 3);
        assert.deepEqual(doc.header.badges, []);
        assert.deepEqual(doc.tabs.overview[0].blocks.map((b) => b.id), ['b1']);
        assert.deepEqual(doc.tabs.address[0].blocks, []);
    });

    it('leaves a layout with nothing unknown untouched', () => {
        const original = layout();
        assert.equal(pruneLayout(original, () => true, () => true, 'name').doc, original);
    });

    it('copies a section with fresh ids', () => {
        let n = 0;
        const copy = cloneSection(layout().tabs.overview[0], (p) => `${p}${++n}`);
        assert.deepEqual([copy.id, ...copy.blocks.map((b) => b.id)], ['s1', 'b2', 'b3']);
    });

    it('summarizes a layout for the audit log', () => {
        const summary = summarizeLayout(layout());
        assert.equal(summary.badges, 'Rating: rating (auto)');
        assert.equal(summary['tab:overview'], 'KEY FACTS [2 col, card]: designation, cf_budget');
        assert.equal(summary.avatar, 'Icon: person, red when Hot');
    });
});
