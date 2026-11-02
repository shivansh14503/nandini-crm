'use client';

import React, { useEffect, useId } from 'react';
import { sectionIdOf, useFormConfigContext } from '@/context/FormConfigContext';
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
 * Applies the admin's field order to a grid / row of a module form (inside a FormConfigProvider):
 *  • cells holding a configured field are rearranged among themselves by `sortOrder`; other cells (toggles,
 *    banners, unconfigured inputs) keep their place;
 *  • the section's active custom fields are added to the first grid showing that section, in the same order,
 *    so they can sit between built-in fields (DynamicModuleCustomFields then leaves them out).
 * Outside a provider the children are returned untouched.
 */
export function useConfiguredChildren(children: React.ReactNode): React.ReactNode {
    const ctx = useFormConfigContext();
    const gridId = useId();
    const items = React.Children.toArray(children);
    const fields = ctx ? items.map((item) => fieldOf(item, ctx.systemFields)) : [];
    const anchor = fields.find(Boolean);
    const sectionId = anchor ? sectionIdOf(anchor) : undefined;
    const claimSection = ctx?.claimSection;

    useEffect(() => {
        if (!sectionId || !claimSection) return;
        return claimSection(sectionId, gridId);
    }, [sectionId, claimSection, gridId]);

    if (!ctx || !anchor || !sectionId) return children;

    const showsCustomFields = ctx.sectionClaims[sectionId]?.[0] === gridId;
    const custom = showsCustomFields
        ? ctx.customFields.filter((f) => f.isActive && f.isVisibleInForm && sectionIdOf(f) === sectionId)
        : [];

    const entries: { node: React.ReactNode; field?: FormFieldDefinitionDto }[] = [
        ...items.map((node, i) => ({ node, field: fields[i] })),
        ...custom.map((field) => ({ node: <DynamicFormField key={`custom-${field.id}`} field={field} required={field.isRequired} />, field })),
    ];
    const slots = entries.flatMap((entry, i) => (entry.field ? [i] : []));
    const sorted = slots.map((i) => entries[i]).sort((a, b) => a.field!.sortOrder - b.field!.sortOrder);
    const result = entries.map((entry) => entry.node);
    slots.forEach((slot, k) => {
        result[slot] = sorted[k].node;
    });
    return result;
}
