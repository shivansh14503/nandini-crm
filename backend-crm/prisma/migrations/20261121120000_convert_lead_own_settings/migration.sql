-- Convert Lead: its own required / width / order per field, set in Form Builder › Convert Lead without changing the
-- record's form. NULL means the record's form setting applies (so changes made there still reach Convert Lead).
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[FormFieldDefinition] ADD [convertIsRequired] BIT NULL,
    [convertFieldSize] NVARCHAR(10) NULL,
    [convertSortOrder] INT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
