-- Opportunities: a commission (Commission Yes) records a Commission Type, Self or Other (dropdown
-- `opportunity_commission_type`, seeded at start-up). It defaults to Self for an amount up to 1,000 and Other above.
-- Other also records the payee's bank details: Account Name, Account No, Bank Name, IFSC Code and PAN Number (the
-- same fields as on the Organization form). Existing commissions get the default type for their amount.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Opportunity] ADD
    [commissionType] NVARCHAR(50) NULL,
    [accountName] NVARCHAR(200) NULL,
    [accountNo] NVARCHAR(18) NULL,
    [bankName] NVARCHAR(100) NULL,
    [ifscCode] NVARCHAR(11) NULL,
    [panNumber] NVARCHAR(10) NULL;

-- Dynamic SQL: the new columns don't exist yet when this batch is compiled.
EXEC(N'UPDATE [dbo].[Opportunity]
SET [commissionType] = CASE WHEN [commissionAmount] <= 1000 THEN N''Self'' ELSE N''Other'' END
WHERE [commission] = N''Yes'' AND [commissionAmount] > 0;');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
