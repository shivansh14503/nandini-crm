-- Opportunities: Contact Number is optional (the form, the API and imports no longer require it). Start-up seeding
-- unlocks the built-in field in the form builder and turns its Required off once (admins may require it again).
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Opportunity] ALTER COLUMN [contactNumber] NVARCHAR(20) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
