-- Leads: Hot / Warm / Cold is the lead's Rating, its own column set by the system (not a form field). Lead Type is a
-- different thing (admin dropdown `lead_type`: Inbound / Outbound / …). Hot / Warm / Cold values still stored in
-- leadType move to rating.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Lead] ADD [rating] NVARCHAR(10) NULL;

-- Dynamic SQL: the new column doesn't exist yet when this batch is compiled.
EXEC(N'UPDATE [dbo].[Lead] SET [rating] = [leadType], [leadType] = NULL WHERE [leadType] IN (N''Hot'', N''Warm'', N''Cold'');');
EXEC(N'CREATE NONCLUSTERED INDEX [Lead_rating_idx] ON [dbo].[Lead]([rating]);');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
