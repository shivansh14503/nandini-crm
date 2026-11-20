-- Follow-up: "Customer Response" (what the customer said on the last follow-up) is picked on every lead and opportunity
-- edit from the admin-managed `shared_customer_response` dropdown (its category and field definitions are seeded at start-up).
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Lead] ADD [customerResponse] NVARCHAR(100);
ALTER TABLE [dbo].[Opportunity] ADD [customerResponse] NVARCHAR(100);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
