BEGIN TRY

BEGIN TRAN;

-- HTML (Handlebars) templates are replaced by block documents. Custom templates can't be converted, so they are
-- retired; system templates get their new document from the boot-time seed (pdfTemplate.seed.ts), which also
-- assigns a default when none is left.
UPDATE [dbo].[PdfTemplate]
SET [isDeleted] = 1, [deletedAt] = CURRENT_TIMESTAMP, [isActive] = 0, [isDefault] = 0, [version] = [version] + 1
WHERE [isSystem] = 0 AND [isDeleted] = 0;

-- DropColumns
ALTER TABLE [dbo].[PdfTemplate] DROP CONSTRAINT [PdfTemplate_marginTop_df], [PdfTemplate_marginRight_df], [PdfTemplate_marginBottom_df],
    [PdfTemplate_marginLeft_df], [PdfTemplate_marginHeader_df], [PdfTemplate_marginFooter_df];
ALTER TABLE [dbo].[PdfTemplate] DROP COLUMN [marginTop], [marginRight], [marginBottom], [marginLeft], [marginHeader], [marginFooter],
    [headerHtml], [bodyHtml], [footerHtml], [css], [fieldVisibilityJson], [brandingJson];

-- AddColumn ('{}' only fills existing rows; the seed writes the real documents)
ALTER TABLE [dbo].[PdfTemplate] ADD [documentJson] NVARCHAR(max) NOT NULL CONSTRAINT [PdfTemplate_documentJson_df] DEFAULT '{}';
ALTER TABLE [dbo].[PdfTemplate] DROP CONSTRAINT [PdfTemplate_documentJson_df];

-- CreateTable
CREATE TABLE [dbo].[PdfSavedItem] (
    [id] NVARCHAR(50) NOT NULL,
    [module] NVARCHAR(30) NOT NULL,
    [name] NVARCHAR(120) NOT NULL,
    [kind] NVARCHAR(10) NOT NULL,
    [contentJson] NVARCHAR(max) NOT NULL,
    [createdBy] NVARCHAR(50) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PdfSavedItem_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [isDeleted] BIT NOT NULL CONSTRAINT [PdfSavedItem_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    CONSTRAINT [PdfSavedItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PdfSavedItem_module_isDeleted_idx] ON [dbo].[PdfSavedItem]([module], [isDeleted]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
