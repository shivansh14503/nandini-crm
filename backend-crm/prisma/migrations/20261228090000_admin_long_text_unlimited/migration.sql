-- Admin long text has no character limit either: the role description (Admin › Roles) and the PDF template
-- description become NVARCHAR(MAX). Widening keeps every stored value; neither column is indexed or has a default.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Roles] ALTER COLUMN [description] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[PdfTemplate] ALTER COLUMN [description] NVARCHAR(MAX) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
