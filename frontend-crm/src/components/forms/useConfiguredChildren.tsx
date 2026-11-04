'use client';

import React, { useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { hasHostFor, homeSectionIdOf, isMovedAcrossTabs, isMovedBuiltIn, sectionIdOf, useFormConfigContext, type MovedFieldStore } from '@/context/FormConfigContext';
import type { FormFieldDefinitionDto } from '@/types/formConfig.types';
import { DynamicFormField } from './DynamicFormField';

/** How deep to look inside a grid cell (e.g. `FormGridItem > RhfTextField`) for the field it holds. */
const MAX_DEPTH = 3;

/** The configured built-in field a grid cell renders: the first descendant element whose `name` (or `dateName`) is a field key. */
function fieldOf(node: React.ReactNode, fields: Map<string, FormFieldDefinitionDto>, depth = 0): FormFieldDefinitionDto | undefined {
    if (!React.isValidElement<{ name?: unknown; dateName?: unknown; children?: React.ReactNode }>(node)) return undefined;
    const { children } = node.props;
    // `dateName`: date + time pickers bind the date part to the field key.
    const name = node.props.name ?? node.props.dateName;
    if (typeof name === 'string' && fields.has(name)) return fields.get(name);
    if (depth >= MAX_DEPTH || !children) return undefined;
    let found: FormFieldDefinitionDto | undefined;
    React.Children.forEach(children, (child) => {
        found ??= fieldOf(child, fields, depth + 1);
    });
    return found;
}

/**
 * Renders a built-in field's element away from the grid that created it. Deliberately takes the element as
 * `node` (not `children`), so the receiving grid's field lookup doesn't mistake it for one of its own cells.
 */
export function MovedFieldSlot({ node }: { node: React.ReactNode }) {
    return <>{node}</>;
}

const noopSubscribe = () => () => undefined;
const zero = () => 0;

/** Re-renders when moved-field elements change, only while `active` (most grids receive nothing). */
export function useMovedFields(store: MovedFieldStore | undefined, active: boolean): void {
    useSyncExternalStore(active && store ? store.subscribe : noopSubscribe, active && store ? store.getVersion : zero, zero);
}

/** Children as React.Children.toArray keeps them (empty nodes dropped), but the original elements, not keyed clones. */
function rawChildren(children: React.ReactNode): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    React.Children.forEach(children, (child) => {
        if (child === null || child === undefined || typeof child === 'boolean') return;
        out.push(child);
    });
    return out;
}

/**
 * Applies the admin's field order to a grid / row of a module form (inside a FormConfigProvider):
 *  • cells holding a configured field are rearranged among themselves by `sortOrder`; other cells (toggles,
 *    banners, unconfigured inputs) keep their place;
 *  • the section's active custom fields are added to the first grid showing that section, in the same order,
 *    so they can sit between built-in fields (DynamicModuleCustomFields then leaves them out);
 *  • built-in fields the admin dragged into another section of the tab leave this grid and are rendered by the
 *    grid of their new section (or, for a section no grid shows, by DynamicModuleCustomFields) — only when
 *    such a host is mounted, so a field is never lost.
 * A grid's section is its fields' default (hand-coded) section, so it keeps it when its own fields move away.
 * Outside a provider the children are returned untouched.
 */
export function useConfiguredChildren(children: React.ReactNode): React.ReactNode {
    const ctx = useFormConfigContext();
    const gridId = useId();
    const items = React.Children.toArray(children);
    const raw = rawChildren(children);
    const fields = ctx ? items.map((item) => fieldOf(item, ctx.systemFields)) : [];
    const anchor = fields.find(Boolean);
    const sectionId = anchor ? homeSectionIdOf(anchor) : undefined;
    const claimSection = ctx?.claimSection;
    const store = ctx?.movedFields;

    // Layout effect: claims settle before the first paint, so moved fields never flash in their old section.
    useLayoutEffect(() => {
        if (!sectionId || !claimSection) return;
        return claimSection(sectionId, gridId);
    }, [sectionId, claimSection, gridId]);

    // Cells whose field now lives in another section that is on screen: handed over to that section's host. A field
    // moved to another tab always leaves this grid (it must not show on its old tab); its new tab renders it.
    const exported = fields.map((field) =>
        Boolean(ctx && field && isMovedBuiltIn(field) && (isMovedAcrossTabs(field) || hasHostFor(ctx.sectionClaims, field))),
    );
    const published = useRef(new Map<string, React.ReactNode>());
    useLayoutEffect(() => {
        if (!store) return;
        const next = new Map<string, React.ReactNode>();
        fields.forEach((field, i) => {
            if (field && exported[i] && raw.length === items.length) next.set(field.fieldKey, raw[i]);
        });
        for (const [key, node] of published.current) if (next.get(key) !== node) store.unpublish(key, node);
        for (const [key, node] of next) store.publish(key, node);
        published.current = next;
    });
    useLayoutEffect(
        () => () => {
            if (store) for (const [key, node] of published.current) store.unpublish(key, node);
        },
        [store],
    );

    const isFirstClaimant = Boolean(ctx && sectionId && ctx.sectionClaims[sectionId]?.[0] === gridId);
    const incoming =
        ctx && isFirstClaimant ? [...ctx.systemFields.values()].filter((f) => isMovedBuiltIn(f) && sectionIdOf(f) === sectionId) : [];
    useMovedFields(store, incoming.length > 0);

    if (!ctx || !anchor || !sectionId) return children;

    const custom = isFirstClaimant ? ctx.customFields.filter((f) => f.isActive && f.isVisibleInForm && sectionIdOf(f) === sectionId) : [];
    const received = incoming.flatMap((field) => {
        const node = store?.get(field.fieldKey);
        if (node) return [{ node: <MovedFieldSlot key={`moved-${field.fieldKey}`} node={node} />, field }];
        // Moved from another tab whose grid isn't mounted (so nothing hands its element over): render it from config.
        if (isMovedAcrossTabs(field) && field.isActive && field.isVisibleInForm) {
            return [{ node: <DynamicFormField key={`moved-${field.fieldKey}`} field={field} required={field.isRequired} />, field }];
        }
        return [];
    });

    const entries: { node: React.ReactNode; field?: FormFieldDefinitionDto }[] = [
        ...items.flatMap((node, i) => (exported[i] ? [] : [{ node, field: fields[i] }])),
        ...custom.map((field) => ({ node: <DynamicFormField key={`custom-${field.id}`} field={field} required={field.isRequired} />, field })),
        ...received,
    ];
    const slots = entries.flatMap((entry, i) => (entry.field ? [i] : []));
    const sorted = slots.map((i) => entries[i]).sort((a, b) => a.field!.sortOrder - b.field!.sortOrder);
    const result = entries.map((entry) => entry.node);
    slots.forEach((slot, k) => {
        result[slot] = sorted[k].node;
    });
    return result;
}
