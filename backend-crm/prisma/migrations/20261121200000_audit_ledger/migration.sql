-- Audit log, production layout (docs/database-design.md §4.16, docs/build-plan.md Phase 11):
--  • An append-only LEDGER table: rows can only be inserted. UPDATE / DELETE fail for every login (db_owner included)
--    and sys.sp_verify_database_ledger proves no row was changed. Retention is indefinite, so nothing ever needs deleting.
--  • BIGINT IDENTITY clustered key (appends at the end, no page splits) instead of a random UUID; PAGE compression.
--  • Who / where / how columns (actor id + role, source, request id, session, route, screen, IP, browser), the record's
--    number and name at the time, the changed field list, and an undo link.
--  • Indexes for the admin Audit Log screen: by date, record, user, module, category, action, request and IP.
-- The existing rows are copied over in date order with every column that can be worked out from them filled in
-- (record names from the live rows, falling back to the stored snapshot; actor ids; sign-in IPs; changed fields).
BEGIN TRY

BEGIN TRAN;

-- Free the old table's name and its schema-scoped constraint names (index names are per table and need no change).
EXEC sp_rename N'dbo.AuditLog', N'AuditLog_legacy';
EXEC sp_rename N'dbo.AuditLog_pkey', N'AuditLog_legacy_pkey', N'OBJECT';
EXEC sp_rename N'dbo.AuditLog_createdAt_df', N'AuditLog_legacy_createdAt_df', N'OBJECT';

CREATE TABLE [dbo].[AuditLog] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [category] NVARCHAR(12) NOT NULL,
    [action] NVARCHAR(30) NOT NULL,
    [severity] NVARCHAR(10) NOT NULL CONSTRAINT [AuditLog_severity_df] DEFAULT 'INFO',
    [module] NVARCHAR(40) NOT NULL,
    [entityType] NVARCHAR(30) NOT NULL,
    [entityId] NVARCHAR(50) NOT NULL,
    [entityCode] NVARCHAR(50),
    [entityLabel] NVARCHAR(200),
    [changedFields] NVARCHAR(1000),
    [changesJson] NVARCHAR(max),
    [changedBy] NVARCHAR(50) NOT NULL,
    [actorId] INT,
    [actorRole] NVARCHAR(50),
    [source] NVARCHAR(10),
    [requestId] NVARCHAR(50),
    [sessionId] NVARCHAR(50),
    [httpMethod] NVARCHAR(10),
    [route] NVARCHAR(200),
    [page] NVARCHAR(300),
    [ipAddress] NVARCHAR(45),
    [userAgent] NVARCHAR(400),
    [revertsId] BIGINT,
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
) WITH (LEDGER = ON (APPEND_ONLY = ON), DATA_COMPRESSION = PAGE);

