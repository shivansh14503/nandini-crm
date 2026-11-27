-- Booking links: default video meeting of booked meetings (Calendar follow-up to P3-1 and Phase 4 booking links).
-- BookingLink gains `videoMeeting` (meet | teams; NULL = none). Existing links get NULL, so nothing changes for
-- visitors or owners on deploy until an owner picks Google Meet / Microsoft Teams in the booking link dialog.
-- No index: the column is only read with its link row.
-- Must sort after every migration on main (latest 20261215110000_recurring_activities) and after the ones open PRs
-- add (P2-8 customer-meeting import 20261216090000, email logging 20261216100000).
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[BookingLink] ADD [videoMeeting] NVARCHAR(20);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
