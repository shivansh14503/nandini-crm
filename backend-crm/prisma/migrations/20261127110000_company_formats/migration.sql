-- Admin › Company formats (Profile Phase 5): how dates, times and numbers are shown across the CRM, its PDFs and emails.
-- CompanyFormatSettings: new single-row table (id = 1), written on the first save in Admin › Company formats and
-- deleted by "Reset to CRM defaults". No row means not customized: every screen keeps the style it had before this
-- migration, so nothing is seeded or backfilled. Values are validated by the API (no CHECK constraints): dateFormat is
-- one of DD-MMM-YYYY, DD MMM YYYY, DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY, YYYY-MM-DD; timeFormat 12h or 24h;
-- numberGrouping indian or international. Formats change display only; no stored value changes. No other table changes.
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[CompanyFormatSettings] (
    [id] INT NOT NULL,
    [dateFormat] NVARCHAR(12) NOT NULL CONSTRAINT [CompanyFormatSettings_dateFormat_df] DEFAULT 'DD-MMM-YYYY',
    [timeFormat] NVARCHAR(3) NOT NULL CONSTRAINT [CompanyFormatSettings_timeFormat_df] DEFAULT '12h',
    [numberGrouping] NVARCHAR(13) NOT NULL CONSTRAINT [CompanyFormatSettings_numberGrouping_df] DEFAULT 'indian',
    [updatedBy] NVARCHAR(50),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [CompanyFormatSettings_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CompanyFormatSettings_pkey] PRIMARY KEY CLUSTERED ([id])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
