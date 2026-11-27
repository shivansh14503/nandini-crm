-- Line items Summary Breakdown (Jira CRM-111), the same on opportunities and quotations:
--  • Total Taxable Amount (the existing [subtotal]) − Lump Sum Discount = Actual (Before Tax): new [actualBeforeTax].
--  • GST is charged on the Actual (Before Tax) amount, per GST rate: IGST when the customer's state (shipping address,
--    else billing) differs from the company's state, else CGST + SGST at half the rate each. The split a record was
--    saved with is kept in [gstType] (IGST / CGST_SGST; NULL = no company state set then, shown as plain GST).
--  • Round Off (a checkbox, on by default): [roundOff] and the amount it added or took off, [roundOffAmount].
--  • Totals are kept to the paisa (they were whole rupees).
--  • CompanySettings: new single-row table (id = 1) for Admin › Company Details (the company's state). No row = not set.
-- Here [actualBeforeTax] is filled from the stored totals; at start-up the API recomputes every record's totals with the
-- shared line item math once (shared/lineItemTotals.recalculate.ts, marker ModuleSetting system/lineItemSummaryTotals),
-- so the stored values match what the forms, drawers and PDFs compute to the paisa.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Opportunity] ADD
    [actualBeforeTax] DECIMAL(18,2) NOT NULL CONSTRAINT [Opportunity_actualBeforeTax_df] DEFAULT 0,
    [gstType] NVARCHAR(10),
    [roundOff] BIT NOT NULL CONSTRAINT [Opportunity_roundOff_df] DEFAULT 1,
    [roundOffAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [Opportunity_roundOffAmount_df] DEFAULT 0;

ALTER TABLE [dbo].[Quotation] ADD
    [actualBeforeTax] DECIMAL(18,2) NOT NULL CONSTRAINT [Quotation_actualBeforeTax_df] DEFAULT 0,
    [gstType] NVARCHAR(10),
    [roundOff] BIT NOT NULL CONSTRAINT [Quotation_roundOff_df] DEFAULT 1,
    [roundOffAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [Quotation_roundOffAmount_df] DEFAULT 0;

EXEC(N'UPDATE [dbo].[Opportunity]
SET [actualBeforeTax] = CASE WHEN [subtotal] > [lumpSumDiscount] THEN [subtotal] - [lumpSumDiscount] ELSE 0 END;');
EXEC(N'UPDATE [dbo].[Quotation]
SET [actualBeforeTax] = CASE WHEN [subtotal] > [lumpSumDiscount] THEN [subtotal] - [lumpSumDiscount] ELSE 0 END;');

-- CreateTable
CREATE TABLE [dbo].[CompanySettings] (
    [id] INT NOT NULL,
    [companyState] NVARCHAR(80) NOT NULL CONSTRAINT [CompanySettings_companyState_df] DEFAULT '',
    [updatedBy] NVARCHAR(50),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [CompanySettings_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CompanySettings_pkey] PRIMARY KEY CLUSTERED ([id])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
