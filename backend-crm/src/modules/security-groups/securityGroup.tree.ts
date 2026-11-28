/**
 * Pure helpers for Admin › Security Groups: the group tree and who counts as a user's teammate for a role's "Group"
 * access level (roles/permissions.ts). No database access, so they are unit tested directly.
 *
 * A user's teammates are everyone in each active group they belong to, plus everyone in that group's active sub-groups
 * (any depth), plus the user themselves. So a regional manager in "North" sees the records of the "Delhi" and
 * "Chandigarh" branches under it, while a Delhi member sees only Delhi. Archived groups grant nothing, and an archived
 * group also cuts off the sub-groups below it.
 */

export interface GroupNode {
    id: number;
    parentId: number | null;
    isActive: boolean;
}

export interface GroupMembership {
    groupId: number;
    username: string;
}

const key = (username: string) => username.trim().toLowerCase();

/** Ids of the group's sub-groups at every depth (not the group itself). Stops at a cycle instead of looping. */
export function descendantIds(groups: readonly GroupNode[], rootId: number, options: { activeOnly?: boolean } = {}): number[] {
    const children = new Map<number, GroupNode[]>();
    for (const g of groups) {
        if (g.parentId === null) continue;
        const list = children.get(g.parentId) ?? [];
        list.push(g);
        children.set(g.parentId, list);
    }
    const seen = new Set<number>([rootId]);
    const out: number[] = [];
    const stack = [rootId];
    while (stack.length) {
        const id = stack.pop() as number;
        for (const child of children.get(id) ?? []) {
            if (seen.has(child.id) || (options.activeOnly && !child.isActive)) continue;
            seen.add(child.id);
            out.push(child.id);
            stack.push(child.id);
        }
    }
    return out;
}

/** True when giving group `id` the parent `parentId` would make a loop (the parent is the group or one of its sub-groups). */
export function wouldCreateCycle(groups: readonly GroupNode[], id: number, parentId: number | null): boolean {
    if (parentId === null) return false;
    if (parentId === id) return true;
    return descendantIds(groups, id).includes(parentId);
}

/**
 * Teammates of every member, keyed by lower-cased username: the usernames (as stored) that member's "Group" level
 * covers, the member included. Users in no active group are absent (their Group level works like Own).
 */
export function teammatesByUser(groups: readonly GroupNode[], memberships: readonly GroupMembership[]): Map<string, string[]> {
    const active = new Map(groups.filter((g) => g.isActive).map((g) => [g.id, g]));
    const membersOf = new Map<number, string[]>();
    for (const m of memberships) {
        if (!active.has(m.groupId)) continue;
        const list = membersOf.get(m.groupId) ?? [];
        list.push(m.username);
        membersOf.set(m.groupId, list);
    }
    // Everyone a group's members see: its own members and its active sub-groups' members.
    const reachCache = new Map<number, string[]>();
    const reachOf = (groupId: number): string[] => {
        const cached = reachCache.get(groupId);
        if (cached) return cached;
        const ids = [groupId, ...descendantIds(groups, groupId, { activeOnly: true })];
        const names = ids.flatMap((id) => membersOf.get(id) ?? []);
        reachCache.set(groupId, names);
        return names;
    };

    const out = new Map<string, Map<string, string>>();
    for (const m of memberships) {
        if (!active.has(m.groupId)) continue;
        const mine = out.get(key(m.username)) ?? new Map<string, string>([[key(m.username), m.username]]);
        for (const name of reachOf(m.groupId)) if (!mine.has(key(name))) mine.set(key(name), name);
        out.set(key(m.username), mine);
    }
    return new Map([...out].map(([user, names]) => [user, [...names.values()].sort((a, b) => a.localeCompare(b))]));
}
