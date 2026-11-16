BEGIN TRY

BEGIN TRAN;

-- AlterTable: upstream population estimate, so bigger cities are suggested first (null when unknown).
ALTER TABLE [dbo].[City] ADD [population] INT;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
