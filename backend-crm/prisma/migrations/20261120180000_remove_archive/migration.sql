-- Archiving is removed from the form builder: admins now only delete (or hide) fields and options.
-- Everything that was archived comes back as active, so nothing an admin archived is lost.
-- Deleted built-in fields stay inactive: they are tombstones (validationRulesJson {"_deleted":true}), not archives.
BEGIN TRY

BEGIN TRAN;

UPDATE [dbo].[DropdownOption]
SET [isActive] = 1, [updatedAt] = CURRENT_TIMESTAMP
WHERE [isActive] = 0;

UPDATE [dbo].[FormFieldDefinition]
SET [isActive] = 1, [updatedAt] = CURRENT_TIMESTAMP
WHERE [isActive] = 0
  AND ([validationRulesJson] IS NULL OR [validationRulesJson] NOT LIKE N'%"[_]deleted":true%');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
