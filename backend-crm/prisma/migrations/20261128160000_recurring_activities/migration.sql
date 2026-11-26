-- Recurring activities (Calendar Phase 4, Phase 1 R12): CRM-authored series stored as one Activity row per occurrence
-- over a rolling horizon, never as an RRULE master (activities/activity.series.ts, activity.recurrence.ts).
--
--   ActivitySeries   the rule (daily / weekly on weekdays / monthly by day or nth weekday, every N, until a day or a
--                    count), the anchor (first day, time of day, duration / span), the business time zone and the
--                    fields every occurrence copies (templateJson). materializedThrough = the last business day the
--                    occurrences have been created through; the reminders worker's nightly job extends it.
--   Activity         + seriesId (FK, NO ACTION), originalStartAt (the rule slot this row fills), seriesIndex (position),
--                    seriesException (edited alone: series edits leave it).
--
-- Hand-written below (Prisma can't model filtered indexes; keep it out of schema.prisma):
--   UX_Activity_seriesOccurrence UNIQUE (seriesId, originalStartAt) WHERE seriesId IS NOT NULL
-- = one row per series slot, soft-deleted rows included, so the horizon extension never re-creates a deleted
-- occurrence (it pre-reads the slots under the series lock; a race aborts the transaction, D45).
--
-- New columns are nullable / defaulted: no existing data changes. Must sort after 20261128120000_booking_links and the
-- open P2-5 (20261128140000) / P3-1 (20261128150000) migrations.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Activity] ADD [originalStartAt] DATETIME2,
[seriesException] BIT NOT NULL CONSTRAINT [Activity_seriesException_df] DEFAULT 0,
[seriesId] NVARCHAR(50),
[seriesIndex] INT;

-- CreateTable
CREATE TABLE [dbo].[ActivitySeries] (
    [id] NVARCHAR(50) NOT NULL,
    [assignedTo] NVARCHAR(50) NOT NULL,
    [frequency] NVARCHAR(10) NOT NULL,
    [interval] INT NOT NULL CONSTRAINT [ActivitySeries_interval_df] DEFAULT 1,
    [weekdays] NVARCHAR(20),
    [monthlyMode] NVARCHAR(10),
    [monthDay] INT,
    [setPos] INT,
    [setWeekday] INT,
    [untilDay] NVARCHAR(10),
    [count] INT,
    [startDay] NVARCHAR(10) NOT NULL,
    [startTime] NVARCHAR(5),
    [allDay] BIT NOT NULL CONSTRAINT [ActivitySeries_allDay_df] DEFAULT 0,
    [durationMinutes] INT NOT NULL CONSTRAINT [ActivitySeries_durationMinutes_df] DEFAULT 30,
    [spanDays] INT NOT NULL CONSTRAINT [ActivitySeries_spanDays_df] DEFAULT 1,
    [timeZone] NVARCHAR(64) NOT NULL CONSTRAINT [ActivitySeries_timeZone_df] DEFAULT 'Asia/Kolkata',
    [templateJson] NVARCHAR(max) NOT NULL,
    [materializedThrough] NVARCHAR(10),
    [endedAt] DATETIME2,
    [splitFromId] NVARCHAR(50),
    [revision] INT NOT NULL CONSTRAINT [ActivitySeries_revision_df] DEFAULT 0,
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ActivitySeries_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [ActivitySeries_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    CONSTRAINT [ActivitySeries_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ActivitySeries_isDeleted_endedAt_materializedThrough_idx] ON [dbo].[ActivitySeries]([isDeleted], [endedAt], [materializedThrough]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ActivitySeries_assignedTo_idx] ON [dbo].[ActivitySeries]([assignedTo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Activity_seriesId_startAt_idx] ON [dbo].[Activity]([seriesId], [startAt]);

-- AddForeignKey
ALTER TABLE [dbo].[Activity] ADD CONSTRAINT [Activity_seriesId_fkey] FOREIGN KEY ([seriesId]) REFERENCES [dbo].[ActivitySeries]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateIndex (hand-written, filtered; dynamic SQL because the columns are added in this batch)
EXEC sp_executesql N'
CREATE UNIQUE NONCLUSTERED INDEX [UX_Activity_seriesOccurrence] ON [dbo].[Activity]([seriesId], [originalStartAt])
    WHERE [seriesId] IS NOT NULL;
';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

