-- Leads and opportunities share one Customer Response list again (`shared_customer_response`): the same 15 options.
-- Each option keeps its lead Rating rule (`ratingRule`) and gets the opportunity Sales Stages it fits
-- (`opportunityStages`; none = every open stage) and, for Do Not Contact, `noFollowUp` (the next follow-up is cleared).
-- opportunity.followUp.ts, Form Builder › Opportunities › Response Rules.
--
-- The shared list takes the new options (old ones removed; records keep the text they stored). Their meta starts from
-- the leads' own list (`lead_customer_response`, or the leads-only list the field uses), so Rating rules an admin
-- changed there carry over. The leads field is linked to the shared list, and `lead_customer_response` is deleted
-- (a tombstone, so start-up seeding doesn't bring it back) once no field uses it. A database without the shared list
-- yet gets it, with these defaults, from start-up seeding.
BEGIN TRY

BEGIN TRAN;

DECLARE @shared NVARCHAR(50) = (SELECT [id] FROM [dbo].[DropdownCategory] WHERE [key] = N'shared_customer_response' AND [deletedAt] IS NULL);

IF @shared IS NOT NULL
BEGIN
    DECLARE @options TABLE ([value] NVARCHAR(200) NOT NULL, [sortOrder] INT NOT NULL, [ruleJson] NVARCHAR(200) NOT NULL, [stagesJson] NVARCHAR(400) NULL, [noFollowUp] BIT NOT NULL);
    INSERT INTO @options ([value], [sortOrder], [ruleJson], [stagesJson], [noFollowUp]) VALUES
        (N'Interested',            10,  N'{"rule":"followUpGap","hot":7,"warm":30}',            N'["Qualification","Demo","Proposal/Price Quote","On Hold"]', 0),
        (N'Need More Information', 20,  N'{"rule":"followUpGap","hot":3,"warm":15}',            N'["Qualification","Demo","Proposal/Price Quote","Negotiation","On Hold","PO","Advance Received"]', 0),
        (N'Requested Quotation',   30,  N'{"rule":"daysSinceResponse","hot":10,"warm":30}',     N'["Qualification","Demo","Proposal/Price Quote","Negotiation"]', 0),
        (N'Requested Demo',        40,  N'{"rule":"followUpGap","hot":7,"warm":21}',            N'["Qualification","Demo","Proposal/Price Quote"]', 0),
        (N'Under Discussion',      50,  N'{"rule":"daysSinceResponse","hot":7,"warm":21}',      N'["Qualification","Demo","Proposal/Price Quote","Negotiation","On Hold","PO","Advance Received"]', 0),
        (N'Call Back Later',       60,  N'{"rule":"followUpGap","hot":3,"warm":30}',            NULL, 0),
        (N'Not Interested',        70,  N'{"rule":"always","rating":"Cold"}',                   N'["Qualification","Demo","Proposal/Price Quote","Negotiation","On Hold"]', 0),
        (N'Price Issue',           80,  N'{"rule":"followUpGap","hot":null,"warm":15}',         N'["Proposal/Price Quote","Negotiation","On Hold"]', 0),
        (N'Using Other Software',  90,  N'{"rule":"always","rating":"Cold"}',                   N'["Qualification","Demo","Proposal/Price Quote","Negotiation","On Hold"]', 0),
        (N'No Requirement',        100, N'{"rule":"always","rating":"Cold"}',                   N'["Qualification","Demo","On Hold"]', 0),
        (N'Requirement in Future', 110, N'{"rule":"followUpGap","hot":null,"warm":60}',         N'["Qualification","Demo","Proposal/Price Quote","On Hold"]', 0),
        (N'No Response',           120, N'{"rule":"unansweredCalls","hot":2,"warm":4}',         NULL, 0),
        (N'Wrong Number',          130, N'{"rule":"always","rating":"Cold"}',                   N'["Qualification","On Hold"]', 0),
        (N'Not Reachable',         140, N'{"rule":"unansweredCalls","hot":2,"warm":4}',         NULL, 0),
        (N'Do Not Contact',        150, N'{"rule":"always","rating":"Cold"}',                   NULL, 1);

    -- The leads' own list, whose options' meta (Rating rules) carries over.
    DECLARE @leads NVARCHAR(50) = (
        SELECT TOP 1 c.[id]
        FROM [dbo].[DropdownCategory] c
        WHERE c.[deletedAt] IS NULL AND c.[id] <> @shared
          AND (c.[key] = N'lead_customer_response'
               OR c.[id] IN (SELECT f.[dropdownCategoryId] FROM [dbo].[FormFieldDefinition] f WHERE f.[module] = N'leads' AND f.[fieldKey] = N'customerResponse'))
          AND NOT EXISTS (SELECT 1 FROM [dbo].[FormFieldDefinition] other WHERE other.[dropdownCategoryId] = c.[id] AND other.[module] <> N'leads')
        ORDER BY CASE WHEN c.[key] = N'lead_customer_response' THEN 1 ELSE 0 END
    );

    DELETE o
    FROM [dbo].[DropdownOption] o
    WHERE o.[categoryId] = @shared AND o.[isSystem] = 0 AND NOT EXISTS (SELECT 1 FROM @options n WHERE n.[value] = o.[value]);

    INSERT INTO [dbo].[DropdownOption] ([id], [categoryId], [value], [label], [metaJson], [sortOrder], [isActive], [isSystem], [isDefault], [createdAt], [updatedAt])
    SELECT LOWER(CONVERT(NVARCHAR(36), NEWID())), @shared, n.[value], n.[value], N'{}', n.[sortOrder], 1, 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME()
    FROM @options n
    WHERE NOT EXISTS (SELECT 1 FROM [dbo].[DropdownOption] o WHERE o.[categoryId] = @shared AND o.[value] = n.[value]);

    -- Meta: the leads' option's (else this option's own), with the default Rating rule when it has none, then the
    -- opportunity keys. Values matched ignoring case take the new spelling (and label, unless an admin set one).
    UPDATE o
    SET [value] = n.[value],
        [label] = CASE WHEN o.[label] = o.[value] THEN n.[value] ELSE o.[label] END,
        [sortOrder] = n.[sortOrder],
        [isActive] = 1,
        [metaJson] = JSON_MODIFY(
            JSON_MODIFY(
                CASE WHEN JSON_QUERY(m.[base], '$.ratingRule') IS NULL THEN JSON_MODIFY(m.[base], '$.ratingRule', JSON_QUERY(n.[ruleJson])) ELSE m.[base] END,
                '$.opportunityStages', JSON_QUERY(n.[stagesJson])
            ),
            '$.noFollowUp', CASE WHEN n.[noFollowUp] = 1 THEN CAST(1 AS BIT) ELSE NULL END
        ),
        [updatedAt] = SYSUTCDATETIME()
    FROM [dbo].[DropdownOption] o
    JOIN @options n ON n.[value] = o.[value]
    CROSS APPLY (
        SELECT COALESCE(
            (SELECT TOP 1 l.[metaJson] FROM [dbo].[DropdownOption] l WHERE l.[categoryId] = @leads AND l.[value] = n.[value] AND ISJSON(l.[metaJson]) = 1),
            CASE WHEN ISJSON(o.[metaJson]) = 1 THEN o.[metaJson] END,
            N'{}'
        ) AS [base]
    ) m
    WHERE o.[categoryId] = @shared;

    UPDATE [dbo].[DropdownCategory]
    SET [description] = N'What the customer said on the last follow-up (Leads, Opportunities). Rating rules for leads; Sales Stages for opportunities.',
        [updatedAt] = SYSUTCDATETIME()
    WHERE [id] = @shared;

    UPDATE [dbo].[FormFieldDefinition]
    SET [dropdownCategoryId] = @shared, [updatedAt] = SYSUTCDATETIME()
    WHERE [module] IN (N'leads', N'opportunities') AND [fieldKey] = N'customerResponse' AND [isSystem] = 1
      AND ([dropdownCategoryId] IS NULL OR [dropdownCategoryId] = @leads
           OR [dropdownCategoryId] IN (SELECT [id] FROM [dbo].[DropdownCategory] WHERE [key] = N'lead_customer_response'));

    DECLARE @old NVARCHAR(50) = (SELECT [id] FROM [dbo].[DropdownCategory] WHERE [key] = N'lead_customer_response' AND [deletedAt] IS NULL);
    IF @old IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [dbo].[FormFieldDefinition] WHERE [dropdownCategoryId] = @old)
    BEGIN
        DELETE FROM [dbo].[DropdownOption] WHERE [categoryId] = @old;
        UPDATE [dbo].[DropdownCategory] SET [deletedAt] = SYSUTCDATETIME(), [updatedAt] = SYSUTCDATETIME() WHERE [id] = @old;
    END
END

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
