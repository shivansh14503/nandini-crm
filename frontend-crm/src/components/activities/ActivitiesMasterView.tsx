'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import DateRangeOutlinedIcon from '@mui/icons-material/DateRangeOutlined';
import CallOutlinedIcon from '@mui/icons-material/CallOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CheckIcon from '@mui/icons-material/Check';

import { ModuleScorecardSummary, useModuleScorecard } from '../common/scorecard/useModuleScorecard';
import { CommonMasterView } from '../common/CommonMasterView';
import { useTableFilter } from '../common/TableFilter';
import { MasterHeaderActions, outlinedHeaderButtonSx } from '../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../common/buildExtendedSearchConfig';
import { AppToast } from '../common/AppToast';
import { type DataTableFilterItem } from '../common/DataTable';
import { useResetTab } from '@/hooks/useResetTab';
import { useSaveFlash } from '@/utils/saveFlash';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { findCrmUser } from '@/services/masterData.store';
import { NOTE_TYPE, TASK_TYPE, type Activity } from '@/types/activity.types';
import { useActivities, useBulkDeleteActivities, useDeleteActivity } from '@/hooks/queries/useActivities';
import { addDays, instantToZonedWallClock, zonedStartOfDay } from '@/utils/zonedTime';
import { useSearchScope, useSearchScopedRows } from '../search/SearchScope';
import { ActivityDetailDrawer } from './ActivityDetailDrawer';
import { useActivityColumns } from './activityColumns';
import { useActivityTypeLabel } from './ActivityBadges';
import { attendeeLabel } from './RhfAttendeesField';
import { activitySortTime, isActivityOverdue, useBusinessClock } from './activityTime';

/** Quick-view pills ('all' = none picked). `type` is a Followup Type the nav asked for that has no pill of its own. */
export type ActivityFilterTab = 'all' | 'mine' | 'today' | 'overdue' | 'next7' | 'calls' | 'meetings' | 'tasks' | 'notes' | 'type';

/** Pills that stand for one Followup Type (option values; an admin rename keeps them). */
const TYPE_PILLS: Partial<Record<ActivityFilterTab, string>> = { calls: 'Call', meetings: 'Meeting', tasks: TASK_TYPE, notes: NOTE_TYPE };

/** The days the list loads around today (business timezone): `[today − back, today + ahead]`. */
export interface ActivityWindow {
    id: string;
    label: string;
    back: number;
    ahead: number;
}

export const ACTIVITY_WINDOWS: ActivityWindow[] = [
    { id: 'default', label: 'Last 30 days – next 60 days', back: 30, ahead: 60 },
    { id: 'recent', label: 'Last 90 days – next 30 days', back: 90, ahead: 30 },
    { id: 'upcoming', label: 'Last 7 days – next 180 days', back: 7, ahead: 180 },
    { id: 'year', label: 'Last 365 days – next 365 days', back: 365, ahead: 365 },
];

const userName = (username: string | undefined) => (username ? findCrmUser(username)?.name || username : '');

/** Sort keys that aren't plain text: times as instants, people by full name. */
const sortValue = (a: Activity, field: string): string | number => {
    switch (field) {
        case 'startAt':
            return activitySortTime(a);
        case 'endAt':
            return Date.parse(a.endAt || a.startAt || a.createdAt) || 0;
        case 'createdAt':
            return Date.parse(a.createdAt) || 0;
        case 'assignedTo':
        case 'createdBy':
            return userName(a[field]).toLowerCase();
        case 'allDay':
            return a.allDay ? 1 : 0;
        case 'attendees':
            return a.attendees.length;
        default:
            return String((a as unknown as Record<string, unknown>)[field] ?? '').toLowerCase();
    }
};

const NO_RECORDS: Activity[] = [];

/**
 * True when the signed-in user may change or delete the row: the list also holds activities they were only invited to
 * (`viewer.canEdit` false), which they may see and reply to, not edit. A row without viewer info keeps its actions
 * (the API still checks).
 */