-- Dynamic SQL from here on: when this batch is compiled, [AuditLog] is still the old table without these columns.
EXEC(N'
INSERT INTO [dbo].[AuditLog] (
    [createdAt], [category], [action], [severity], [module], [entityType], [entityId], [entityCode], [entityLabel],
    [changedFields], [changesJson], [changedBy], [actorId], [actorRole], [source], [ipAddress]
)
SELECT
    l.[createdAt],
    c.[category],
    l.[action],
    CASE
        WHEN l.[action] = N''LOGIN_FAILED'' THEN N''WARNING''
        WHEN l.[action] IN (N''DELETE'', N''CONVERT'', N''IMPORT'') OR c.[category] = N''CONFIG'' THEN N''NOTICE''
        ELSE N''INFO''
    END,
    CASE l.[entityType]
        WHEN N''Organization'' THEN N''organizations''
        WHEN N''Contact'' THEN N''contacts''
        WHEN N''Lead'' THEN N''leads''
        WHEN N''Opportunity'' THEN N''opportunities''
        WHEN N''Quotation'' THEN N''quotations''
        WHEN N''Product'' THEN N''products''
        WHEN N''Ticket'' THEN N''tickets''
        WHEN N''PartnerCompany'' THEN N''partner-companies''
        WHEN N''User'' THEN N''users''
        WHEN N''Import'' THEN COALESCE(JSON_VALUE(j.[json], ''$.entity''), N''imports'')
        WHEN N''DropdownCategory'' THEN N''form-customization''
        WHEN N''DropdownOption'' THEN N''form-customization''
        WHEN N''FormField'' THEN N''form-customization''
        WHEN N''ModuleSetting'' THEN N''form-customization''
        WHEN N''PdfTemplate'' THEN N''pdf-templates''
        WHEN N''PdfAsset'' THEN N''pdf-templates''
        WHEN N''PdfSavedItem'' THEN N''pdf-templates''
        WHEN N''DocumentSeries'' THEN N''document-series''
        WHEN N''City'' THEN N''cities''
        ELSE LOWER(l.[entityType])
    END,
    l.[entityType],
    l.[entityId],
    COALESCE(org.[accountCode], con.[contactCode], ld.[leadCode], opp.[opportunityCode], qt.[quotationCode], tk.[ticketNumber], pr.[productCode]),
    -- Same wording as recordLabel() in src/services/auditLabels.ts.
    LEFT(CASE l.[entityType]
        WHEN N''Organization'' THEN COALESCE(org.[organizationName], JSON_VALUE(j.[json], ''$.organizationName''))
        WHEN N''Contact'' THEN COALESCE(con.[name], JSON_VALUE(j.[json], ''$.name''))
        WHEN N''Lead'' THEN COALESCE(ld.[name], JSON_VALUE(j.[json], ''$.name''))
        WHEN N''Opportunity'' THEN COALESCE(opp.[opportunityName], opp.[organizationName], JSON_VALUE(j.[json], ''$.opportunityName''), JSON_VALUE(j.[json], ''$.organizationName''))
        WHEN N''Quotation'' THEN COALESCE(qt.[quotationTitle], JSON_VALUE(j.[json], ''$.quotationTitle''))
        WHEN N''Ticket'' THEN COALESCE(tk.[ticketSubject], tk.[organizationName], JSON_VALUE(j.[json], ''$.ticketSubject''), JSON_VALUE(j.[json], ''$.organizationName''))
        WHEN N''Product'' THEN COALESCE(pr.[productName], JSON_VALUE(j.[json], ''$.productName''))
        WHEN N''PartnerCompany'' THEN COALESCE(pc.[partnerName], JSON_VALUE(j.[json], ''$.partnerName''))
        WHEN N''User'' THEN COALESCE(NULLIF(us.[fullName], N''''), us.[Username])
        WHEN N''City'' THEN COALESCE(ci.[cityName], JSON_VALUE(j.[json], ''$.cityName''), JSON_VALUE(j.[json], ''$.cityName.to''))
        WHEN N''DropdownCategory'' THEN COALESCE(dc.[label], JSON_VALUE(j.[json], ''$._meta.categoryLabel''), JSON_VALUE(j.[json], ''$.label''))
        WHEN N''DropdownOption'' THEN NULLIF(CONCAT(
            COALESCE(dcat.[label], JSON_VALUE(j.[json], ''$._meta.categoryLabel'')) + N'' › '',
            COALESCE(dop.[label], JSON_VALUE(j.[json], ''$._meta.optionLabel''), JSON_VALUE(j.[json], ''$.label''))
        ), N'''')
        -- A field ("Leads › Phone 3"), or the whole form for reorder / reset entries ("Leads form").
        WHEN N''FormField'' THEN ml.[label] + COALESCE(N'' › '' + COALESCE(ff.[label], JSON_VALUE(j.[json], ''$._meta.fieldLabel''), JSON_VALUE(j.[json], ''$.label'')), N'' form'')
        WHEN N''ModuleSetting'' THEN l.[entityId]
        WHEN N''PdfTemplate'' THEN COALESCE(pt.[name], JSON_VALUE(j.[json], ''$.name''))
        WHEN N''PdfAsset'' THEN COALESCE(pa.[fileName], JSON_VALUE(j.[json], ''$.fileName''))
        WHEN N''PdfSavedItem'' THEN COALESCE(ps.[name], JSON_VALUE(j.[json], ''$.name''))
        WHEN N''DocumentSeries'' THEN N''Document Series''
        WHEN N''Import'' THEN JSON_VALUE(j.[json], ''$.fileName'')
    END, 200),
    LEFT(f.[fields], 1000),
    l.[changesJson],
    l.[changedBy],
    actor.[Id],
    JSON_VALUE(j.[json], ''$._meta.actorRole''),
    CASE WHEN l.[changedBy] = N''system'' THEN N''JOB'' END,
    CASE WHEN ip.[raw] LIKE N''::ffff:%.%'' THEN SUBSTRING(ip.[raw], 8, 45) ELSE LEFT(ip.[raw], 45) END
FROM [dbo].[AuditLog_legacy] l
CROSS APPLY (SELECT CASE WHEN ISJSON(l.[changesJson]) = 1 THEN l.[changesJson] END AS [json]) j
CROSS APPLY (SELECT CASE WHEN l.[action] IN (N''LOGIN'', N''LOGIN_FAILED'') THEN JSON_VALUE(j.[json], ''$.ip'') END AS [raw]) ip
CROSS APPLY (
    SELECT CASE
        WHEN l.[action] IN (N''LOGIN'', N''LOGIN_FAILED'', N''LOGOUT'') THEN N''SECURITY''
        WHEN l.[entityType] IN (N''DropdownCategory'', N''DropdownOption'', N''FormField'', N''ModuleSetting'', N''PdfTemplate'',
                                N''PdfAsset'', N''PdfSavedItem'', N''DocumentSeries'', N''City'') THEN N''CONFIG''
        ELSE N''DATA''
    END AS [category]
) c
OUTER APPLY (
    SELECT N''|'' + STRING_AGG(CAST(k.[key] AS NVARCHAR(MAX)), N''|'') + N''|'' AS [fields]
    FROM OPENJSON(CASE WHEN l.[action] IN (N''UPDATE'', N''STATUS_CHANGE'', N''FOLLOW_UP'', N''CONVERT'') THEN j.[json] END) k
    WHERE k.[type] = 5 AND k.[key] NOT IN (N''_meta'', N''followUp'')
      AND EXISTS (SELECT 1 FROM OPENJSON(k.[value]) x WHERE x.[key] = N''from'')
) f
LEFT JOIN [dbo].[Users] actor ON actor.[Username] = l.[changedBy]
LEFT JOIN [dbo].[Organization] org ON l.[entityType] = N''Organization'' AND org.[id] = l.[entityId]
LEFT JOIN [dbo].[Contact] con ON l.[entityType] = N''Contact'' AND con.[id] = l.[entityId]
LEFT JOIN [dbo].[Lead] ld ON l.[entityType] = N''Lead'' AND ld.[id] = l.[entityId]
LEFT JOIN [dbo].[Opportunity] opp ON l.[entityType] = N''Opportunity'' AND opp.[id] = l.[entityId]
LEFT JOIN [dbo].[Quotation] qt ON l.[entityType] = N''Quotation'' AND qt.[id] = l.[entityId]
LEFT JOIN [dbo].[Ticket] tk ON l.[entityType] = N''Ticket'' AND tk.[id] = l.[entityId]
LEFT JOIN [dbo].[Product] pr ON l.[entityType] = N''Product'' AND pr.[id] = l.[entityId]
LEFT JOIN [dbo].[PartnerCompany] pc ON l.[entityType] = N''PartnerCompany'' AND pc.[id] = l.[entityId]
LEFT JOIN [dbo].[Users] us ON l.[entityType] = N''User'' AND us.[Id] = TRY_CAST(l.[entityId] AS INT)
LEFT JOIN [dbo].[City] ci ON l.[entityType] = N''City'' AND ci.[id] = TRY_CAST(l.[entityId] AS INT)
LEFT JOIN [dbo].[DropdownCategory] dc ON l.[entityType] = N''DropdownCategory'' AND dc.[id] = l.[entityId]
LEFT JOIN [dbo].[DropdownOption] dop ON l.[entityType] = N''DropdownOption'' AND dop.[id] = l.[entityId]
LEFT JOIN [dbo].[DropdownCategory] dcat ON dcat.[id] = dop.[categoryId]
LEFT JOIN [dbo].[FormFieldDefinition] ff ON l.[entityType] = N''FormField'' AND ff.[id] = l.[entityId]
-- Label of the module a form-field entry belongs to (a field''s module, or the module key itself for form-wide entries).
CROSS APPLY (
    SELECT COALESCE(ff.[module], JSON_VALUE(j.[json], ''$._meta.module''), CASE WHEN l.[entityType] = N''FormField'' THEN l.[entityId] END) AS [key]
) tm
CROSS APPLY (
    SELECT CASE tm.[key]
        WHEN N''leads'' THEN N''Leads'' WHEN N''opportunities'' THEN N''Opportunities'' WHEN N''quotations'' THEN N''Quotations''
        WHEN N''organizations'' THEN N''Organizations'' WHEN N''contacts'' THEN N''Contacts'' WHEN N''tickets'' THEN N''Tickets''
        WHEN N''products'' THEN N''Products'' WHEN N''partner-companies'' THEN N''Partner Companies'' WHEN N''shared'' THEN N''Shared''
        ELSE tm.[key]
    END AS [label]
) ml
LEFT JOIN [dbo].[PdfTemplate] pt ON l.[entityType] = N''PdfTemplate'' AND pt.[id] = l.[entityId]
LEFT JOIN [dbo].[PdfAsset] pa ON l.[entityType] = N''PdfAsset'' AND pa.[id] = l.[entityId]
LEFT JOIN [dbo].[PdfSavedItem] ps ON l.[entityType] = N''PdfSavedItem'' AND ps.[id] = l.[entityId]
ORDER BY l.[createdAt], l.[id];
');

DROP TABLE [dbo].[AuditLog_legacy];

EXEC(N'CREATE NONCLUSTERED INDEX [AuditLog_createdAt_idx] ON [dbo].[AuditLog]([createdAt]) WITH (DATA_COMPRESSION = PAGE);');
EXEC(N'CREATE NONCLUSTERED INDEX [AuditLog_entityType_entityId_id_idx] ON [dbo].[AuditLog]([entityType], [entityId], [id]) WITH (DATA_COMPRESSION = PAGE);');
EXEC(N'CREATE NONCLUSTERED INDEX [AuditLog_changedBy_createdAt_idx] ON [dbo].[AuditLog]([changedBy], [createdAt]) WITH (DATA_COMPRESSION = PAGE);');
EXEC(N'CREATE NONCLUSTERED INDEX [AuditLog_module_createdAt_idx] ON [dbo].[AuditLog]([module], [createdAt]) WITH (DATA_COMPRESSION = PAGE);');
EXEC(N'CREATE NONCLUSTERED INDEX [AuditLog_category_createdAt_idx] ON [dbo].[AuditLog]([category], [createdAt]) WITH (DATA_COMPRESSION = PAGE);');
EXEC(N'CREATE NONCLUSTERED INDEX [AuditLog_action_createdAt_idx] ON [dbo].[AuditLog]([action], [createdAt]) WITH (DATA_COMPRESSION = PAGE);');
EXEC(N'CREATE NONCLUSTERED INDEX [AuditLog_requestId_idx] ON [dbo].[AuditLog]([requestId]) WITH (DATA_COMPRESSION = PAGE);');
EXEC(N'CREATE NONCLUSTERED INDEX [AuditLog_ipAddress_createdAt_idx] ON [dbo].[AuditLog]([ipAddress], [createdAt]) WITH (DATA_COMPRESSION = PAGE);');
EXEC(N'CREATE NONCLUSTERED INDEX [AuditLog_revertsId_idx] ON [dbo].[AuditLog]([revertsId]) WITH (DATA_COMPRESSION = PAGE);');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
