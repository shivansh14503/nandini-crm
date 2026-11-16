-- Trade names are stored uppercase, like organization names (validators uppercase tradeName on write).
-- Backfill existing leads and organizations.
BEGIN TRY

BEGIN TRAN;

UPDATE [dbo].[Organization] SET [tradeName] = UPPER([tradeName]) WHERE [tradeName] <> UPPER([tradeName]) COLLATE Latin1_General_CS_AS;
UPDATE [dbo].[Lead]         SET [tradeName] = UPPER([tradeName]) WHERE [tradeName] <> UPPER([tradeName]) COLLATE Latin1_General_CS_AS;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
