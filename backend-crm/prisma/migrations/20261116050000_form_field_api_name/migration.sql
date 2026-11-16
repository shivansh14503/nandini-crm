BEGIN TRY

BEGIN TRAN;

-- AlterTable: admin-chosen API name of a built-in field (null = its column name). Custom fields keep theirs in fieldKey.
ALTER TABLE [dbo].[FormFieldDefinition] ADD [apiName] NVARCHAR(80);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
