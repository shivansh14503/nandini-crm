-- Organizations: a partner organization (Customer Type = Partner) gives its Nature of Partner, from the Partner Company
-- form's list (partner_nature, now shared by both modules). The organization's Partner Company field is removed from
-- the form (its stored values in partnerCompaniesJson are kept). Start-up seeding adds the Nature of Partner field
-- right after Customer Type.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Organization] ADD [natureOfPartner] NVARCHAR(100) NULL;

UPDATE [dbo].[DropdownCategory]
SET [module] = N'shared',
    [description] = N'Kind of partner (Partner Companies, and Organizations whose Customer Type is Partner).',
    [updatedAt] = SYSUTCDATETIME()
WHERE [key] = N'partner_nature';

DELETE FROM [dbo].[FormFieldDefinition]
WHERE [module] = N'organizations' AND [fieldKey] = N'partnerCompany' AND [isSystem] = 1;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
