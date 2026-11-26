-- Follow-ups create activities (Calendar Phase 2, P2-4): every open lead / opportunity with a next follow-up gets one
-- open "follow-up activity" (Activity.origin = 'followup'), written by the CRM in the record's own transaction
-- (backend-crm/src/modules/activities/activity.followUp.ts). The record stays the source of truth for the slot; Lead
-- Rating, ageing and scorecards keep reading the record's own columns.
--
--   1. Activity.origin: where an activity comes from. 'crm' (made in the CRM: every existing row), 'followup' (a lead /
--      opportunity follow-up), 'calendar' (imported from a calendar, P2-8). NOT NULL with default 'crm', so existing
--      rows read as before.
--   2. UX_Activity_openFollowUp: at most one open follow-up activity per record. Writers complete or cancel the old one
--      before inserting a new one, in one transaction, under the record's lock (D45: a unique-index refusal aborts the
--      transaction, which the caller retries once).
--
-- No data is written here: existing leads / opportunities get their follow-up activities from the backfill
-- (npm run followups:backfill [-- --dry-run], also a nightly step), so the deploy itself stays quick.
--
-- Hand-written (Prisma can't model filtered indexes; named in schema.prisma, keep it out of it):
--   UX_Activity_openFollowUp (relatedModule, relatedId) WHERE origin = 'followup' AND status = 'Planned' AND isDeleted = 0
-- The default collation compares case-insensitively, like every other module key / status comparison in the CRM.
-- The string default ('crm') is plain ASCII, so Prisma's literal without N loses nothing.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Activity] ADD [origin] NVARCHAR(20) NOT NULL CONSTRAINT [Activity_origin_df] DEFAULT 'crm';

-- Dynamic SQL: the new column doesn't exist yet when this batch is compiled.
EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_Activity_openFollowUp] ON [dbo].[Activity]([relatedModule], [relatedId])
    WHERE [origin] = N''followup'' AND [status] = N''Planned'' AND [isDeleted] = 0;');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
