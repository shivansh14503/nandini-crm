import { prisma } from '../../config/prisma.js';
import type { ActivitySeries } from '../../generated/prisma/client.js';
import { ruleFromColumns, summarizeRule, type RepeatRule } from './activity.recurrence.js';

/**
 * `ActivityView.series` (Calendar Phase 4): the series an occurrence belongs to, read with the views (one ActivitySeries
 * read per call, only when a row has a `seriesId`). A leaf module: prisma, the generated types and the pure rules only,
 * so the activity service, the series service and the mapper import it without cycles.
 */

export interface ActivitySeriesView {
    id: string;
    rule: RepeatRule;
    /** "Every week on Mon, Wed until 31 Mar 2027". */
    summary: string;
    /** This occurrence's position (1 = the first), null when unknown. */
    index: number | null;
    /** Number of occurrences when the series ends after a count, else null. */
    total: number | null;
    /** Changed on its own ("This event"): series edits leave it. */
    exception: boolean;
    /** No more occurrences are created (ended, split, cancelled or deleted). */
    ended: boolean;
}

/** Series views by activity id. */
export type SeriesById = ReadonlyMap<string, ActivitySeriesView>;
export const NO_SERIES: SeriesById = new Map();

type SeriesRuleRow = Pick<
    ActivitySeries,
    'id' | 'frequency' | 'interval' | 'weekdays' | 'monthlyMode' | 'monthDay' | 'setPos' | 'setWeekday' | 'untilDay' | 'count' | 'endedAt' | 'isDeleted'
>;

export const SERIES_VIEW_SELECT = {
    id: true,
    frequency: true,
    interval: true,
    weekdays: true,
    monthlyMode: true,
    monthDay: true,
    setPos: true,
    setWeekday: true,
    untilDay: true,
    count: true,
    endedAt: true,
    isDeleted: true,
} as const;

/** The view of one occurrence of `series` (pure). */
export function seriesViewOf(series: SeriesRuleRow, row: { seriesIndex: number | null; seriesException: boolean }): ActivitySeriesView {
    const rule = ruleFromColumns(series);
    return {
        id: series.id,
        rule,
        summary: summarizeRule(rule),
        index: row.seriesIndex ?? null,
        total: rule.ends === 'after' ? (rule.count ?? null) : null,
        exception: row.seriesException,
        ended: series.isDeleted || series.endedAt !== null,
    };
}

/** Series views of `rows` (one read; none when no row belongs to a series). */
export async function loadSeriesViews(
    rows: readonly { id: string; seriesId: string | null; seriesIndex: number | null; seriesException: boolean }[],
): Promise<SeriesById> {
    const ids = [...new Set(rows.map((row) => row.seriesId).filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return NO_SERIES;
    const series = await prisma.activitySeries.findMany({ where: { id: { in: ids } }, select: SERIES_VIEW_SELECT });
    const byId = new Map(series.map((row) => [row.id, row]));
    const out = new Map<string, ActivitySeriesView>();
    for (const row of rows) {
        const found = row.seriesId ? byId.get(row.seriesId) : undefined;
        if (found) out.set(row.id, seriesViewOf(found, row));
    }
    return out;
}
