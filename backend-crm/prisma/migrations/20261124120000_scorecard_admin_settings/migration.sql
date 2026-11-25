BEGIN TRY

BEGIN TRAN;

-- Admin › List Scorecards: an on/off switch, the "All" card's wording and a version for concurrent saves.
-- Scorecards saved before stay on, at version 1, so no list screen changes.
ALTER TABLE [dbo].[ModuleScorecard] ADD [allLabel] NVARCHAR(60),
[enabled] BIT NOT NULL CONSTRAINT [ModuleScorecard_enabled_df] DEFAULT 1,
[version] INT NOT NULL CONSTRAINT [ModuleScorecard_version_df] DEFAULT 1;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
