-- Opportunities: the Documentation section no longer has Remarks (Add Document Yes asks for Document No, Document
-- Date and Upload Doc only). The Documents module, the opportunity API and the Form Builder drop it too, so the
-- [documentRemarks] column of [Document] goes and the built-in Form Builder field row is removed (start-up seeding
-- no longer recreates it). No other column or row is changed.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Document] DROP COLUMN [documentRemarks];

DELETE FROM [dbo].[FormFieldDefinition]
WHERE [module] = N'opportunities' AND [fieldKey] = N'documentRemarks' AND [isSystem] = 1;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
