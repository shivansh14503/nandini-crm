-- Line items (Jira CRM-111), the same on opportunities and quotations:
--  • Amount becomes Rate: the [amount] column is renamed [rate] (same values).
--  • A Price (per unit) discount becomes the percentage of the Rate it was: every discount is now a percentage.
--  • GST uses the Product Catalog's Tax Rate options: `GST 18%` → `18%`, `--None--` / blank → `0%` (no tax, as before).
--  • New stored amounts: Gross Amount (Quantity × Rate), Discount amount and Taxable Amount (Gross − Discount),
--    filled for every existing line.
--  • Sale Price, Tax Amount, Total and the discount type go.
--  • Group Name is removed from opportunities and quotations, and Currency from opportunities (it is set per quotation).
-- The record totals keep their columns and meaning (Gross Amount, Discount, Taxable Amount = subtotal, GST, Grand Total).
BEGIN TRY

BEGIN TRAN;

-- ── Opportunity line items ───────────────────────────────────────────────────
EXEC sp_rename N'dbo.OpportunityLineItem.amount', N'rate', N'COLUMN';
ALTER TABLE [dbo].[OpportunityLineItem] ADD
    [grossAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [OpportunityLineItem_grossAmount_df] DEFAULT 0,
    [discountAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [OpportunityLineItem_discountAmount_df] DEFAULT 0,
    [taxableAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [OpportunityLineItem_taxableAmount_df] DEFAULT 0;

EXEC(N'UPDATE [dbo].[OpportunityLineItem]
SET [discount] = CASE WHEN [rate] > 0 THEN CASE WHEN [discount] * 100 / [rate] > 100 THEN 100 ELSE ROUND([discount] * 100 / [rate], 2) END ELSE 0 END
WHERE [discountType] = N''direct'';');
EXEC(N'UPDATE [dbo].[OpportunityLineItem]
SET [taxRate] = CASE
    WHEN LTRIM(RTRIM([taxRate])) IN (N'''', N''--None--'') THEN N''0%''
    WHEN [taxRate] LIKE N''GST %'' THEN LTRIM(SUBSTRING([taxRate], 5, 20))
    ELSE [taxRate] END;');
EXEC(N'UPDATE [dbo].[OpportunityLineItem]
SET [grossAmount] = ROUND([quantity] * [rate], 2),
    [discountAmount] = ROUND(ROUND([quantity] * [rate], 2) * [discount] / 100, 2),
    [taxableAmount] = ROUND([quantity] * [rate], 2) - ROUND(ROUND([quantity] * [rate], 2) * [discount] / 100, 2);');

ALTER TABLE [dbo].[OpportunityLineItem] DROP CONSTRAINT [OpportunityLineItem_discountType_df], [OpportunityLineItem_salePrice_df], [OpportunityLineItem_taxAmount_df], [OpportunityLineItem_total_df];
ALTER TABLE [dbo].[OpportunityLineItem] DROP COLUMN [discountType], [salePrice], [taxAmount], [total];

-- ── Quotation line items ─────────────────────────────────────────────────────
EXEC sp_rename N'dbo.QuotationLineItem.amount', N'rate', N'COLUMN';
ALTER TABLE [dbo].[QuotationLineItem] ADD
    [grossAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [QuotationLineItem_grossAmount_df] DEFAULT 0,
    [discountAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [QuotationLineItem_discountAmount_df] DEFAULT 0,
    [taxableAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [QuotationLineItem_taxableAmount_df] DEFAULT 0;

EXEC(N'UPDATE [dbo].[QuotationLineItem]
SET [discount] = CASE WHEN [rate] > 0 THEN CASE WHEN [discount] * 100 / [rate] > 100 THEN 100 ELSE ROUND([discount] * 100 / [rate], 2) END ELSE 0 END
WHERE [discountType] = N''direct'';');
EXEC(N'UPDATE [dbo].[QuotationLineItem]
SET [taxRate] = CASE
    WHEN LTRIM(RTRIM([taxRate])) IN (N'''', N''--None--'') THEN N''0%''
    WHEN [taxRate] LIKE N''GST %'' THEN LTRIM(SUBSTRING([taxRate], 5, 20))
    ELSE [taxRate] END;');
EXEC(N'UPDATE [dbo].[QuotationLineItem]
SET [grossAmount] = ROUND([quantity] * [rate], 2),
    [discountAmount] = ROUND(ROUND([quantity] * [rate], 2) * [discount] / 100, 2),
    [taxableAmount] = ROUND([quantity] * [rate], 2) - ROUND(ROUND([quantity] * [rate], 2) * [discount] / 100, 2);');

ALTER TABLE [dbo].[QuotationLineItem] DROP CONSTRAINT [QuotationLineItem_discountType_df], [QuotationLineItem_salePrice_df], [QuotationLineItem_taxAmount_df], [QuotationLineItem_total_df];
ALTER TABLE [dbo].[QuotationLineItem] DROP COLUMN [discountType], [salePrice], [taxAmount], [total];

-- ── Group Name and the opportunity Currency ───────────────────────────────────
ALTER TABLE [dbo].[Opportunity] DROP COLUMN [currency], [groupName];
ALTER TABLE [dbo].[Quotation] DROP COLUMN [groupName];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
