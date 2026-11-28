import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EMAIL_TEMPLATE_KEYS, EMAIL_TEMPLATES, mergeText, renderEmailTemplate, sampleVars, unknownMergeTags } from './email.templates.js';

describe('email templates', () => {
    it('offers every merge field its defaults use', () => {
        for (const key of EMAIL_TEMPLATE_KEYS) {
            const def = EMAIL_TEMPLATES[key];
            for (const text of Object.values(def.defaults)) assert.deepEqual(unknownMergeTags(def, text), [], `${key}: ${text}`);
            if (def.hasLink) assert.ok(def.defaults.buttonLabel, `${key} has a button`);
        }
    });

    it('reports merge tags a template does not offer', () => {
        assert.deepEqual(unknownMergeTags(EMAIL_TEMPLATES.user_invite, 'Hi {{firstName}} {{ password }} {{unlockAt}}'), ['password', 'unlockAt']);
        assert.deepEqual(unknownMergeTags(EMAIL_TEMPLATES.account_locked, 'Unlocks {{unlockAt}}'), []);
    });

    it('merges values (missing = empty) and tolerates spaces inside the braces', () => {
        assert.equal(mergeText('Hi {{ firstName }}, {{missing}}!', { firstName: 'Asha' }), 'Hi Asha, !');
    });

    it('escapes merged values and admin text, and keeps paragraphs', () => {
        const def = EMAIL_TEMPLATES.password_reset;
        const email = renderEmailTemplate(def, { ...def.defaults, body: '<script>x</script> {{firstName}}\n\nSecond\nline' }, { ...sampleVars(def), firstName: '<b>Eve</b>' });
        assert.doesNotMatch(email.html, /<script>|<b>Eve<\/b>/);
        assert.match(email.html, /&lt;script&gt;x&lt;\/script&gt; &lt;b&gt;Eve&lt;\/b&gt;/);
        assert.match(email.html, /Second<br>line/);
        assert.match(email.text, /Second\nline/);
    });

    it('only makes http(s) links into buttons', () => {
        const def = EMAIL_TEMPLATES.user_invite;
        const email = renderEmailTemplate(def, def.defaults, { ...sampleVars(def), link: 'javascript:alert(1)' });
        assert.doesNotMatch(email.html, /javascript:/);
        assert.doesNotMatch(email.html, /Never forward/);
    });

    it('renders templates without a link with no button', () => {
        const def = EMAIL_TEMPLATES.account_locked;
        const email = renderEmailTemplate(def, def.defaults, sampleVars(def));
        assert.equal(email.subject, 'Your Nandini CRM account was locked');
        assert.doesNotMatch(email.html, /<a /);
        assert.match(email.text, /too many unsuccessful sign-in attempts/);
    });

    it('keeps the subject on one line', () => {
        const def = EMAIL_TEMPLATES.morning_summary;
        assert.equal(renderEmailTemplate(def, { ...def.defaults, subject: 'Day\n{{date}}' }, { date: '1 Dec' }).subject, 'Day 1 Dec');
    });
});
