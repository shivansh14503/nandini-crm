BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[DrawerLayout] (
    [module] NVARCHAR(40) NOT NULL,
    [layoutJson] NVARCHAR(max) NOT NULL,
    [version] INT NOT NULL CONSTRAINT [DrawerLayout_version_df] DEFAULT 1,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DrawerLayout_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [DrawerLayout_pkey] PRIMARY KEY CLUSTERED ([module])
);

-- CreateTable
CREATE TABLE [dbo].[DrawerPiece] (
    [id] NVARCHAR(50) NOT NULL,
    [module] NVARCHAR(40) NOT NULL,
    [name] NVARCHAR(120) NOT NULL,
    [sectionJson] NVARCHAR(max) NOT NULL,
    [createdBy] NVARCHAR(50) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DrawerPiece_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DrawerPiece_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DrawerPiece_module_idx] ON [dbo].[DrawerPiece]([module]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
