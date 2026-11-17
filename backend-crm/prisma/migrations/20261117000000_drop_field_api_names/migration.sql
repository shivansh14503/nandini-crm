-- Admins no longer name fields' APIs: a built-in field is known by its column, a custom field by the key derived
-- from its label (cf_<label>). The admin-chosen API names of built-in fields and the old-name aliases go.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[FormFieldDefinition] DROP COLUMN [apiName], [previousFieldKeysJson];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
