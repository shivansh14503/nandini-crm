-- Opportunities: the form's Organization name becomes a plain text input instead of an organization picker.
-- No data changes: Opportunity.organizationName already holds the name, and the API keeps linking organizationId to
-- the organization of that name when one exists. Only the Form Builder's built-in field row changes type
-- (lookup → text), so the builder shows it as a text field.
UPDATE [dbo].[FormFieldDefinition]
SET [fieldType] = N'text', [updatedAt] = CURRENT_TIMESTAMP
WHERE [module] = N'opportunities' AND [isSystem] = 1 AND [fieldKey] = N'organizationName' AND [fieldType] = N'lookup';
