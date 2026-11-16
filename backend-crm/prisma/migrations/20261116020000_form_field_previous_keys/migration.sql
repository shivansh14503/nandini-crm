BEGIN TRY

BEGIN TRAN;

-- AlterTable: API names a custom field had before an admin renamed it (aliases accepted on writes).
ALTER TABLE [dbo].[FormFieldDefinition] ADD [previousFieldKeysJson] NVARCHAR(2000);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
