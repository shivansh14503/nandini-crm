-- Referrals: Organization Name (an organization picker linked by organizationId) becomes Company Name, a plain,
-- optional text field. Every referral keeps the name it had: organizationName is copied into the new companyName
-- column before organizationName / organizationId (and their index and foreign key) are dropped. The referral form
-- also loses its three sections ("Referral Details & Association", "Communication Channels", "Internal Assignment &
-- Department Role"): every field of its Overview tab now sits in one "Referral Details" section.
--
-- Form Builder: the built-in organizationName field row becomes the companyName row (same place in the form, plain
-- text, optional, unlocked; the picker's hint / placeholder dropped), so start-up seeding does not add a second one.
-- Saved referral drawer layouts and saved / recent referral table filters that name organizationName now name
-- companyName. Nothing outside the Referral module is changed.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Referral] ADD [companyName] NVARCHAR(200) NULL;

-- Dynamic SQL: the new column doesn't exist yet when this batch is compiled.
EXEC(N'UPDATE [dbo].[Referral] SET [companyName] = NULLIF(LTRIM(RTRIM([organizationName])), N'''');');

ALTER TABLE [dbo].[Referral] DROP CONSTRAINT [Referral_organizationId_fkey];
DROP INDEX [Referral_organizationId_idx] ON [dbo].[Referral];
ALTER TABLE [dbo].[Referral] DROP COLUMN [organizationName], [organizationId];

-- Form Builder: Organization Name → Company Name (plain text, optional).
UPDATE [dbo].[FormFieldDefinition]
SET [fieldKey] = N'companyName',
    [label] = N'Company Name',
    [fieldType] = N'text',
    [isRequired] = 0,
    [isCoreLocked] = 0,
    [isActive] = 1,
    [isVisibleInForm] = 1,
    [placeholder] = NULL,
    [hint] = NULL,
    [defaultValue] = NULL,
    [validationRulesJson] = NULL,
    [dropdownCategoryId] = NULL,
    [updatedAt] = CURRENT_TIMESTAMP
WHERE [module] = N'referrals' AND [isSystem] = 1 AND [fieldKey] = N'organizationName'
    AND NOT EXISTS (SELECT 1 FROM [dbo].[FormFieldDefinition] c WHERE c.[module] = N'referrals' AND c.[fieldKey] = N'companyName');

-- One section: every field of the referral form's Overview tab (built-in and custom), keeping its order.
UPDATE [dbo].[FormFieldDefinition]
SET [sectionKey] = N'referral_details', [sectionLabel] = N'Referral Details', [updatedAt] = CURRENT_TIMESTAMP
WHERE [module] = N'referrals' AND [tabKey] = N'overview';

-- Saved drawer layout (header subtitle and the Overview block) and saved / recent table filters.
UPDATE [dbo].[DrawerLayout]
SET [layoutJson] = REPLACE(REPLACE([layoutJson], N'"organizationName"', N'"companyName"'), N'"label":"Organisation"', N'"label":"Company Name"'),
    [updatedAt] = CURRENT_TIMESTAMP
WHERE [module] = N'referrals' AND [layoutJson] LIKE N'%"organizationName"%';

UPDATE [dbo].[TableFilter]
SET [criteriaJson] = REPLACE([criteriaJson], N'"organizationName"', N'"companyName"')
WHERE [module] = N'referrals' AND [criteriaJson] LIKE N'%"organizationName"%';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
