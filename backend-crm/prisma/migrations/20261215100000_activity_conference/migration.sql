-- Video meetings, Google Meet + Microsoft Teams (Calendar Phase 3, P3-1).
-- Activity gains the video meeting of its calendar event: the requested provider (meet | teams; zoom is P3-2 and not
-- offered), its state (requested | ready | failed), the join URL, the provider's conference id, a short error and the
-- number of the last Meet create request (Google requestId '<requestedId>-c<n>'). Existing rows get NULL / 0: no
-- activity has a video meeting until someone picks one in the form, so nothing changes for users on deploy.
--
-- Data: the Followup Type options Meeting and Demo / Presentation (shared_followup_type) get option meta
-- `videoMeeting: true`, which offers the form's Video meeting field for them (admins switch it per type on Admin › API
-- Integrations › What goes to calendars). Options an admin renamed keep their meta as it is; an option whose metaJson
-- isn't valid JSON is left alone; one that already has the key keeps its value.
--
-- Index: Activity_conferenceState_updatedAt_idx serves the nightly sweep that gives up on links still `requested` an hour
-- after the last save (calendar-nightly, 00:25). Must sort after every migration on main (latest
-- 20261215090000_calendar_watch_channels, Calendar Phase 2 P2-7).
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Activity] ADD [conferenceError] NVARCHAR(300),
[conferenceId] NVARCHAR(200),
[conferenceJoinUrl] NVARCHAR(1000),
[conferenceProvider] NVARCHAR(20),
[conferenceRequest] INT NOT NULL CONSTRAINT [Activity_conferenceRequest_df] DEFAULT 0,
[conferenceState] NVARCHAR(20);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Activity_conferenceState_updatedAt_idx] ON [dbo].[Activity]([conferenceState], [updatedAt]);

-- Data: offer Video meeting on the seeded meeting types.
UPDATE o
SET o.[metaJson] = JSON_MODIFY(COALESCE(o.[metaJson], N'{}'), N'$.videoMeeting', CAST(1 AS BIT)),
    o.[updatedAt] = CURRENT_TIMESTAMP
FROM [dbo].[DropdownOption] o
INNER JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
WHERE c.[key] = N'shared_followup_type'
  AND o.[value] IN (N'Meeting', N'Demo / Presentation')
  AND (o.[metaJson] IS NULL OR (ISJSON(o.[metaJson]) = 1 AND JSON_VALUE(o.[metaJson], N'$.videoMeeting') IS NULL));

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
