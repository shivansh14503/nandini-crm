-- Seeded cities get the key the seed computes (`country|subdivision|searchName`), so the seed recognises them and
-- only adds cities it hasn't loaded before.
BEGIN TRY

BEGIN TRAN;

UPDATE [dbo].[City] SET [seedKey] = [countryIso2] + N'|' + ISNULL([subdivisionCode], N'') + N'|' + [searchName] WHERE [seedKey] IS NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