const canChange = (a: Activity) => a.viewer?.canEdit !== false;

export interface ActivitiesMasterViewProps {
    /** `?mine=1` (My Activities). */
    mine?: boolean;
    /** `?type=Call` …: the Followup Type to show. */
    type?: string;
    /** `?status=Planned` …. */
    status?: string;
}

export function ActivitiesMasterView({ mine = false, type = '', status = '' }: ActivitiesMasterViewProps) {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || '';
    const clock = useBusinessClock();
    const typeLabel = useActivityTypeLabel();

    // ── Load window (business timezone) ─────────────────────────────────────────
    const [windowId, setWindowId] = useState('default');
    const [windowMenu, setWindowMenu] = useState<HTMLElement | null>(null);
    const activeWindow = ACTIVITY_WINDOWS.find((w) => w.id === windowId) ?? ACTIVITY_WINDOWS[0];
    const { timeZone } = clock;
    const todayKey = instantToZonedWallClock(clock.now(), timeZone).slice(0, 10);
    const range = useMemo(
        () => ({
            from: zonedStartOfDay(addDays(todayKey, -activeWindow.back), timeZone).toISOString(),
            to: zonedStartOfDay(addDays(todayKey, activeWindow.ahead + 1), timeZone).toISOString(),
        }),
        [todayKey, activeWindow, timeZone]
    );

    // On the global search results page the table shows the matched records instead of this list.
    const embeddedInSearch = Boolean(useSearchScope());
    const { data: loaded = NO_RECORDS, refetch, isPending: listPending } = useActivities(range, { enabled: !embeddedInSearch });
    const listLoading = !embeddedInSearch && listPending;
    const allActivities = useSearchScopedRows(loaded);
    const deleteMutation = useDeleteActivity();
    const bulkDeleteMutation = useBulkDeleteActivities();

    // ?mine=1 / ?type=… from the nav preselect a pill.
    const initialTab: ActivityFilterTab = mine
        ? 'mine'
        : ((Object.entries(TYPE_PILLS).find(([, value]) => value.toLowerCase() === type.toLowerCase())?.[0] as ActivityFilterTab | undefined) ??
          (type ? 'type' : 'all'));
    const [activeTab, setActiveTab] = useResetTab<ActivityFilterTab>(initialTab);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<string>('startAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const tableFilter = useTableFilter<Activity>({
        module: 'activities',
        rows: allActivities,
        onSortChange: (s) => {
            setSortField(s.field);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    // ?status=… narrows the list (no pill: the status cards and the filter dialog cover statuses).
    const activities = useMemo(
        () => (status ? tableFilter.filteredRows.filter((a) => a.status.toLowerCase() === status.toLowerCase()) : tableFilter.filteredRows),
        [tableFilter.filteredRows, status]
    );
    const [drawerId, setDrawerId] = useState<string | null>(null);
    const drawerActivity = useMemo(() => (drawerId ? activities.find((a) => a.id === drawerId) ?? null : null), [activities, drawerId]);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // Back from the create / edit form: show its toast and open the saved activity in the drawer.
    useSaveFlash(ROUTES.ACTIVITIES, (flash) => {
        setToast({ open: true, message: flash.message, severity: flash.severity ?? 'success' });
        if (flash.recordId) setDrawerId(flash.recordId);
    });
    const closeDrawer = useCallback(() => setDrawerId(null), []);

    const handleDelete = async (activity: Activity) => {
        if (!window.confirm(`Are you sure you want to delete "${activity.subject}"?`)) return;
        try {
            await deleteMutation.mutateAsync(activity.id);
            if (drawerId === activity.id) closeDrawer();
            setToast({ open: true, message: 'Activity deleted successfully.', severity: 'success' });
        } catch (err: unknown) {
            setToast({ open: true, message: err instanceof Error ? err.message : 'Failed to delete activity.', severity: 'error' });
        }
    };

    const handleBulkDelete = async () => {
        // Activities the user was only invited to are left out: one of them would fail the whole batch (403).
        const byId = new Map(allActivities.map((a) => [a.id, a]));
        const ids = selectedIds.filter((id) => {
            const row = byId.get(id);
            return !row || canChange(row);
        });
        const skipped = selectedIds.length - ids.length;
        const count = ids.length;
        const plural = (n: number) => `activit${n === 1 ? 'y' : 'ies'}`;
        const skippedNote = skipped > 0 ? ` ${skipped} ${plural(skipped)} you were only invited to can't be deleted and will be kept.` : '';
        if (count === 0) {
            if (skipped > 0) {
                setToast({ open: true, message: `You were only invited to the selected ${plural(skipped)}: only the owner can delete them.`, severity: 'warning' });
            }
            return;
        }
        if (!window.confirm(`Are you sure you want to delete ${count} selected ${plural(count)}?${skippedNote}`)) return;
        try {
            await bulkDeleteMutation.mutateAsync(ids);
            if (drawerId && ids.includes(drawerId)) closeDrawer();
            setSelectedIds([]);
            setToast({
                open: true,
                message: `${count} ${plural(count)} deleted successfully.${skipped > 0 ? ` ${skipped} skipped: you were only invited.` : ''}`,
                severity: 'success',
            });
        } catch (err: unknown) {
            setToast({ open: true, message: err instanceof Error ? err.message : 'Failed to delete activities.', severity: 'error' });
        }
    };

    // ── Quick View Pills ──────────────────────────────────────────────────────
    const now = clock.now();
    const nowMs = now.getTime();
    const weekAheadMs = nowMs + 7 * 24 * 60 * 60 * 1000;
    const predicates = useMemo<Record<Exclude<ActivityFilterTab, 'all'>, (a: Activity) => boolean>>(() => {
        const at = new Date(nowMs);
        const isToday = (a: Activity) => {
            if (a.followupType === NOTE_TYPE) return false;
            if (a.allDay) return Boolean(a.startDay) && a.startDay <= todayKey && (a.endDay || a.startDay) >= todayKey;
            return Boolean(a.startAt) && instantToZonedWallClock(new Date(a.startAt), timeZone).slice(0, 10) === todayKey;
        };
        const ofType = (value: string) => (a: Activity) => a.followupType.toLowerCase() === value.toLowerCase();
        return {
            mine: (a) => Boolean(currentUsername) && a.assignedTo === currentUsername,
            today: isToday,
            overdue: (a) => isActivityOverdue(a, at),
            next7: (a) => {
                const start = Date.parse(a.startAt);
                return a.status === 'Planned' && a.followupType !== NOTE_TYPE && Number.isFinite(start) && start >= nowMs && start < weekAheadMs;
            },
            calls: ofType('Call'),
            meetings: ofType('Meeting'),
            tasks: ofType(TASK_TYPE),
            notes: ofType(NOTE_TYPE),
            type: ofType(type),
        };
    }, [currentUsername, nowMs, weekAheadMs, todayKey, timeZone, type]);

    const filterItems: DataTableFilterItem<ActivityFilterTab>[] = useMemo(() => {
        const count = (id: Exclude<ActivityFilterTab, 'all'>) => activities.filter(predicates[id]).length;
        return [
            { id: 'mine', label: 'My Activities', icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />, count: count('mine') },
            { id: 'today', label: 'Today', icon: <TodayOutlinedIcon sx={{ fontSize: 16 }} />, count: count('today') },
            {
                id: 'overdue',
                label: 'Overdue',
                icon: <EventBusyOutlinedIcon sx={{ fontSize: 16 }} />,
                count: count('overdue'),
                activeColor: 'var(--mui-palette-error-main)',
            },
            { id: 'next7', label: 'Next 7 days', icon: <DateRangeOutlinedIcon sx={{ fontSize: 16 }} />, count: count('next7') },
            { id: 'calls', label: 'Calls', icon: <CallOutlinedIcon sx={{ fontSize: 16 }} />, count: count('calls') },
            { id: 'meetings', label: 'Meetings', icon: <GroupsOutlinedIcon sx={{ fontSize: 16 }} />, count: count('meetings') },
            { id: 'tasks', label: 'Tasks', icon: <TaskAltOutlinedIcon sx={{ fontSize: 16 }} />, count: count('tasks') },
            { id: 'notes', label: 'Notes', icon: <StickyNote2OutlinedIcon sx={{ fontSize: 16 }} />, count: count('notes') },
            // A type the nav asked for (Emails …) without a pill of its own.
            ...(initialTab === 'type'
                ? [{ id: 'type' as const, label: typeLabel(type) || type, icon: <FilterAltOutlinedIcon sx={{ fontSize: 16 }} />, count: count('type') }]
                : []),
        ];
    }, [activities, predicates, initialTab, type, typeLabel]);

    /** Activities in the active pill view: the scorecard counts these. */
    const tabActivities = useMemo(() => (activeTab === 'all' ? activities : activities.filter(predicates[activeTab])), [activities, activeTab, predicates]);

    const goToFirstPage = useCallback(() => setPage(0), []);
    const scorecard = useModuleScorecard<Activity>({ module: 'activities', rows: tabActivities, onActiveChange: goToFirstPage });

    // ── Filter & Sort ─────────────────────────────────────────────────────────
    const { matches: matchesScorecard } = scorecard;
    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        const result = tabActivities.filter((a) => {
            if (!matchesScorecard(a)) return false;
            if (!q) return true;
            return [
                a.subject,
                a.followupType,
                a.relatedTo,
                a.relatedCode,
                a.organizationName,
                a.contact,
                a.location,
                a.remarks,
                a.assignedTo,
                userName(a.assignedTo),
                ...a.attendees.map(attendeeLabel),
            ].some((v) => (v || '').toLowerCase().includes(q));
        });
        const dir = sortOrder === 'asc' ? 1 : -1;
        return result.sort((x, y) => {
            const vx = sortValue(x, sortField);
            const vy = sortValue(y, sortField);
            const diff = typeof vx === 'number' && typeof vy === 'number' ? vx - vy : String(vx).localeCompare(String(vy), undefined, { numeric: true });
            return diff * dir;
        });
    }, [tabActivities, matchesScorecard, searchQuery, sortField, sortOrder]);

    const paginated = useMemo(() => filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), [filtered, page, rowsPerPage]);

    const openDrawerRecord = useCallback((record: Activity) => setDrawerId(record.id), []);
    const columns = useActivityColumns(openDrawerRecord);

    const handleSort = (field: string) => {
        const isAsc = sortField === field && sortOrder === 'asc';
        setSortOrder(isAsc ? 'desc' : 'asc');
        setSortField(field);
    };

    const pageTitle = mine ? 'My Activities' : initialTab !== 'all' && initialTab !== 'mine' ? filterItems.find((f) => f.id === initialTab)?.label : undefined;

    return (
        <CommonMasterView<Activity, ActivityFilterTab>
            loading={listLoading}
            breadcrumbItems={[{ label: 'Activities', href: pageTitle ? ROUTES.ACTIVITIES : undefined }, ...(pageTitle ? [{ label: pageTitle }] : [])]}
            summary={<ModuleScorecardSummary state={scorecard} loading={listLoading} />}
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab((prev) => (prev === tab ? 'all' : tab));
                    setPage(0);
                },
            }}
            tableId="activities"
            formModule="activities"
            tableFilter={tableFilter}
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={async () => {
                        const { isError } = await refetch();
                        setToast(
                            isError
                                ? { open: true, message: 'Failed to refresh activities.', severity: 'error' }
                                : { open: true, message: 'Activities refreshed.', severity: 'info' }
                        );
                    }}
                    onNewClick={() => router.push(ROUTES.ACTIVITY_NEW)}
                    newButtonLabel="New Activity"
                >
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<DateRangeOutlinedIcon sx={{ fontSize: 16 }} />}
                        onClick={(e) => setWindowMenu(e.currentTarget)}
                        aria-haspopup="menu"
                        sx={{ ...outlinedHeaderButtonSx, maxWidth: '100%' }}
                    >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeWindow.label}</span>
                    </Button>
                    <Menu
                        anchorEl={windowMenu}
                        open={Boolean(windowMenu)}
                        onClose={() => setWindowMenu(null)}
                        slotProps={{ paper: { sx: { mt: 0.5, borderRadius: '10px', border: '1px solid var(--mui-palette-border-main)' } } }}
                    >
                        {ACTIVITY_WINDOWS.map((w) => (
                            <MenuItem
                                key={w.id}
                                selected={w.id === windowId}
                                onClick={() => {
                                    setWindowId(w.id);
                                    setWindowMenu(null);
                                    setPage(0);
                                }}
                                sx={{ fontSize: '0.84rem', minHeight: 40 }}
                            >
                                <ListItemIcon sx={{ minWidth: 28 }}>{w.id === windowId && <CheckIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)' }} />}</ListItemIcon>
                                <ListItemText slotProps={{ primary: { sx: { fontSize: '0.84rem' } } }}>{w.label}</ListItemText>
                            </MenuItem>
                        ))}
                    </Menu>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<CalendarMonthOutlinedIcon sx={{ fontSize: 16 }} />}
                        onClick={() => router.push(ROUTES.CALENDAR)}
                        sx={outlinedHeaderButtonSx}
                    >
                        Calendar
                    </Button>
                </MasterHeaderActions>
            )}
            searchConfig={buildExtendedSearchConfig({
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setPage(0);
                },
                searchPlaceholder: 'Search by subject, related record, organization, contact, attendee...',
                pageIds: paginated.map((r) => r.id),
                allIds: filtered.map((r) => r.id),
                selectedIds,
                onSelectedIdsChange: setSelectedIds,
                page,
                rowsPerPage,
                totalRecords: filtered.length,
                onPageChange: setPage,
                onBulkDelete: handleBulkDelete,
            })}
            columns={columns}
            data={paginated}
            keyExtractor={(a) => a.id}
            selectedIds={selectedIds}
            onToggleSelectRow={(id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))}
            onToggleSelectAll={(checked) => setSelectedIds(checked ? paginated.map((a) => a.id) : [])}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onView={(a) => router.push(ROUTES.ACTIVITY_DETAIL(a.id))}
            getEditHref={(a) => (canChange(a) ? ROUTES.ACTIVITY_EDIT(a.id) : undefined)}
            onDelete={handleDelete}
            canDeleteRow={canChange}
            getRowHref={(a) => ROUTES.ACTIVITY_DETAIL(a.id)}
            onRowClick={(a) => setDrawerId(a.id)}
            activeRowId={drawerActivity?.id}
            viewTooltip="View Activity"
            editTooltip="Edit Activity"
            deleteTooltip="Delete Activity"
            emptyTitle="No activities found"
            emptyDescription="No activities in this window match your search and filters. Widen the date window or clear the filters."
            emptyActionLabel="New Activity"
            onEmptyAction={() => router.push(ROUTES.ACTIVITY_NEW)}
            emptyIcon={<EventNoteOutlinedIcon sx={{ fontSize: 48, color: 'var(--mui-palette-text-muted)' }} />}
            pagination={{
                page,
                rowsPerPage,
                totalCount: filtered.length,
                entityLabel: 'Activities',
                pageSizeOptions: [10, 25, 50],
                onPageChange: setPage,
                onRowsPerPageChange: (n) => {
                    setRowsPerPage(n);
                    setPage(0);
                },
            }}
            drawer={
                <ActivityDetailDrawer
                    activity={drawerActivity}
                    activityId={drawerId}
                    open={Boolean(drawerId)}
                    onClose={closeDrawer}
                    onEdit={(id) => router.push(ROUTES.ACTIVITY_EDIT(id))}
                />
            }
            isDrawerOpen={Boolean(drawerId)}
            toast={
                <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((prev) => ({ ...prev, open: false }))} />
            }
        />
    );
}
