-- Lead address sections are named like every other address tab: Billing Address (left) / Shipping Address (right),
-- replacing Primary Address / Other Address. Data only; custom fields placed in those sections move with them.
BEGIN TRY

BEGIN TRAN;

UPDATE [dbo].[FormFieldDefinition]
SET [sectionKey] = N'billing_address', [sectionLabel] = N'BILLING ADDRESS'
WHERE [module] = N'leads' AND [sectionKey] = N'primary_address';

UPDATE [dbo].[FormFieldDefinition]
SET [sectionKey] = N'shipping_address', [sectionLabel] = N'SHIPPING ADDRESS'
WHERE [module] = N'leads' AND [sectionKey] = N'other_address';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
