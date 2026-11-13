BEGIN TRY

BEGIN TRAN;

-- Document series use "/" as the default separator (NIPL/L/26-27/1004). Modules without a series keep their
-- original "LD-0001" numbering regardless (the service formats those itself).
ALTER TABLE [dbo].[DocumentSeriesSettings] DROP CONSTRAINT [DocumentSeriesSettings_separator_df];
ALTER TABLE [dbo].[DocumentSeriesSettings] ADD CONSTRAINT [DocumentSeriesSettings_separator_df] DEFAULT '/' FOR [separator];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
