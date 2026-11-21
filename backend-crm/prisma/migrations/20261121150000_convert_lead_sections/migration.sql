-- Convert Lead sections: a field's own section on Convert Lead (sections themselves live in the ModuleSetting
-- `convertSections` of contacts / organizations / opportunities). NULL means the field's section on its record's form.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[FormFieldDefinition] ADD [convertSectionKey] NVARCHAR(80) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
