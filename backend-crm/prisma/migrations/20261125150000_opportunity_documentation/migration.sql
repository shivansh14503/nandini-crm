-- Opportunities: a Documentation section at the end of the Basic tab. Add Document moves there from "Commission &
-- Documentation" (now "Commission"); when it is Yes the opportunity records the document's Document No, Document
-- Date, Remarks and file (Upload Doc). At Sales Stage PO Add Document must be Yes, with the file. Files are kept in
-- the new RecordFile table, uploaded before the record is saved and linked by id.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Opportunity] ADD
    [documentNo] NVARCHAR(30) NULL,
    [documentDate] DATE NULL,
    [documentRemarks] NVARCHAR(2000) NULL,
    [documentFileId] NVARCHAR(50) NULL;

CREATE TABLE [dbo].[RecordFile] (
    [id] NVARCHAR(50) NOT NULL,
    [module] NVARCHAR(30) NOT NULL,
    [fileName] NVARCHAR(200) NOT NULL,
    [mimeType] NVARCHAR(100) NOT NULL,
    [sizeBytes] INT NOT NULL,
    [data] VARBINARY(max) NOT NULL,
    [createdBy] NVARCHAR(50) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RecordFile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RecordFile_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE NONCLUSTERED INDEX [RecordFile_module_createdAt_idx] ON [dbo].[RecordFile]([module], [createdAt]);

-- Dynamic SQL: the new column doesn't exist yet when this batch is compiled.
EXEC(N'CREATE NONCLUSTERED INDEX [Opportunity_documentFileId_idx] ON [dbo].[Opportunity]([documentFileId]);');
EXEC(N'ALTER TABLE [dbo].[Opportunity] ADD CONSTRAINT [Opportunity_documentFileId_fkey] FOREIGN KEY ([documentFileId]) REFERENCES [dbo].[RecordFile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;');

-- Form builder: the commission fields (built-in and any custom ones added there) keep their section under its new
-- name, and Add Document moves to the new Documentation section after the last field of the Basic tab (start-up
-- seeding adds the document fields after it). Sections an admin renamed or fields moved elsewhere are left as they are.
UPDATE [dbo].[FormFieldDefinition]
SET [sectionKey] = N'commission', [sectionLabel] = N'Commission'
WHERE [module] = N'opportunities' AND [sectionKey] = N'commission_documentation'
    AND [sectionLabel] = N'Commission & Documentation' AND NOT ([isSystem] = 1 AND [fieldKey] = N'addDocument');

UPDATE f
SET [sectionKey] = N'documentation',
    [sectionLabel] = N'Documentation',
    [sortOrder] = (SELECT MAX(o.[sortOrder]) FROM [dbo].[FormFieldDefinition] o WHERE o.[module] = N'opportunities' AND o.[tabKey] = f.[tabKey]) + 5
FROM [dbo].[FormFieldDefinition] f
WHERE f.[module] = N'opportunities' AND f.[isSystem] = 1 AND f.[fieldKey] = N'addDocument' AND f.[sectionKey] = N'commission_documentation';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
