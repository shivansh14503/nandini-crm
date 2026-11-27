-- Line item Discount as a Percentage or an Amount (Jira CRM-111 follow-up), the same on opportunities and quotations:
--  • [discountType] `percentage` (of the Gross Amount, 0–100) or `amount` (off the line, at most the Gross Amount).
--  • Every saved line keeps its percentage: the column defaults to `percentage`.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[OpportunityLineItem] ADD [discountType] NVARCHAR(20) NOT NULL CONSTRAINT [OpportunityLineItem_discountType_df] DEFAULT 'percentage';

ALTER TABLE [dbo].[QuotationLineItem] ADD [discountType] NVARCHAR(20) NOT NULL CONSTRAINT [QuotationLineItem_discountType_df] DEFAULT 'percentage';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
