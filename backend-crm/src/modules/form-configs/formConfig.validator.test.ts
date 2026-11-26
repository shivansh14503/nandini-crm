import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MODULE_SETTING_SCHEMAS, updateOptionSchema } from './formConfig.validator.js';

describe('option meta: calendarSync (Admin › API Integrations › What goes to calendars)', () => {
    it('accepts on / off and leaves other meta keys alone', () => {
        assert.equal(updateOptionSchema.safeParse({ meta: { calendarSync: false, icon: 'call' } }).success, true);
        assert.equal(updateOptionSchema.safeParse({ meta: { calendarSync: true } }).success, true);
    });
    it('refuses a non-boolean', () => {
        const parsed = updateOptionSchema.safeParse({ meta: { calendarSync: 'no' } });
        assert.equal(parsed.success, false);
        assert.equal(parsed.error?.issues[0]?.message, '"Send to calendars" must be on or off.');
    });
});

describe('option meta: videoMeeting (Video meeting on a Followup Type)', () => {
    it('accepts on / off', () => {
        assert.equal(updateOptionSchema.safeParse({ meta: { videoMeeting: true, icon: 'meeting' } }).success, true);
        assert.equal(updateOptionSchema.safeParse({ meta: { videoMeeting: false } }).success, true);
    });
    it('refuses a non-boolean', () => {
        const parsed = updateOptionSchema.safeParse({ meta: { videoMeeting: 'yes' } });
        assert.equal(parsed.success, false);
        assert.equal(parsed.error?.issues[0]?.message, '"Video meeting" must be on or off.');
    });
});

describe('module setting activities:calendarSync', () => {
    const schema = MODULE_SETTING_SCHEMAS['activities:calendarSync'];

    it('is registered and fills the defaults', () => {
        assert.ok(schema);
        assert.deepEqual(schema.parse({}), {
            companyDomains: ['nandiniinfosys.com'],
            followUpReminder: '15 minutes before',
            backfillDays: 60,
            eventVisibility: 'private',
            followUpActivities: true,
            allowMeetingImport: false,
            importFollowupType: 'Meeting',
        });
    });
    it('normalizes domains and refuses bad values and unknown keys', () => {
        assert.deepEqual((schema.parse({ companyDomains: [' @NandiniInfosys.com', 'nandiniinfosys.com', 'nipl.in'] }) as { companyDomains: string[] }).companyDomains, [
            'nandiniinfosys.com',
            'nipl.in',
        ]);
        assert.equal(schema.safeParse({ companyDomains: [] }).success, false);
        assert.equal(schema.safeParse({ companyDomains: ['not a domain'] }).success, false);
        assert.equal(schema.safeParse({ backfillDays: 45 }).success, false);
        assert.equal(schema.safeParse({ followUpReminder: '3 minutes before' }).success, false);
        assert.equal(schema.safeParse({ eventVisibility: 'public' }).success, false);
        assert.equal(schema.safeParse({ somethingElse: true }).success, false);
    });
});
