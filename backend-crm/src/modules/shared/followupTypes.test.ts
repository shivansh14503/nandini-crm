import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    ACTIVITY_ONLY_DEFAULT_MESSAGE,
    ACTIVITY_ONLY_TYPE_MESSAGE,
    activityOnlyDefaultIssues,
    activityOnlyTypeIssues,
    isActivityOnlyFollowupType,
} from './followupTypes.js';

describe('activityOnlyTypeIssues (leads / opportunities)', () => {
    it('refuses a Followup Type that changes to Task or Note', () => {
        assert.deepEqual(activityOnlyTypeIssues('Task'), [{ path: ['followupType'], message: ACTIVITY_ONLY_TYPE_MESSAGE }]);
        assert.deepEqual(activityOnlyTypeIssues('note', 'Call'), [{ path: ['followupType'], message: ACTIVITY_ONLY_TYPE_MESSAGE }]);
        assert.deepEqual(activityOnlyTypeIssues('Task', undefined, 'opportunityFollowupType'), [
            { path: ['opportunityFollowupType'], message: ACTIVITY_ONLY_TYPE_MESSAGE },
        ]);
    });

    it('keeps a record that already stores one editable', () => {
        assert.deepEqual(activityOnlyTypeIssues('Task', 'Task'), []);
        assert.deepEqual(activityOnlyTypeIssues(' task ', 'Task'), []);
    });

    it('accepts every other type and blanks', () => {
        assert.deepEqual(activityOnlyTypeIssues('Call'), []);
        assert.deepEqual(activityOnlyTypeIssues('Taskforce visit'), []);
        assert.deepEqual(activityOnlyTypeIssues(undefined), []);
        assert.deepEqual(activityOnlyTypeIssues(null, 'Task'), []);
    });

    it('reads Task and Note in any case', () => {
        assert.equal(isActivityOnlyFollowupType('TASK'), true);
        assert.equal(isActivityOnlyFollowupType(' Note '), true);
        assert.equal(isActivityOnlyFollowupType('Meeting'), false);
    });
});

describe('activityOnlyDefaultIssues (Form Builder › Dropdowns)', () => {
    it("refuses Task / Note as the Followup Type's default option", () => {
        assert.deepEqual(activityOnlyDefaultIssues('shared_followup_type', 'Task', true), [{ path: ['isDefault'], message: ACTIVITY_ONLY_DEFAULT_MESSAGE }]);
        assert.deepEqual(activityOnlyDefaultIssues('shared_followup_type', 'Note', true).length, 1);
    });

    it('allows other options, unsetting the default, and other lists', () => {
        assert.deepEqual(activityOnlyDefaultIssues('shared_followup_type', 'Call', true), []);
        assert.deepEqual(activityOnlyDefaultIssues('shared_followup_type', 'Task', false), []);
        assert.deepEqual(activityOnlyDefaultIssues('shared_followup_type', 'Task', undefined), []);
        assert.deepEqual(activityOnlyDefaultIssues('lead_status', 'Task', true), []);
    });
});
