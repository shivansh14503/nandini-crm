import type { SecurityGroupDto } from '@/types/securityGroup.types';

/** Ids of a group's sub-groups at every depth (not the group itself); stops at a loop. */
export function descendantIdsOf(groups: readonly Pick<SecurityGroupDto, 'id' | 'parentId'>[], rootId: number): number[] {
    const seen = new Set<number>([rootId]);
    const out: number[] = [];
    const stack = [rootId];
    while (stack.length) {
        const id = stack.pop() as number;
        for (const g of groups) {
            if (g.parentId !== id || seen.has(g.id)) continue;
            seen.add(g.id);
            out.push(g.id);
            stack.push(g.id);
        }
    }
    return out;
}

/** Groups in tree order (each parent followed by its sub-groups, by name) with their depth. */
export function flattenTree<T extends Pick<SecurityGroupDto, 'id' | 'parentId' | 'name'>>(groups: readonly T[]): { group: T; depth: number }[] {
    const ids = new Set(groups.map((g) => g.id));
    const byParent = new Map<number | null, T[]>();
    for (const g of groups) {
        const parent = g.parentId !== null && ids.has(g.parentId) ? g.parentId : null;
        byParent.set(parent, [...(byParent.get(parent) ?? []), g]);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    const out: { group: T; depth: number }[] = [];
    const seen = new Set<number>();
    const walk = (parent: number | null, depth: number) => {
        for (const g of byParent.get(parent) ?? []) {
            if (seen.has(g.id)) continue;
            seen.add(g.id);
            out.push({ group: g, depth });
            walk(g.id, depth + 1);
        }
    };
    walk(null, 0);
    // Anything left (a loop in the data) is listed at the top level.
    for (const g of groups) if (!seen.has(g.id)) out.push({ group: g, depth: 0 });
    return out;
}
