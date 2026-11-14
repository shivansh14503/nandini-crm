BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[TableFilter] (
    [id] NVARCHAR(50) NOT NULL,
    [username] NVARCHAR(50) NOT NULL,
    [module] NVARCHAR(30) NOT NULL,
    [kind] NVARCHAR(10) NOT NULL,
    [name] NVARCHAR(120),
    [criteriaJson] NVARCHAR(max) NOT NULL,
    [fingerprint] NVARCHAR(64) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TableFilter_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [lastUsedAt] DATETIME2 NOT NULL CONSTRAINT [TableFilter_lastUsedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [TableFilter_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TableFilter_username_module_kind_idx] ON [dbo].[TableFilter]([username], [module], [kind]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
