-- Leads and opportunities with Lead Source Partner name their Partner Company (an organization whose Customer Type is
-- Partner, picked from the organization picker) instead of a Nature of Partner, as the Organization form's Partner
-- Company field used to work. The Nature of Partner columns and fields added by 20261125180000_lead_source_details
-- go; start-up seeding adds the Partner Company field after Referred By.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Lead] DROP COLUMN [natureOfPartner];
ALTER TABLE [dbo].[Lead] ADD [partnerCompany] NVARCHAR(200) NULL;
ALTER TABLE [dbo].[Opportunity] DROP COLUMN [natureOfPartner];
ALTER TABLE [dbo].[Opportunity] ADD [partnerCompany] NVARCHAR(200) NULL;

DELETE FROM [dbo].[FormFieldDefinition]
WHERE [module] IN (N'leads', N'opportunities') AND [fieldKey] = N'natureOfPartner' AND [isSystem] = 1;

UPDATE [dbo].[DropdownCategory]
SET [description] = N'Kind of partner (Partner Companies, and Organizations whose Customer Type is Partner).',
    [updatedAt] = SYSUTCDATETIME()
WHERE [key] = N'partner_nature';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
