-- One name per field shared across modules (the user picked each), and the labels follow the shared name:
--   GST                gstNumber        quotations gstNo → gstNumber                ("GST NO" → "GST Number")
--   bank details       accountNo / ifscCode
--                                       organizations accountNumber → accountNo     ("Account Number" → "Account No")
--                                       organizations bankIfscCode → ifscCode       ("Bank IFSC Code" → "IFSC Code")
--   organization name  organizationName quotations organization → organizationName  ("Organization" → "Organization Name")
--   contact person     contact          tickets contactPersonName → contact         ("Contact Person Name" → "Contact")
--   contact phone      contactNumber    quotations contactMobileNo → contactNumber  ("Contact Mobile No" → "Contact Number")
--   contact email      contactEmail     opportunities emailAddress → contactEmail   ("Email Address" → "Contact Email"),
--                                       quotations contactEmailAddress → contactEmail ("Contact Email Address" → "Contact Email")
--   "Add Description"  addDescription   contacts description → addDescription
-- Builds on 20261120150000_field_names_follow_labels. Labels change only where they still read the old default, so a
-- label an admin already renamed stays.
BEGIN TRY

BEGIN TRAN;

-- ── Columns ──
EXEC sp_rename N'dbo.Contact.description', N'addDescription', N'COLUMN';
EXEC sp_rename N'dbo.Organization.accountNumber', N'accountNo', N'COLUMN';
EXEC sp_rename N'dbo.Organization.bankIfscCode', N'ifscCode', N'COLUMN';
EXEC sp_rename N'dbo.Opportunity.emailAddress', N'contactEmail', N'COLUMN';
EXEC sp_rename N'dbo.Quotation.organization', N'organizationName', N'COLUMN';
EXEC sp_rename N'dbo.Quotation.contactMobileNo', N'contactNumber', N'COLUMN';
EXEC sp_rename N'dbo.Quotation.contactEmailAddress', N'contactEmail', N'COLUMN';
EXEC sp_rename N'dbo.Quotation.gstNo', N'gstNumber', N'COLUMN';
EXEC sp_rename N'dbo.Ticket.contactPersonName', N'contact', N'COLUMN';

-- ── Form field keys (+ labels still at their old default), saved table filters and list scorecards ──
DECLARE @renames TABLE ([module] NVARCHAR(30), [fromKey] NVARCHAR(100), [toKey] NVARCHAR(100), [fromLabel] NVARCHAR(150), [toLabel] NVARCHAR(150));
INSERT INTO @renames VALUES
    (N'contacts', N'description', N'addDescription', NULL, NULL),
    (N'organizations', N'accountNumber', N'accountNo', N'Account Number', N'Account No'),
    (N'organizations', N'bankIfscCode', N'ifscCode', N'Bank IFSC Code', N'IFSC Code'),
    (N'opportunities', N'emailAddress', N'contactEmail', N'Email Address', N'Contact Email'),
    (N'quotations', N'organization', N'organizationName', N'Organization', N'Organization Name'),
    (N'quotations', N'contactMobileNo', N'contactNumber', N'Contact Mobile No', N'Contact Number'),
    (N'quotations', N'contactEmailAddress', N'contactEmail', N'Contact Email Address', N'Contact Email'),
    (N'quotations', N'gstNo', N'gstNumber', N'GST NO', N'GST Number'),
    (N'tickets', N'contactPersonName', N'contact', N'Contact Person Name', N'Contact');

-- A server started on the new code before this migration seeds the new keys as fresh built-in rows: drop those, the
-- existing row (with the admin's settings) takes the name.
DELETE n
FROM [dbo].[FormFieldDefinition] n JOIN @renames r ON r.[module] = n.[module] AND r.[toKey] = n.[fieldKey]
WHERE EXISTS (SELECT 1 FROM [dbo].[FormFieldDefinition] o WHERE o.[module] = r.[module] AND o.[fieldKey] = r.[fromKey]);

UPDATE f
SET [fieldKey] = r.[toKey],
    [label] = CASE WHEN r.[fromLabel] IS NOT NULL AND f.[label] = r.[fromLabel] THEN r.[toLabel] ELSE f.[label] END,
    [updatedAt] = CURRENT_TIMESTAMP
FROM [dbo].[FormFieldDefinition] f JOIN @renames r ON r.[module] = f.[module] AND r.[fromKey] = f.[fieldKey];

UPDATE s SET [fieldKey] = r.[toKey]
FROM [dbo].[ModuleScorecard] s JOIN @renames r ON r.[module] = s.[module] AND r.[fromKey] = s.[fieldKey];

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
