-- Lead Rating rules (docs/lead-rating-rules.md): the columns the server keeps a lead's Rating with, the module setting
-- that holds the new-lead limits, the starting rule of each Customer Response option the leads form uses, the
-- "Closes the lead" switch on the Lost statuses, and a first Rating for every open lead.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[Lead] ADD
    [ratingReason] NVARCHAR(200),
    [unansweredCalls] INT NOT NULL CONSTRAINT [Lead_unansweredCalls_df] DEFAULT 0,
    [ratingAgeingFrom] DATE,
    [ratingAgeingJson] NVARCHAR(400);

-- Dynamic SQL from here on: the new columns don't exist yet when this batch is compiled.
EXEC(N'CREATE NONCLUSTERED INDEX [Lead_ratingAgeingFrom_idx] ON [dbo].[Lead]([ratingAgeingFrom]);');

CREATE TABLE [dbo].[ModuleSetting] (
    [module] NVARCHAR(40) NOT NULL,
    [key] NVARCHAR(80) NOT NULL,
    [valueJson] NVARCHAR(max) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ModuleSetting_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ModuleSetting_pkey] PRIMARY KEY CLUSTERED ([module], [key])
);

-- Starting rules of the options the leads Customer Response field offers (whatever list it is linked to). Options
-- that already have a rule, aren't JSON, or aren't listed here are left alone (they rate with the default rule).
UPDATE o
SET [metaJson] = JSON_MODIFY(COALESCE(o.[metaJson], N'{}'), '$.ratingRule', JSON_QUERY(r.[ruleJson])),
    [updatedAt] = CURRENT_TIMESTAMP
FROM [dbo].[DropdownOption] o
JOIN [dbo].[FormFieldDefinition] f
  ON f.[dropdownCategoryId] = o.[categoryId] AND f.[module] = N'leads' AND f.[fieldKey] = N'customerResponse'
JOIN (VALUES
    (N'Interested - wants a demo',   N'{"rule":"followUpGap","hot":5,"warm":"noLimit"}'),
    (N'Interested - send quotation', N'{"rule":"daysSinceResponse","hot":6,"warm":14}'),
    (N'Asked to call back later',    N'{"rule":"followUpGap","hot":5,"warm":"noLimit"}'),
    (N'Not reachable / no answer',   N'{"rule":"unansweredCalls","hot":2,"warm":4}'),
    (N'Needs internal discussion',   N'{"rule":"followUpGap","hot":5,"warm":"noLimit"}'),
    (N'Using another product',       N'{"rule":"always","rating":"Cold"}'),
    (N'Not interested',              N'{"rule":"always","rating":"Cold"}')
) AS r([value], [ruleJson]) ON r.[value] = o.[value]
WHERE (o.[metaJson] IS NULL OR (ISJSON(o.[metaJson]) = 1 AND JSON_QUERY(o.[metaJson], '$.ratingRule') IS NULL));

-- "Closes the lead" on the Lost statuses of the leads Status list.
UPDATE o
SET [metaJson] = JSON_MODIFY(COALESCE(o.[metaJson], N'{}'), '$.closesLead', CAST(1 AS BIT)),
    [updatedAt] = CURRENT_TIMESTAMP
FROM [dbo].[DropdownOption] o
JOIN [dbo].[FormFieldDefinition] f
  ON f.[dropdownCategoryId] = o.[categoryId] AND f.[module] = N'leads' AND f.[fieldKey] = N'status'
WHERE o.[value] IN (N'Dead', N'Unqualified / Lost')
  AND (o.[metaJson] IS NULL OR ISJSON(o.[metaJson]) = 1);

-- A first Rating for open leads, by the default new-lead rule counted from today (IST): a follow-up 0–5 days away is
-- Hot, anything later Warm; none or a past one Warm. Closed and converted leads stay without one.
EXEC(N'
DECLARE @today DATE = CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), ''+05:30'') AS DATE);
UPDATE l
SET [rating] = CASE
        WHEN l.[nextFollowupDate] IS NOT NULL AND l.[nextFollowupDate] >= @today AND DATEDIFF(DAY, @today, l.[nextFollowupDate]) <= 5 THEN N''Hot''
        ELSE N''Warm''
    END,
    [ratingReason] = CASE
        WHEN l.[nextFollowupDate] IS NULL THEN N''Rated when Rating rules started (no follow-up)''
        WHEN l.[nextFollowupDate] < @today THEN N''Rated when Rating rules started (follow-up overdue)''
        ELSE CONCAT(N''Rated when Rating rules started (follow-up in '', DATEDIFF(DAY, @today, l.[nextFollowupDate]), N'' days)'')
    END
FROM [dbo].[Lead] l
WHERE l.[isDeleted] = 0 AND l.[rating] IS NULL AND l.[status] <> N''Converted''
  AND NOT EXISTS (
      SELECT 1
      FROM [dbo].[DropdownOption] o
      JOIN [dbo].[FormFieldDefinition] f
        ON f.[dropdownCategoryId] = o.[categoryId] AND f.[module] = N''leads'' AND f.[fieldKey] = N''status''
      WHERE o.[value] = l.[status] AND ISJSON(o.[metaJson]) = 1 AND JSON_VALUE(o.[metaJson], ''$.closesLead'') = ''true''
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
