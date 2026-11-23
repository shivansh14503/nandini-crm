'use client';

import { useMemo } from 'react';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { useMasterData } from '@/hooks/queries/useMasterData';
import { CRM_MODULE_LABELS, type CrmModuleKey } from '@/types/formConfig.types';
import { fieldFormName, moduleFields } from '@/utils/formConfig';
import { dateRange, isConditionComplete, type FilterCriteria, type FilterFieldDef, type FilterOption, type ModuleFilterFields } from '@/components/common/TableFilter';
import type { AuditFacets, AuditListQuery, AuditRange } from '@/services/auditAdmin.service';

/** Where the audit log's recent / saved filters are kept (/api/table-filters). */
export const AUDIT_FILTER_SCOPE = 'audit-log' as const;

/** Category tabs above the table (not a filter field: the tab is the category). */
export const CATEGORY_TABS = [
    { key: 'all', label: 'All' },
    { key: 'DATA', label: 'Data' },
    { key: 'CONFIG', label: 'Configuration' },
    { key: 'SECURITY', label: 'Security' },
] as const;
export type CategoryTab = (typeof CATEGORY_TABS)[number]['key'];

export const SOURCE_LABELS: Record<string, string> = { UI: 'Web app', API: 'API', IMPORT: 'Import', JOB: 'Background job' };
const SEVERITY_LABELS: Record<string, string> = { INFO: 'Info', NOTICE: 'Notice', WARNING: 'Warning', CRITICAL: 'Critical' };

const CRM_MODULES = Object.keys(CRM_MODULE_LABELS) as CrmModuleKey[];

/** Filter field keys are the API's query names. */
const DEFAULT_KEYS = ['time', 'user', 'module', 'action', 'field', 'entityLabel', 'entityCode', 'source'];

const none = () => undefined;
const fromFacets = (options: { value: string; label: string }[] | undefined): FilterOption[] => (options ?? []).map(({ value, label }) => ({ value, label }));
const fromLabels = (labels: Record<string, string>): FilterOption[] => Object.entries(labels).map(([value, label]) => ({ value, label }));

/**
 * Every field an entry can be filtered by: dropdowns from the facets of the chosen range (only what occurs there),
 * changed fields from the form configuration (labels as on the forms, custom fields included).
 */
export function useAuditFilterFields(facets: AuditFacets | undefined): ModuleFilterFields {
    const configs = useFormConfigs();
    const { users } = useMasterData();

    return useMemo(() => {
        // One option per stored key; a key with different labels per module shows them all.
        const fieldLabels = new Map<string, Set<string>>();
        for (const moduleKey of CRM_MODULES) {
            for (const field of moduleFields(configs, moduleKey)) {
                const key = fieldFormName(field);
                fieldLabels.set(key, (fieldLabels.get(key) ?? new Set()).add(field.label.trim()));
            }
        }
        const changedFields = [...fieldLabels]
            .map(([value, labels]) => ({ value, label: [...labels].join(' / ') }))
            .sort((a, b) => a.label.localeCompare(b.label));

        // Users with entries in the range first, then everyone else.
        const seen = new Set((facets?.users ?? []).map((u) => u.value));
        const userOptions = [
            ...fromFacets(facets?.users),
            ...users
                .filter((u) => !u.isGroupUser && !seen.has(u.username))
                .map((u) => ({ value: u.username, label: u.name || u.username }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        ];

        const fields: FilterFieldDef[] = [
            { key: 'time', label: 'Date', kind: 'date', getValue: none },
            { key: 'user', label: 'User', kind: 'options', options: userOptions, getValue: none },
            { key: 'module', label: 'Module', kind: 'options', options: fromFacets(facets?.modules), getValue: none },
            { key: 'action', label: 'Action', kind: 'options', options: fromFacets(facets?.actions), getValue: none },
            { key: 'field', label: 'Changed Field', kind: 'options', options: changedFields, getValue: none },
            { key: 'entityLabel', label: 'Record Name', kind: 'text', getValue: none },
            { key: 'entityCode', label: 'Record Number', kind: 'text', getValue: none },
            { key: 'source', label: 'Source', kind: 'options', options: fromLabels(SOURCE_LABELS), getValue: none },
            { key: 'severity', label: 'Severity', kind: 'options', options: fromLabels(SEVERITY_LABELS), getValue: none },
            { key: 'ip', label: 'IP Address', kind: 'text', exactMatch: true, placeholder: 'e.g. 10.0.0.5, or 10.0.0.* for a range', getValue: none },
            { key: 'entityId', label: 'Record ID', kind: 'text', exactMatch: true, placeholder: 'The record’s id', getValue: none },
            { key: 'requestId', label: 'Request ID', kind: 'text', exactMatch: true, placeholder: 'From an entry’s details', getValue: none },
        ];
        return { fields, byKey: new Map(fields.map((f) => [f.key, f])), defaultKeys: DEFAULT_KEYS };
    }, [configs, users, facets]);
}

const OPTION_KEYS = ['user', 'module', 'action', 'field', 'source', 'severity'] as const;
const TEXT_KEYS = ['entityLabel', 'entityCode', 'ip', 'entityId', 'requestId'] as const;

/** The applied filter (+ tab and search box) as the list's query. */
export function criteriaToQuery(criteria: FilterCriteria | null, byKey: Map<string, FilterFieldDef>, category: CategoryTab, q: string): AuditListQuery {
    const query: AuditListQuery = {};
    const conditions = criteria?.conditions ?? {};
    const time = conditions.time;
    if (isConditionComplete(byKey.get('time'), time)) {
        const [from, to] = dateRange(time) ?? ['', ''];
        if (from) query.from = from;
        if (to) query.to = to;
    }
    for (const key of OPTION_KEYS) {
        const c = conditions[key];
        if (isConditionComplete(byKey.get(key), c) && c.values?.length) query[key] = c.values;
    }
    for (const key of TEXT_KEYS) {
        const c = conditions[key];
        if (isConditionComplete(byKey.get(key), c) && c.value?.trim()) query[key] = c.value.trim();
    }
    if (category !== 'all') query.category = [category];
    if (q.trim()) query.q = q.trim();
    return query;
}

const DAY_MS = 86_400_000;
const MAX_AGGREGATE_DAYS = 366;
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Range of the summary, chart and filter options: the list's dates, at most the last 366 days of them (the API's
 * limit); none means the last 30 days.
 */
export function aggregateRange(query: AuditListQuery): AuditRange {
    if (!query.from && !query.to) return {};
    const to = query.to ?? ymd(new Date());
    const end = new Date(`${to}T00:00:00`).getTime();
    const earliest = ymd(new Date(end - (MAX_AGGREGATE_DAYS - 1) * DAY_MS));
    const from = query.from && query.from > earliest ? query.from : query.from ? earliest : undefined;
    return { from, to };
}
