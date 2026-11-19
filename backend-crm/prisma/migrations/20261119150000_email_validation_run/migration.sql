BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[EmailValidationRun] (
    [id] NVARCHAR(50) NOT NULL,
    [status] NVARCHAR(20) NOT NULL,
    [emailsJson] NVARCHAR(max) NOT NULL,
    [total] INT NOT NULL,
    [processed] INT NOT NULL CONSTRAINT [EmailValidationRun_processed_df] DEFAULT 0,
    [validCount] INT NOT NULL CONSTRAINT [EmailValidationRun_validCount_df] DEFAULT 0,
    [riskyCount] INT NOT NULL CONSTRAINT [EmailValidationRun_riskyCount_df] DEFAULT 0,
    [invalidCount] INT NOT NULL CONSTRAINT [EmailValidationRun_invalidCount_df] DEFAULT 0,
    [undecidedCount] INT NOT NULL CONSTRAINT [EmailValidationRun_undecidedCount_df] DEFAULT 0,
    [message] NVARCHAR(500),
    [startedBy] NVARCHAR(50) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [EmailValidationRun_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [finishedAt] DATETIME2,
    CONSTRAINT [EmailValidationRun_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmailValidationRun_createdAt_idx] ON [dbo].[EmailValidationRun]([createdAt]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
