import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideFromReports, reportDetails, reportEmails } from './listReports.js';

describe('reportEmails', () => {
    it('reads the first column, skips the header and blank lines, lowercases', () => {
        const csv = 'email,result,reason\r\nA@Example.com,valid,accepted_email\r\n\r\n"b@example.com",invalid,rejected_email\n';
        assert.deepEqual([...reportEmails(csv)], ['a@example.com', 'b@example.com']);
    });

    it('ignores an address in a later column (e.g. a "did you mean" suggestion)', () => {
        const csv = 'email,did_you_mean\nx@gmial.com,x@gmail.com\n';
        assert.deepEqual([...reportEmails(csv)], ['x@gmial.com']);
    });

    it('handles a report with no header', () => {
        assert.deepEqual([...reportEmails('one@a.com\ntwo@b.com')], ['one@a.com', 'two@b.com']);
    });
});

describe('reportDetails', () => {
    it('finds reason and accept-all columns by header name', () => {
        const csv = 'email,Result,Reason,Accept All,Disposable\nc@x.com,valid,accepted_email,true,false\nd@x.com,invalid,rejected_email,false,false\n';
        const details = reportDetails(csv);
        assert.deepEqual(details.get('c@x.com'), { reason: 'accepted_email', acceptAll: true });
        assert.deepEqual(details.get('d@x.com'), { reason: 'rejected_email', acceptAll: false });
    });

    it('returns nothing when the columns are not recognised', () => {
        assert.equal(reportDetails('email,foo\nc@x.com,bar\n').size, 0);
    });

    it('copes with quoted cells containing commas', () => {
        const csv = 'email,name,reason\n"e@x.com","Doe, Jane",no_connect\n';
        assert.equal(reportDetails(csv).get('e@x.com')?.reason, 'no_connect');
    });
});

describe('decideFromReports', () => {
    const sent = ['safe@x.com', 'catchall@x.com', 'bad@x.com', 'unknown@x.com', 'missing@x.com'];
    const reports = {
        safetosend: new Set(['safe@x.com']),
        valid: new Set(['safe@x.com', 'catchall@x.com']),
        invalid: new Set(['bad@x.com']),
    };

    it('maps safe to send → valid, valid only → risky, invalid → invalid, the rest → undecided', () => {
        const { decisions, undecided } = decideFromReports(sent, reports, new Map());
        assert.deepEqual(decisions.get('safe@x.com'), { status: 'valid', reason: 'accepted_email' });
        assert.deepEqual(decisions.get('catchall@x.com'), { status: 'risky', reason: 'not_safe_to_send' });
        assert.deepEqual(decisions.get('bad@x.com'), { status: 'invalid', reason: 'rejected_email' });
        assert.equal(decisions.has('unknown@x.com'), false);
        assert.equal(undecided, 2);
    });

    it('uses report details for reasons when available', () => {
        const details = new Map([
            ['catchall@x.com', { reason: 'accepted_email', acceptAll: true }],
            ['bad@x.com', { reason: 'invalid_domain' }],
        ]);
        const { decisions } = decideFromReports(sent, reports, details);
        assert.equal(decisions.get('catchall@x.com')?.reason, 'accept_all');
        assert.equal(decisions.get('bad@x.com')?.reason, 'invalid_domain');
    });

    it('ignores addresses in the reports that were not sent', () => {
        const { decisions } = decideFromReports(['safe@x.com'], { ...reports, invalid: new Set(['bad@x.com', 'other@x.com']) }, new Map());
        assert.deepEqual([...decisions.keys()], ['safe@x.com']);
    });
});
