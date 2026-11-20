-- Convert Lead: an admin picks which contact / organization / opportunity fields the form shows, independently of
-- each module's own form. The fields Convert Lead already had inputs for start on it, as they showed until now
-- (i.e. when visible on their own form; core-locked ones always).
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[FormFieldDefinition] ADD [isVisibleInConvert] BIT NOT NULL
    CONSTRAINT [FormFieldDefinition_isVisibleInConvert_df] DEFAULT 0;

EXEC(N'
UPDATE [dbo].[FormFieldDefinition]
SET [isVisibleInConvert] = 1
WHERE [isSystem] = 1 AND [isActive] = 1 AND ([isVisibleInForm] = 1 OR [isCoreLocked] = 1)
  AND (
       ([module] = N''contacts'' AND [fieldKey] IN (N''name'', N''mobile'', N''phone3'', N''organizationName'', N''emailAddress'', N''isPrimaryContact'',
            N''designation'', N''department'', N''communicationType'', N''doNotCall'', N''addDescription'', N''assignedTo''))
    OR ([module] = N''organizations'' AND [fieldKey] IN (N''organizationName'', N''mailingName'', N''natureOfBusiness'', N''typeOfEntity'',
            N''customerType'', N''leadSource'', N''memberOf'', N''addDescriptionAndScope'', N''assignedTo''))
    OR ([module] = N''opportunities'' AND [fieldKey] IN (N''productCategory'', N''organizationName'', N''referredBy'', N''type'', N''leadSource'',
            N''nextFollowupDate'', N''followupType'', N''remarks'', N''assignedTo''))
  );
');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
