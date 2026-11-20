-- Backend field names now follow the labels users see (the user picked each rename):
--   leads          addDescription → followUpRemarks, gstNo → gstNumber, emailAddresses → emailAddress
--   contacts       emailAddresses → emailAddress
--   organizations  sourceOfLead → leadSource, memberOfParentCorp → memberOf, description → addDescriptionAndScope,
--                  assignedUser → assignedTo, gstNo → gstNumber
--   opportunities  addDescription → followUpRemarks, contactName → contact
--   quotations     opportunityName → opportunity, organizationName → organization, contactName → contact,
--                  contactMobile → contactMobileNo, contactEmail → contactEmailAddress
--   partner cos.   companyName → partnerName, phone → officePhone, bankBranch → branch, bankIfscCode → ifscCode,
--                  accountNumber → accountNo, gstNo → gstNumber, emailAddresses → emailAddress (column emailAddressesJson
--                  → emailAddressJson)
-- (`emailAddress` on leads / contacts is the e-mail list relation, which has no column.)
-- Columns and their indexes are renamed in place (data kept); form field keys, saved table filters and list scorecards
-- follow. PDF template paths (`quotation.contactMobile`, …) are the PDF context's own names and are unchanged.
BEGIN TRY

BEGIN TRAN;

-- ── Columns ──
EXEC sp_rename N'dbo.Lead.addDescription', N'followUpRemarks', N'COLUMN';
EXEC sp_rename N'dbo.Lead.gstNo', N'gstNumber', N'COLUMN';

EXEC sp_rename N'dbo.Organization.sourceOfLead', N'leadSource', N'COLUMN';
EXEC sp_rename N'dbo.Organization.memberOfParentCorp', N'memberOf', N'COLUMN';
EXEC sp_rename N'dbo.Organization.description', N'addDescriptionAndScope', N'COLUMN';
EXEC sp_rename N'dbo.Organization.assignedUser', N'assignedTo', N'COLUMN';
EXEC sp_rename N'dbo.Organization.gstNo', N'gstNumber', N'COLUMN';

EXEC sp_rename N'dbo.Opportunity.addDescription', N'followUpRemarks', N'COLUMN';
EXEC sp_rename N'dbo.Opportunity.contactName', N'contact', N'COLUMN';

EXEC sp_rename N'dbo.Quotation.opportunityName', N'opportunity', N'COLUMN';
EXEC sp_rename N'dbo.Quotation.organizationName', N'organization', N'COLUMN';
EXEC sp_rename N'dbo.Quotation.contactName', N'contact', N'COLUMN';
EXEC sp_rename N'dbo.Quotation.contactMobile', N'contactMobileNo', N'COLUMN';
EXEC sp_rename N'dbo.Quotation.contactEmail', N'contactEmailAddress', N'COLUMN';

EXEC sp_rename N'dbo.PartnerCompany.companyName', N'partnerName', N'COLUMN';
EXEC sp_rename N'dbo.PartnerCompany.phone', N'officePhone', N'COLUMN';
EXEC sp_rename N'dbo.PartnerCompany.bankBranch', N'branch', N'COLUMN';
EXEC sp_rename N'dbo.PartnerCompany.bankIfscCode', N'ifscCode', N'COLUMN';
EXEC sp_rename N'dbo.PartnerCompany.accountNumber', N'accountNo', N'COLUMN';
EXEC sp_rename N'dbo.PartnerCompany.gstNo', N'gstNumber', N'COLUMN';
EXEC sp_rename N'dbo.PartnerCompany.emailAddressesJson', N'emailAddressJson', N'COLUMN';

-- ── Indexes named after a renamed column ──
EXEC sp_rename N'dbo.Organization.Organization_assignedUser_idx', N'Organization_assignedTo_idx', N'INDEX';
EXEC sp_rename N'dbo.Organization.Organization_gstNo_idx', N'Organization_gstNumber_idx', N'INDEX';
EXEC sp_rename N'dbo.Organization.Organization_isDeleted_accountStatus_assignedUser_idx', N'Organization_isDeleted_accountStatus_assignedTo_idx', N'INDEX';
EXEC sp_rename N'dbo.PartnerCompany.PartnerCompany_companyName_key', N'PartnerCompany_partnerName_key', N'INDEX';

