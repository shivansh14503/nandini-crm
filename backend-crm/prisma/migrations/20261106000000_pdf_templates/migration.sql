BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[PdfTemplate] (
    [id] NVARCHAR(50) NOT NULL,
    [name] NVARCHAR(120) NOT NULL,
    [module] NVARCHAR(30) NOT NULL,
    [description] NVARCHAR(500),
    [isSystem] BIT NOT NULL CONSTRAINT [PdfTemplate_isSystem_df] DEFAULT 0,
    [isDefault] BIT NOT NULL CONSTRAINT [PdfTemplate_isDefault_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [PdfTemplate_isActive_df] DEFAULT 1,
    [pageSize] NVARCHAR(10) NOT NULL,
    [orientation] NVARCHAR(10) NOT NULL,
    [marginTop] DECIMAL(5,1) NOT NULL CONSTRAINT [PdfTemplate_marginTop_df] DEFAULT 45,
    [marginRight] DECIMAL(5,1) NOT NULL CONSTRAINT [PdfTemplate_marginRight_df] DEFAULT 10,
    [marginBottom] DECIMAL(5,1) NOT NULL CONSTRAINT [PdfTemplate_marginBottom_df] DEFAULT 16,
    [marginLeft] DECIMAL(5,1) NOT NULL CONSTRAINT [PdfTemplate_marginLeft_df] DEFAULT 10,
    [marginHeader] DECIMAL(5,1) NOT NULL CONSTRAINT [PdfTemplate_marginHeader_df] DEFAULT 0,
    [marginFooter] DECIMAL(5,1) NOT NULL CONSTRAINT [PdfTemplate_marginFooter_df] DEFAULT 5,
    [headerHtml] NVARCHAR(max),
    [bodyHtml] NVARCHAR(max) NOT NULL,
    [footerHtml] NVARCHAR(max),
    [css] NVARCHAR(max),
    [fieldVisibilityJson] NVARCHAR(max),
    [brandingJson] NVARCHAR(max),
    [version] INT NOT NULL CONSTRAINT [PdfTemplate_version_df] DEFAULT 1,
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PdfTemplate_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [PdfTemplate_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    CONSTRAINT [PdfTemplate_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PdfAsset] (
    [id] NVARCHAR(50) NOT NULL,
    [key] NVARCHAR(80) NOT NULL,
    [fileName] NVARCHAR(200) NOT NULL,
    [mimeType] NVARCHAR(50) NOT NULL,
    [sizeBytes] INT NOT NULL,
    [data] VARBINARY(max) NOT NULL,
    [createdBy] NVARCHAR(50) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PdfAsset_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PdfAsset_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PdfAsset_key_key] UNIQUE NONCLUSTERED ([key])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PdfTemplate_module_isActive_isDeleted_idx] ON [dbo].[PdfTemplate]([module], [isActive], [isDeleted]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
