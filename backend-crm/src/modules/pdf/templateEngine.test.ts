import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../../utils/httpError.js';
import { __templateCacheSize, collectAssetKeys, compileTemplate, invalidateTemplate, renderTemplate, validateTemplateParts } from './templateEngine.js';

const render = (source: string, context: object, assets: Record<string, string> = {}) =>
    renderTemplate(compileTemplate(source, 'body'), 'body', context, { assets });

describe('templateEngine escaping', () => {
    it('escapes values by default', () => {
        assert.equal(render('{{x}}', { x: '<b>"hi"</b>' }), '&lt;b&gt;&quot;hi&quot;&lt;/b&gt;');
    });

    it('nl2br escapes before inserting <br>', () => {
        assert.equal(render('{{nl2br x}}', { x: 'a<script>\nb' }), 'a&lt;script&gt;<br>b');
    });

    it('cannot reach prototype properties', () => {
        assert.equal(render('{{constructor}}|{{x.constructor.name}}|{{__proto__}}', { x: {} }), '||');
    });

    it('rejects helpers that are not registered', () => {
        assert.throws(() => compileTemplate('{{unknownHelper x}}', 'body'), (err: unknown) => err instanceof HttpError && err.statusCode === 422);
    });
});

describe('templateEngine helpers', () => {
    const ctx = { currency: 'Indian Rupee: ₹', show: { gstNo: true, remarks: false }, n: 1234.5, d: '2026-11-05' };

    it('formats currency, numbers, dates and words', () => {
        assert.equal(render('{{currency n}}', ctx), '₹1,234.50');
        assert.equal(render('{{number n 0}}', ctx), '1,235');
        assert.equal(render('{{date d}}', ctx), '05 Nov 2026');
        assert.equal(render('{{amountInWords 15}}', ctx), 'Rupees Fifteen Only');
    });

    it('ifShow reads the root show map, even inside each blocks', () => {
        assert.equal(render('{{#ifShow "gstNo"}}Y{{else}}N{{/ifShow}}{{#ifShow "remarks"}}Y{{else}}N{{/ifShow}}', ctx), 'YN');
        assert.equal(render('{{#each items}}{{#ifShow "gstNo"}}{{inc @index}}{{/ifShow}}{{/each}}', { ...ctx, items: [1, 2] }), '12');
    });

    it('eq / and / or', () => {
        assert.equal(render('{{#if (eq a "x")}}1{{/if}}{{#if (and a b)}}2{{/if}}{{#if (or c b)}}3{{/if}}', { a: 'x', b: 1, c: 0 }), '123');
        assert.equal(render('{{#if (and a c)}}1{{else}}0{{/if}}', { a: 1, c: 0 }), '0');
    });

    it('lineItemCell prefers the formatted value and escapes it', () => {
        const item = { productName: 'A & B', total: 10, totalFormatted: '₹10.00', description: 'x\ny' };
        const cols = [{ key: 'productName' }, { key: 'total' }, { key: 'description' }];
        assert.equal(
            render('{{#each cols}}[{{lineItemCell ../item this}}]{{/each}}', { item, cols }),
            '[A &amp; B][₹10.00][x<br>y]',
        );
    });

    it('asset resolves prefetched data URIs only', () => {
        assert.equal(render('{{asset "logo"}}|{{asset "missing"}}', {}, { logo: 'data:image/png;base64,AA' }), 'data:image/png;base64,AA|');
        assert.deepEqual(collectAssetKeys('<img src="{{asset "a"}}">', "{{ asset 'b.c' }}", null), ['a', 'b.c']);
    });
});

describe('templateEngine errors and cache', () => {
    it('reports the line and column of syntax errors as 422', () => {
        try {
            validateTemplateParts({ body: '<p>\n{{#if x}}\n</p>', footer: 'ok' });
            assert.fail('expected an error');
        } catch (err) {
            assert.ok(err instanceof HttpError);
            assert.equal(err.statusCode, 422);
            assert.equal(err.code, 'TEMPLATE_COMPILE_ERROR');
            assert.equal(err.errors?.[0]?.path[0], 'body');
            assert.ok(Number(err.errors?.[0]?.path[1]) >= 1);
        }
    });

    it('caches by key and invalidates per template', () => {
        const before = __templateCacheSize();
        const a = compileTemplate('{{x}}', 'body', 'tpl-1:1');
        assert.equal(compileTemplate('{{x}}', 'body', 'tpl-1:1'), a);
        compileTemplate('{{y}}', 'header', 'tpl-1:1');
        assert.equal(__templateCacheSize(), before + 2);
        invalidateTemplate('tpl-1');
        assert.equal(__templateCacheSize(), before);
    });
});
