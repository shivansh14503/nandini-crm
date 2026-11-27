-- Products (Jira CRM-15 Product Catalog, CRM-108):
--  • "Zz Rename Check", a text field added to the product form in Form Builder, is removed: its Form Builder row, the
--    values products stored for it and list cards on it.
--  • Manufacturer becomes a dropdown (product_manufacturer, Form Builder › Dropdowns › Products): its options are the
--    Product Catalog sheet's manufacturers and every manufacturer products already carry. The product form still lets
--    you type a new one; saving the product adds it to the dropdown (product.manufacturer.ts).
--  • The sheet's product lines join the shared Product Category dropdown, and its Software type joins Product Type
--    (after the options already there; an option an admin has, in any case, isn't added twice).
-- The sheet's 55 products are loaded once at start-up (src/modules/products/productCatalog.load.ts), not here: their
-- numbers come from Document Series.
BEGIN TRY

BEGIN TRAN;

-- ── Zz Rename Check ──
DECLARE @renameCheck TABLE ([id] NVARCHAR(50), [fieldKey] NVARCHAR(80));
INSERT INTO @renameCheck ([id], [fieldKey])
SELECT [id], [fieldKey] FROM [dbo].[FormFieldDefinition]
WHERE [module] = N'products' AND [isSystem] = 0 AND LTRIM(RTRIM([label])) = N'Zz Rename Check';

DECLARE @key NVARCHAR(80);
DECLARE key_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT [fieldKey] FROM @renameCheck;
OPEN key_cursor;
FETCH NEXT FROM key_cursor INTO @key;
WHILE @@FETCH_STATUS = 0
BEGIN
    DECLARE @path NVARCHAR(200) = N'$."' + @key + N'"';
    UPDATE [dbo].[Product]
    SET [customDataJson] = JSON_MODIFY([customDataJson], @path, NULL)
    WHERE ISJSON([customDataJson]) = 1 AND [customDataJson] LIKE N'%"' + @key + N'"%';
    DELETE FROM [dbo].[ModuleScorecard] WHERE [module] = N'products' AND [fieldKey] = @key;
    FETCH NEXT FROM key_cursor INTO @key;
END;
CLOSE key_cursor;
DEALLOCATE key_cursor;

DELETE FROM [dbo].[FormFieldDefinition] WHERE [id] IN (SELECT [id] FROM @renameCheck);

-- ── Manufacturer dropdown ──
IF NOT EXISTS (SELECT 1 FROM [dbo].[DropdownCategory] WHERE [key] = N'product_manufacturer')
    INSERT INTO [dbo].[DropdownCategory] ([id], [key], [label], [module], [description], [isSystem], [createdAt], [updatedAt])
    VALUES (CONVERT(NVARCHAR(50), NEWID()), N'product_manufacturer', N'Manufacturer', N'products',
        N'Manufacturers of the product catalog. A new manufacturer typed on a product is added here when the product is saved.',
        1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

DECLARE @manufacturerCategory NVARCHAR(50) =
    (SELECT [id] FROM [dbo].[DropdownCategory] WHERE [key] = N'product_manufacturer' AND [deletedAt] IS NULL);

IF @manufacturerCategory IS NOT NULL
BEGIN
    DECLARE @manufacturers TABLE ([value] NVARCHAR(200));
    INSERT INTO @manufacturers ([value]) VALUES
        (N'Acronis'),
        (N'Agrya FinLabs Pvt Ltd'),
        (N'Biz Analyst'),
        (N'Computax'),
        (N'CredFlow'),
        (N'DMS'),
        (N'Enjay IT Solutions'),
        (N'Greytip Software Private Limited'),
        (N'Inthink Technology'),
        (N'Livekeeping Technologies Private Limited'),
        (N'Nandini Infosystems'),
        (N'Privet Ventures Pvt Ltd'),
        (N'Tally Solutions Private Limited'),
        (N'Teramind'),
        (N'TS Plus'),
        (N'Zoho Corporation');
    INSERT INTO @manufacturers ([value])
    SELECT DISTINCT LTRIM(RTRIM([manufacturer])) FROM [dbo].[Product]
    WHERE [isDeleted] = 0 AND [manufacturer] IS NOT NULL AND LTRIM(RTRIM([manufacturer])) <> N'';

    DECLARE @manufacturerBase INT = ISNULL((SELECT MAX([sortOrder]) FROM [dbo].[DropdownOption] WHERE [categoryId] = @manufacturerCategory), 0);
    -- One option per name ignoring case (the collation), A to Z.
    INSERT INTO [dbo].[DropdownOption] ([id], [categoryId], [value], [label], [sortOrder], [isActive], [isSystem], [isDefault], [createdAt], [updatedAt])
    SELECT CONVERT(NVARCHAR(50), NEWID()), @manufacturerCategory, n.[value], n.[value],
        @manufacturerBase + 10 * ROW_NUMBER() OVER (ORDER BY n.[value]), 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM (SELECT MIN([value]) AS [value] FROM @manufacturers GROUP BY [value]) n
    WHERE NOT EXISTS (SELECT 1 FROM [dbo].[DropdownOption] o WHERE o.[categoryId] = @manufacturerCategory AND o.[value] = n.[value]);

    -- The Manufacturer field offers it (an admin's label, place and settings stay).
    UPDATE [dbo].[FormFieldDefinition]
    SET [fieldType] = N'select', [dropdownCategoryId] = @manufacturerCategory, [updatedAt] = CURRENT_TIMESTAMP
    WHERE [module] = N'products' AND [isSystem] = 1 AND [fieldKey] = N'manufacturer'
        AND ([validationRulesJson] IS NULL OR [validationRulesJson] NOT LIKE N'%"_deleted":true%');
END;

-- ── Product Category: the sheet's product lines ──
DECLARE @categoryId NVARCHAR(50) =
    (SELECT [id] FROM [dbo].[DropdownCategory] WHERE [key] = N'shared_product_category' AND [deletedAt] IS NULL);
IF @categoryId IS NOT NULL
BEGIN
    DECLARE @categories TABLE ([value] NVARCHAR(200), [position] INT);
    INSERT INTO @categories ([value], [position]) VALUES
    (N'Acronis', 1),
    (N'AMC', 2),
    (N'Biz Analyst', 3),
    (N'BizDarpan', 4),
    (N'Connect 21', 5),
    (N'CredFlow', 6),
    (N'CRM', 7),
    (N'Data Implementation', 8),
    (N'DMS', 9),
    (N'Dox2U', 10),
    (N'E-Invoice Module', 11),
    (N'E-way Bill Module', 12),
    (N'Garruda ERP', 13),
    (N'GoEffortless', 14),
    (N'GST Software', 15),
    (N'HRMS Software', 16),
    (N'Livekeeping', 17),
    (N'MAssist', 18),
    (N'Tally Customization', 19),
    (N'Tally on AWS', 20),
    (N'Tally On Cloud', 21),
    (N'Tally Software Service (TSS)', 22),
    (N'Tally Training', 23),
    (N'Tally Upgrade', 24),
    (N'TallyDrive', 25),
    (N'TallyPrime', 26),
    (N'TallyPrime On Rent', 27),
    (N'TallyPrime Server', 28),
    (N'TallyPrime with WhatsApp', 29),
    (N'Teramind', 30),
    (N'TVU', 31),
    (N'WhatsApp Module', 32),
    (N'Zoho', 33);
    DECLARE @categoryBase INT = ISNULL((SELECT MAX([sortOrder]) FROM [dbo].[DropdownOption] WHERE [categoryId] = @categoryId), 0);
    INSERT INTO [dbo].[DropdownOption] ([id], [categoryId], [value], [label], [sortOrder], [isActive], [isSystem], [isDefault], [createdAt], [updatedAt])
    SELECT CONVERT(NVARCHAR(50), NEWID()), @categoryId, c.[value], c.[value],
        @categoryBase + 10 * ROW_NUMBER() OVER (ORDER BY c.[position]), 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM @categories c
    WHERE NOT EXISTS (SELECT 1 FROM [dbo].[DropdownOption] o WHERE o.[categoryId] = @categoryId AND o.[value] = c.[value]);
END;

-- ── Product Type: Software ──
DECLARE @typeId NVARCHAR(50) = (SELECT [id] FROM [dbo].[DropdownCategory] WHERE [key] = N'product_type' AND [deletedAt] IS NULL);
IF @typeId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [dbo].[DropdownOption] WHERE [categoryId] = @typeId AND [value] = N'Software')
    INSERT INTO [dbo].[DropdownOption] ([id], [categoryId], [value], [label], [sortOrder], [isActive], [isSystem], [isDefault], [createdAt], [updatedAt])
    VALUES (CONVERT(NVARCHAR(50), NEWID()), @typeId, N'Software', N'Software',
        ISNULL((SELECT MAX([sortOrder]) FROM [dbo].[DropdownOption] WHERE [categoryId] = @typeId), 0) + 10, 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
