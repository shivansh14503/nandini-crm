-- Leads' Customer Response options become the new list, with their starting Rating rules (docs/lead-rating-rules.md
-- 2.3). 20261125190000 only covered a leads field still on the shared list; databases whose leads field already had a
-- list of its own (`lead_customer_response`, or another leads-only list) kept their old options, because start-up
-- seeding only fills a brand-new list.
--
-- The lists changed: `lead_customer_response`, plus the list the leads field is linked to, unless a field of another
-- module uses it too (the opportunities' list is never touched). On each: options not in the new list are removed
-- (records keep the text they stored), missing ones are added, and all of them take the new order and Rating rule
-- (other meta keys are kept). A database where neither list exists yet gets it from start-up seeding.
BEGIN TRY

BEGIN TRAN;

DECLARE @options TABLE ([value] NVARCHAR(200) NOT NULL, [sortOrder] INT NOT NULL, [ruleJson] NVARCHAR(200) NOT NULL);
INSERT INTO @options ([value], [sortOrder], [ruleJson]) VALUES
    (N'Interested',            10,  N'{"rule":"followUpGap","hot":7,"warm":30}'),
    (N'Need More Information', 20,  N'{"rule":"followUpGap","hot":3,"warm":15}'),
    (N'Requested Quotation',   30,  N'{"rule":"daysSinceResponse","hot":10,"warm":30}'),
    (N'Requested Demo',        40,  N'{"rule":"followUpGap","hot":7,"warm":21}'),
    (N'Under Discussion',      50,  N'{"rule":"daysSinceResponse","hot":7,"warm":21}'),
    (N'Call Back Later',       60,  N'{"rule":"followUpGap","hot":3,"warm":30}'),
    (N'Not Interested',        70,  N'{"rule":"always","rating":"Cold"}'),
    (N'Price Issue',           80,  N'{"rule":"followUpGap","hot":null,"warm":15}'),
    (N'Using Other Software',  90,  N'{"rule":"always","rating":"Cold"}'),
    (N'No Requirement',        100, N'{"rule":"always","rating":"Cold"}'),
    (N'Requirement in Future', 110, N'{"rule":"followUpGap","hot":null,"warm":60}'),
    (N'No Response',           120, N'{"rule":"unansweredCalls","hot":2,"warm":4}'),
    (N'Wrong Number',          130, N'{"rule":"always","rating":"Cold"}'),
    (N'Not Reachable',         140, N'{"rule":"unansweredCalls","hot":2,"warm":4}'),
    (N'Do Not Contact',        150, N'{"rule":"always","rating":"Cold"}');

DECLARE @targets TABLE ([id] NVARCHAR(50) PRIMARY KEY);
INSERT INTO @targets ([id])
SELECT c.[id]
FROM [dbo].[DropdownCategory] c
WHERE c.[deletedAt] IS NULL
  AND (
        c.[key] = N'lead_customer_response'
        OR c.[id] IN (SELECT f.[dropdownCategoryId] FROM [dbo].[FormFieldDefinition] f
                      WHERE f.[module] = N'leads' AND f.[fieldKey] = N'customerResponse' AND f.[dropdownCategoryId] IS NOT NULL)
      )
  AND c.[key] <> N'shared_customer_response'
  AND NOT EXISTS (SELECT 1 FROM [dbo].[FormFieldDefinition] other
                  WHERE other.[dropdownCategoryId] = c.[id] AND other.[module] <> N'leads');

DELETE o
FROM [dbo].[DropdownOption] o
JOIN @targets t ON t.[id] = o.[categoryId]
WHERE o.[isSystem] = 0 AND NOT EXISTS (SELECT 1 FROM @options n WHERE n.[value] = o.[value]);

INSERT INTO [dbo].[DropdownOption] ([id], [categoryId], [value], [label], [metaJson], [sortOrder], [isActive], [isSystem], [isDefault], [createdAt], [updatedAt])
SELECT LOWER(CONVERT(NVARCHAR(36), NEWID())), t.[id], n.[value], n.[value], N'{"ratingRule":' + n.[ruleJson] + N'}', n.[sortOrder], 1, 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME()
FROM @targets t
CROSS JOIN @options n
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[DropdownOption] o WHERE o.[categoryId] = t.[id] AND o.[value] = n.[value]);

-- Matched ignoring case (the old 'Not interested' is the new 'Not Interested'): take the new spelling too, and the new
-- label unless an admin gave the option one of its own.
UPDATE o
SET [value] = n.[value],
    [label] = CASE WHEN o.[label] = o.[value] THEN n.[value] ELSE o.[label] END,
    [sortOrder] = n.[sortOrder],
    [isActive] = 1,
    [metaJson] = CASE
        WHEN o.[metaJson] IS NOT NULL AND ISJSON(o.[metaJson]) = 1 THEN JSON_MODIFY(o.[metaJson], '$.ratingRule', JSON_QUERY(n.[ruleJson]))
        ELSE N'{"ratingRule":' + n.[ruleJson] + N'}'
    END,
    [updatedAt] = SYSUTCDATETIME()
FROM [dbo].[DropdownOption] o
JOIN @targets t ON t.[id] = o.[categoryId]
JOIN @options n ON n.[value] = o.[value];

-- A leads field left without a list points at `lead_customer_response` (start-up seeding does the same).
UPDATE f
SET [dropdownCategoryId] = c.[id], [updatedAt] = SYSUTCDATETIME()
FROM [dbo].[FormFieldDefinition] f
JOIN [dbo].[DropdownCategory] c ON c.[key] = N'lead_customer_response' AND c.[deletedAt] IS NULL
WHERE f.[module] = N'leads' AND f.[fieldKey] = N'customerResponse' AND f.[dropdownCategoryId] IS NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
