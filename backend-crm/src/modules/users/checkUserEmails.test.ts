import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { duplicateEmailHolders, emailCheckReport, type EmailRuleUser } from '../../../scripts/checkUserEmails.js';

/** `npm run calendar:check-emails`: the same rule as the calendar_connections migration guard and UX_Users_email. */

const u = (username: string, email: string | null, over: Partial<EmailRuleUser> = {}): EmailRuleUser => ({ username, email, isActive: true, isGroupUser: false, ...over });

describe('calendar:check-emails', () => {
    it('counts active, non-group users only, comparing trimmed lower-case addresses', () => {
        const users = [
            u('asha', 'Asha@NandiniInfosys.com '),
            u('asha2', 'asha@nandiniinfosys.com'),
            u('old', 'asha@nandiniinfosys.com', { isActive: false }),
            u('support', 'sales@nandiniinfosys.com', { isGroupUser: true }),
            u('ravi', 'sales@nandiniinfosys.com'),
            u('neel', null),
            u('blank', '   '),
            u('blank2', ''),
        ];
        assert.deepEqual([...duplicateEmailHolders(users)], [['asha@nandiniinfosys.com', ['asha', 'asha2']]]);
    });

    it('exit 0 with "No duplicates", else 1 with one line per address and the fix', () => {
        const clean = emailCheckReport([u('a', 'a@x.com'), u('b', 'b@x.com')]);
        assert.equal(clean.exitCode, 0);
        assert.match(clean.lines[0], /^No duplicates/);

        const dirty = emailCheckReport([u('b1', 'b@x.com'), u('a1', 'a@x.com'), u('a2', 'A@x.com'), u('b2', 'b@x.com')]);
        assert.equal(dirty.exitCode, 1);
        assert.deepEqual(dirty.lines.slice(0, 3), ['2 email address(es) are used by more than one active user:', '  a@x.com: a1, a2', '  b@x.com: b1, b2']);
        assert.match(dirty.lines.at(-1)!, /API Integrations › People/);
    });
});
