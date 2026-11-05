import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { forceEscapedMustaches, sanitizeTemplateCss, sanitizeTemplateHtml } from './sanitize.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('sanitizeTemplateHtml', () => {
    it('removes script, iframe, object, embed, form, link, meta and base', () => {
        const out = sanitizeTemplateHtml(
            '<p>ok</p><script>alert(1)</script><iframe src="x"></iframe><object></object><embed src="x"><form><input></form>' +
                '<link rel="stylesheet" href="http://x"><meta http-equiv="refresh" content="0"><base href="http://x">',
        );
        assert.equal(out, '<p>ok</p>');
    });

    it('strips on* handlers and javascript: URLs', () => {
        const out = sanitizeTemplateHtml('<div onclick="x()" onmouseover="y()" class="a">t</div><img src="javascript:alert(1)">');
        assert.equal(out, '<div class="a">t</div>');
    });

    it('drops remote and protocol-relative image sources, keeps data: images', () => {
        assert.equal(sanitizeTemplateHtml('<img src="https://evil.test/a.png">'), '');
        assert.equal(sanitizeTemplateHtml('<img src="//evil.test/a.png">'), '');
        assert.equal(sanitizeTemplateHtml(`<img src="${PNG}" alt="logo">`), `<img src="${PNG}" alt="logo" />`);
    });

    it('keeps asset / logo placeholders and other Handlebars expressions intact', () => {
        assert.equal(sanitizeTemplateHtml('<img src="{{asset "logo-acme"}}">'), '<img src="{{asset "logo-acme"}}" />');
        assert.equal(sanitizeTemplateHtml('<img src="{{company.logoDataUri}}">'), '<img src="{{company.logoDataUri}}" />');
        assert.equal(
            sanitizeTemplateHtml('{{#ifShow "gstNo"}}<td colspan="2" style="color: {{company.accentColor}}">{{customer.gstNo}}</td>{{/ifShow}}'),
            '{{#ifShow "gstNo"}}<td colspan="2" style="color:{{company.accentColor}}">{{customer.gstNo}}</td>{{/ifShow}}',
        );
    });

    it('does not allow images sourced from arbitrary record fields', () => {
        assert.equal(sanitizeTemplateHtml('<img src="{{customer.website}}">'), '');
    });

    it('keeps table layout attributes', () => {
        assert.equal(
            sanitizeTemplateHtml('<table width="100%"><tr><th rowspan="2" align="left">A</th></tr></table>'),
            '<table width="100%"><tr><th rowspan="2" align="left">A</th></tr></table>',
        );
    });

    it('forces escaped output and removes verbatim Handlebars syntax', () => {
        assert.equal(forceEscapedMustaches('{{{quotation.remarks}}}'), '{{quotation.remarks}}');
        assert.equal(forceEscapedMustaches('{{& x}}'), '{{x}}');
        assert.equal(sanitizeTemplateHtml('\\{{x}}'), '{{x}}');
        assert.doesNotMatch(sanitizeTemplateHtml('{{{{raw}}}}<script>x</script>{{{{/raw}}}}'), /<script/);
        assert.doesNotMatch(sanitizeTemplateHtml('{{ <script>alert(1)</script> }}'), /<script/);
    });

    it('cleans CSS in style blocks and attributes', () => {
        const out = sanitizeTemplateHtml('<style>@import url(http://x.css); .a{background:url(http://x/y.png)}</style><p style="width:expression(alert(1))">x</p>');
        assert.doesNotMatch(out, /@import|http:|expression\(/);
    });
});

describe('sanitizeTemplateCss', () => {
    it('strips @import, remote url() and expression()', () => {
        const out = sanitizeTemplateCss('@import "x.css"; .a { background: url("https://x/y.png"); width: expression(1) } .b{color:red}');
        assert.doesNotMatch(out, /@import|https:|expression\(/);
        assert.match(out, /\.b\{color:red\}/);
    });

    it('keeps data: urls', () => {
        assert.match(sanitizeTemplateCss(`.a{background:url(${PNG})}`), /url\(data:image\/png/);
    });

    it('removes CSS escapes that could hide keywords', () => {
        assert.doesNotMatch(sanitizeTemplateCss('.a{background:\\75 rl(http://x)}'), /http:/);
    });
});
