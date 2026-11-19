BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[EmailValidationRun] ADD [mode] NVARCHAR(10) NOT NULL CONSTRAINT [EmailValidationRun_mode_df] DEFAULT 'single',
[phase] NVARCHAR(30),
[providerEmailsJson] NVARCHAR(max),
[providerJobId] NVARCHAR(64),
[providerProgress] INT,
[lastPolledAt] DATETIME2;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
