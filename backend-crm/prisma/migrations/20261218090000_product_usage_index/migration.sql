-- Product usage (Products view page, drawer and list): opportunities per product are counted from the line items by
-- (productId, opportunityId). The composite index covers that read (distinct pairs for a set of products) and still
-- serves every lookup by productId alone, so it replaces the single-column index.
BEGIN TRY

BEGIN TRAN;

-- DropIndex
DROP INDEX [OpportunityLineItem_productId_idx] ON [dbo].[OpportunityLineItem];

-- CreateIndex
CREATE NONCLUSTERED INDEX [OpportunityLineItem_productId_opportunityId_idx] ON [dbo].[OpportunityLineItem]([productId], [opportunityId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
