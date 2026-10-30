-- Prisma emits string defaults without the N prefix, so the init migration stored the ₹ in these
-- defaults as '?'. Recreate them as Unicode literals. (The API always sets currency explicitly.)
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Opportunity] DROP CONSTRAINT [Opportunity_currency_df];
ALTER TABLE [dbo].[Opportunity] ADD CONSTRAINT [Opportunity_currency_df] DEFAULT N'Indian Rupee: ₹' FOR [currency];

ALTER TABLE [dbo].[Quotation] DROP CONSTRAINT [Quotation_currency_df];
ALTER TABLE [dbo].[Quotation] ADD CONSTRAINT [Quotation_currency_df] DEFAULT N'Indian Rupee: ₹' FOR [currency];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
