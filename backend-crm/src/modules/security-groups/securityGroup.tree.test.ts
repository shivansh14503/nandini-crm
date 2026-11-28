import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { descendantIds, teammatesByUser, wouldCreateCycle, type GroupNode } from './securityGroup.tree.js';

// North (1) ─┬─ Delhi (2) ── Delhi Inside Sales (4)
//            └─ Chandigarh (3, archived)
// Support (5)
const groups: GroupNode[] = [
    { id: 1, parentId: null, isActive: true },
    { id: 2, parentId: 1, isActive: true },
    { id: 3, parentId: 1, isActive: false },
    { id: 4, parentId: 2, isActive: true },
    { id: 5, parentId: null, isActive: true },
];

describe('descendantIds / wouldCreateCycle', () => {
    it('walks every depth, optionally skipping archived branches', () => {
        assert.deepEqual(descendantIds(groups, 1).sort(), [2, 3, 4]);
        assert.deepEqual(descendantIds(groups, 1, { activeOnly: true }).sort(), [2, 4]);
        assert.deepEqual(descendantIds(groups, 5), []);
    });

    it('refuses a parent that is the group or below it', () => {
        assert.equal(wouldCreateCycle(groups, 1, 1), true);
        assert.equal(wouldCreateCycle(groups, 1, 4), true);
        assert.equal(wouldCreateCycle(groups, 4, 5), false);
        assert.equal(wouldCreateCycle(groups, 2, null), false);
    });

    it('stops on a loop already in the data', () => {
        const looped: GroupNode[] = [
            { id: 1, parentId: 2, isActive: true },
            { id: 2, parentId: 1, isActive: true },
        ];
        assert.deepEqual(descendantIds(looped, 1), [2]);
    });
});

describe('teammatesByUser', () => {
    const map = teammatesByUser(groups, [
        { groupId: 1, username: 'Region.Head' },
        { groupId: 2, username: 'delhi.lead' },
        { groupId: 4, username: 'inside.rep' },
        { groupId: 3, username: 'chd.rep' },
        { groupId: 5, username: 'support.agent' },
        { groupId: 5, username: 'delhi.lead' },
    ]);

    it('a parent group sees its active sub-groups at any depth; archived groups grant nothing', () => {
        assert.deepEqual(map.get('region.head'), ['delhi.lead', 'inside.rep', 'Region.Head']);
        assert.equal(map.has('chd.rep'), false);
    });

    it('a sub-group does not see its parent; several groups add up', () => {
        assert.deepEqual(map.get('inside.rep'), ['inside.rep']);
        assert.deepEqual(map.get('delhi.lead'), ['delhi.lead', 'inside.rep', 'support.agent']);
        assert.deepEqual(map.get('support.agent'), ['delhi.lead', 'support.agent']);
    });
});
