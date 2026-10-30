BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Opportunity] DROP CONSTRAINT [Opportunity_currency_df];

-- AlterTable
ALTER TABLE [dbo].[Quotation] DROP CONSTRAINT [Quotation_currency_df];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
