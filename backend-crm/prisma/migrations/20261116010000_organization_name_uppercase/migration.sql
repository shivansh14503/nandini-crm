-- Organization names are stored uppercase (validators uppercase every organizationName on write).
-- Backfill existing rows, including the copies denormalized onto related records. Case-only change, so the
-- case-insensitive live-name unique index (Organization_organizationName_live_key) is unaffected.
BEGIN TRY

BEGIN TRAN;

UPDATE [dbo].[Organization] SET [organizationName] = UPPER([organizationName]) WHERE [organizationName] <> UPPER([organizationName]) COLLATE Latin1_General_CS_AS;
UPDATE [dbo].[Contact]      SET [organizationName] = UPPER([organizationName]) WHERE [organizationName] <> UPPER([organizationName]) COLLATE Latin1_General_CS_AS;
UPDATE [dbo].[Lead]         SET [organizationName] = UPPER([organizationName]) WHERE [organizationName] <> UPPER([organizationName]) COLLATE Latin1_General_CS_AS;
UPDATE [dbo].[Opportunity]  SET [organizationName] = UPPER([organizationName]) WHERE [organizationName] <> UPPER([organizationName]) COLLATE Latin1_General_CS_AS;
UPDATE [dbo].[Quotation]    SET [organizationName] = UPPER([organizationName]) WHERE [organizationName] <> UPPER([organizationName]) COLLATE Latin1_General_CS_AS;
UPDATE [dbo].[Ticket]       SET [organizationName] = UPPER([organizationName]) WHERE [organizationName] <> UPPER([organizationName]) COLLATE Latin1_General_CS_AS;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
