-- Dropdown options an admin marks as "Default" are pre-selected on new records (Form Builder › Dropdowns).
-- Existing dropdowns get the values the hand-built forms used to hard-code (formConfig.defaults.ts
-- DEFAULT_SELECTED_OPTIONS), so nothing changes until an admin picks another default or clears it.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[DropdownOption] ADD [isDefault] BIT NOT NULL CONSTRAINT [DropdownOption_isDefault_df] DEFAULT 0;

-- Data: the column is new in this batch, so the update is compiled separately.
EXEC sp_executesql N'
UPDATE o SET o.[isDefault] = 1
FROM [dbo].[DropdownOption] o
INNER JOIN [dbo].[DropdownCategory] c ON c.[id] = o.[categoryId]
INNER JOIN (VALUES
    (N''shared_lead_source'', N''Website Enquiry''),
    (N''shared_product_category'', N''Biz Analyst''),
    (N''shared_followup_type'', N''Call''),
    (N''lead_status'', N''New''),
    (N''lead_type'', N''Hot''),
    (N''lead_department'', N''Executive Management''),
    (N''contact_communication_type'', N''Call''),
    (N''contact_communication_type'', N''Email''),
    (N''org_account_status'', N''Active''),
    (N''org_registration_type'', N''Registered''),
    (N''opportunity_type'', N''New Business''),
    (N''opportunity_sales_stage'', N''Qualification''),
    (N''opportunity_commission'', N''Standard (10%)''),
    (N''quote_stage'', N''Draft''),
    (N''quote_company'', N''Nandini Infosystems''),
    (N''quote_validation_period'', N''30 Days''),
    (N''quote_terms_template'', N''Standard Terms & Conditions''),
    (N''quote_payment_terms'', N''50% Advance & 50% on Delivery''),
    (N''product_tax_type'', N''GST''),
    (N''ticket_priority'', N''Normal''),
    (N''ticket_status'', N''New''),
    (N''ticket_source'', N''Call''),
    (N''ticket_support_type'', N''Free''),
    (N''ticket_support_mode'', N''Offsite Support'')
) AS d([categoryKey], [value]) ON d.[categoryKey] = c.[key] AND d.[value] = o.[value]
WHERE o.[isActive] = 1;
';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
