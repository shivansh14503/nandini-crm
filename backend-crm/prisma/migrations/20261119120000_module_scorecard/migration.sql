BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[ModuleScorecard] (
    [module] NVARCHAR(40) NOT NULL,
    [fieldKey] NVARCHAR(80) NOT NULL,
    [currencyFieldKey] NVARCHAR(80),
    [optionsJson] NVARCHAR(max) NOT NULL,
    [listViewColor] BIT NOT NULL CONSTRAINT [ModuleScorecard_listViewColor_df] DEFAULT 0,
    [detailViewColor] BIT NOT NULL CONSTRAINT [ModuleScorecard_detailViewColor_df] DEFAULT 0,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ModuleScorecard_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ModuleScorecard_pkey] PRIMARY KEY CLUSTERED ([module])
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