-- ── Form field keys, saved table filters and list scorecards ──
DECLARE @renames TABLE ([module] NVARCHAR(30), [fromKey] NVARCHAR(100), [toKey] NVARCHAR(100));
INSERT INTO @renames VALUES
    (N'leads', N'addDescription', N'followUpRemarks'),
    (N'leads', N'gstNo', N'gstNumber'),
    (N'leads', N'emailAddresses', N'emailAddress'),
    (N'contacts', N'emailAddresses', N'emailAddress'),
    (N'organizations', N'sourceOfLead', N'leadSource'),
    (N'organizations', N'memberOfParentCorp', N'memberOf'),
    (N'organizations', N'description', N'addDescriptionAndScope'),
    (N'organizations', N'assignedUser', N'assignedTo'),
    (N'organizations', N'gstNo', N'gstNumber'),
    (N'opportunities', N'addDescription', N'followUpRemarks'),
    (N'opportunities', N'contactName', N'contact'),
    (N'quotations', N'opportunityName', N'opportunity'),
    (N'quotations', N'organizationName', N'organization'),
    (N'quotations', N'contactName', N'contact'),
    (N'quotations', N'contactMobile', N'contactMobileNo'),
    (N'quotations', N'contactEmail', N'contactEmailAddress'),
    (N'partner-companies', N'companyName', N'partnerName'),
    (N'partner-companies', N'phone', N'officePhone'),
    (N'partner-companies', N'bankBranch', N'branch'),
    (N'partner-companies', N'bankIfscCode', N'ifscCode'),
    (N'partner-companies', N'accountNumber', N'accountNo'),
    (N'partner-companies', N'gstNo', N'gstNumber'),
    (N'partner-companies', N'emailAddresses', N'emailAddress');

-- A server started on the new code before this migration seeds the new keys as fresh built-in rows: drop those, the
-- existing row (with the admin's settings) takes the name.
DELETE n
FROM [dbo].[FormFieldDefinition] n JOIN @renames r ON r.[module] = n.[module] AND r.[toKey] = n.[fieldKey]
WHERE EXISTS (SELECT 1 FROM [dbo].[FormFieldDefinition] o WHERE o.[module] = r.[module] AND o.[fieldKey] = r.[fromKey]);

UPDATE f SET [fieldKey] = r.[toKey], [updatedAt] = CURRENT_TIMESTAMP
FROM [dbo].[FormFieldDefinition] f JOIN @renames r ON r.[module] = f.[module] AND r.[fromKey] = f.[fieldKey];

UPDATE s SET [fieldKey] = r.[toKey]
FROM [dbo].[ModuleScorecard] s JOIN @renames r ON r.[module] = s.[module] AND r.[fromKey] = s.[fieldKey];

-- Filter criteria are keyed by field name ("<key>": …); one pass per rename.
DECLARE @module NVARCHAR(30), @fromKey NVARCHAR(100), @toKey NVARCHAR(100);
DECLARE renames_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT [module], [fromKey], [toKey] FROM @renames;
OPEN renames_cursor;
FETCH NEXT FROM renames_cursor INTO @module, @fromKey, @toKey;
WHILE @@FETCH_STATUS = 0
BEGIN
    UPDATE [dbo].[TableFilter]
    SET [criteriaJson] = REPLACE([criteriaJson], N'"' + @fromKey + N'"', N'"' + @toKey + N'"')
    WHERE [module] = @module AND [criteriaJson] LIKE N'%"' + @fromKey + N'"%';
    FETCH NEXT FROM renames_cursor INTO @module, @fromKey, @toKey;
END;
CLOSE renames_cursor;
DEALLOCATE renames_cursor;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
