-- Documents module (Activities › Documents): an opportunity's Documentation section (Add Document Yes: Document No,
-- Document Date, Remarks, Upload Doc) moves from columns on Opportunity to its own Document table, one row per
-- opportunity. The opportunity API keeps the same fields; the Documents list reads this table. Existing documents
-- are copied over (dated and credited by their uploaded file where there is one), then the old columns are dropped.
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Document] (
    [id] NVARCHAR(50) NOT NULL,
    [opportunityId] NVARCHAR(50) NOT NULL,
    [documentNo] NVARCHAR(30),
    [documentDate] DATE,
    [documentRemarks] NVARCHAR(2000),
    [documentFileId] NVARCHAR(50),
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Document_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Document_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Document_opportunityId_key] UNIQUE NONCLUSTERED ([opportunityId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Document_documentFileId_idx] ON [dbo].[Document]([documentFileId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Document_createdAt_idx] ON [dbo].[Document]([createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[Document] ADD CONSTRAINT [Document_opportunityId_fkey] FOREIGN KEY ([opportunityId]) REFERENCES [dbo].[Opportunity]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Document] ADD CONSTRAINT [Document_documentFileId_fkey] FOREIGN KEY ([documentFileId]) REFERENCES [dbo].[RecordFile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Copy each opportunity's document (deleted opportunities too, so restoring one brings its document back).
-- Dynamic SQL: the new table doesn't exist yet when this batch is compiled.
EXEC(N'INSERT INTO [dbo].[Document] ([id], [opportunityId], [documentNo], [documentDate], [documentRemarks], [documentFileId], [createdBy], [updatedBy], [createdAt], [updatedAt])
SELECT LOWER(CONVERT(NVARCHAR(50), NEWID())), o.[id], o.[documentNo], o.[documentDate], o.[documentRemarks], o.[documentFileId],
    COALESCE(f.[createdBy], o.[updatedBy], o.[createdBy]), NULL,
    COALESCE(f.[createdAt], o.[updatedAt]), COALESCE(f.[createdAt], o.[updatedAt])
FROM [dbo].[Opportunity] o
LEFT JOIN [dbo].[RecordFile] f ON f.[id] = o.[documentFileId]
WHERE o.[addDocument] = N''Yes''
    AND (o.[documentFileId] IS NOT NULL OR o.[documentNo] IS NOT NULL OR o.[documentDate] IS NOT NULL OR o.[documentRemarks] IS NOT NULL);');

-- DropForeignKey
ALTER TABLE [dbo].[Opportunity] DROP CONSTRAINT [Opportunity_documentFileId_fkey];

-- DropIndex
DROP INDEX [Opportunity_documentFileId_idx] ON [dbo].[Opportunity];

-- AlterTable
ALTER TABLE [dbo].[Opportunity] DROP COLUMN [documentDate],
[documentFileId],
[documentNo],
[documentRemarks];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
