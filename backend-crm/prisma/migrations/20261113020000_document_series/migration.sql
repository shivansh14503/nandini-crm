BEGIN TRY

BEGIN TRAN;

-- Document series: admin-configurable numbering (NIPL/L/26-27/1004). Code columns widen from 20 to 50 characters
-- so company prefix + module prefix + financial year + number + suffix always fit. No series rows are inserted:
-- until an admin saves the Document Series page, every module keeps its current format (LD-0001, QT-0001, ...).

-- Drop the unique key (created as a UNIQUE constraint by the init migration; plain index on older databases)
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE [name] = N'Organization_accountCode_key' AND [parent_object_id] = OBJECT_ID(N'dbo.Organization'))
    ALTER TABLE [dbo].[Organization] DROP CONSTRAINT [Organization_accountCode_key];
ELSE IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'Organization_accountCode_key' AND [object_id] = OBJECT_ID(N'dbo.Organization'))
    DROP INDEX [Organization_accountCode_key] ON [dbo].[Organization];

-- Drop the unique key (created as a UNIQUE constraint by the init migration; plain index on older databases)
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE [name] = N'Contact_contactCode_key' AND [parent_object_id] = OBJECT_ID(N'dbo.Contact'))
    ALTER TABLE [dbo].[Contact] DROP CONSTRAINT [Contact_contactCode_key];
ELSE IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'Contact_contactCode_key' AND [object_id] = OBJECT_ID(N'dbo.Contact'))
    DROP INDEX [Contact_contactCode_key] ON [dbo].[Contact];

-- Drop the unique key (created as a UNIQUE constraint by the init migration; plain index on older databases)
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE [name] = N'Lead_leadCode_key' AND [parent_object_id] = OBJECT_ID(N'dbo.Lead'))
    ALTER TABLE [dbo].[Lead] DROP CONSTRAINT [Lead_leadCode_key];
ELSE IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'Lead_leadCode_key' AND [object_id] = OBJECT_ID(N'dbo.Lead'))
    DROP INDEX [Lead_leadCode_key] ON [dbo].[Lead];

-- Drop the unique key (created as a UNIQUE constraint by the init migration; plain index on older databases)
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE [name] = N'Product_productCode_key' AND [parent_object_id] = OBJECT_ID(N'dbo.Product'))
    ALTER TABLE [dbo].[Product] DROP CONSTRAINT [Product_productCode_key];
ELSE IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'Product_productCode_key' AND [object_id] = OBJECT_ID(N'dbo.Product'))
    DROP INDEX [Product_productCode_key] ON [dbo].[Product];

-- Drop the unique key (created as a UNIQUE constraint by the init migration; plain index on older databases)
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE [name] = N'Opportunity_opportunityCode_key' AND [parent_object_id] = OBJECT_ID(N'dbo.Opportunity'))
    ALTER TABLE [dbo].[Opportunity] DROP CONSTRAINT [Opportunity_opportunityCode_key];
ELSE IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'Opportunity_opportunityCode_key' AND [object_id] = OBJECT_ID(N'dbo.Opportunity'))
    DROP INDEX [Opportunity_opportunityCode_key] ON [dbo].[Opportunity];

-- Drop the unique key (created as a UNIQUE constraint by the init migration; plain index on older databases)
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE [name] = N'Quotation_quotationCode_key' AND [parent_object_id] = OBJECT_ID(N'dbo.Quotation'))
    ALTER TABLE [dbo].[Quotation] DROP CONSTRAINT [Quotation_quotationCode_key];
ELSE IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'Quotation_quotationCode_key' AND [object_id] = OBJECT_ID(N'dbo.Quotation'))
    DROP INDEX [Quotation_quotationCode_key] ON [dbo].[Quotation];

-- Drop the unique key (created as a UNIQUE constraint by the init migration; plain index on older databases)
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE [name] = N'Ticket_ticketNumber_key' AND [parent_object_id] = OBJECT_ID(N'dbo.Ticket'))
    ALTER TABLE [dbo].[Ticket] DROP CONSTRAINT [Ticket_ticketNumber_key];
ELSE IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'Ticket_ticketNumber_key' AND [object_id] = OBJECT_ID(N'dbo.Ticket'))
    DROP INDEX [Ticket_ticketNumber_key] ON [dbo].[Ticket];

-- AlterTable
ALTER TABLE [dbo].[Organization] ALTER COLUMN [accountCode] NVARCHAR(50) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[Contact] ALTER COLUMN [contactCode] NVARCHAR(50) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[Lead] ALTER COLUMN [leadCode] NVARCHAR(50) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[Product] ALTER COLUMN [productCode] NVARCHAR(50) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[Opportunity] ALTER COLUMN [opportunityCode] NVARCHAR(50) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[Quotation] ALTER COLUMN [quotationCode] NVARCHAR(50) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[Ticket] ALTER COLUMN [ticketNumber] NVARCHAR(50) NOT NULL;

-- CreateTable
CREATE TABLE [dbo].[DocumentSeriesSettings] (
    [id] INT NOT NULL,
    [companyPrefix] NVARCHAR(15) NOT NULL CONSTRAINT [DocumentSeriesSettings_companyPrefix_df] DEFAULT '',
    [separator] NVARCHAR(1) NOT NULL CONSTRAINT [DocumentSeriesSettings_separator_df] DEFAULT '-',
    [fyStartMonth] INT NOT NULL CONSTRAINT [DocumentSeriesSettings_fyStartMonth_df] DEFAULT 4,
    [fyFormat] NVARCHAR(10) NOT NULL CONSTRAINT [DocumentSeriesSettings_fyFormat_df] DEFAULT 'YY-YY',
    [updatedBy] NVARCHAR(50),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DocumentSeriesSettings_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DocumentSeriesSettings_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[DocumentSeries] (
    [module] NVARCHAR(30) NOT NULL,
    [modulePrefix] NVARCHAR(10) NOT NULL,
    [includeCompanyPrefix] BIT NOT NULL CONSTRAINT [DocumentSeries_includeCompanyPrefix_df] DEFAULT 0,
    [includeFinancialYear] BIT NOT NULL CONSTRAINT [DocumentSeries_includeFinancialYear_df] DEFAULT 0,
    [suffix] NVARCHAR(10) NOT NULL CONSTRAINT [DocumentSeries_suffix_df] DEFAULT '',
    [padLength] INT NOT NULL CONSTRAINT [DocumentSeries_padLength_df] DEFAULT 4,
    [startingNumber] INT NOT NULL CONSTRAINT [DocumentSeries_startingNumber_df] DEFAULT 1,
    [resetEachFinancialYear] BIT NOT NULL CONSTRAINT [DocumentSeries_resetEachFinancialYear_df] DEFAULT 0,
    [updatedBy] NVARCHAR(50),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DocumentSeries_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DocumentSeries_pkey] PRIMARY KEY CLUSTERED ([module])
);

-- CreateIndex
ALTER TABLE [dbo].[Organization] ADD CONSTRAINT [Organization_accountCode_key] UNIQUE NONCLUSTERED ([accountCode]);

-- CreateIndex
ALTER TABLE [dbo].[Contact] ADD CONSTRAINT [Contact_contactCode_key] UNIQUE NONCLUSTERED ([contactCode]);

-- CreateIndex
ALTER TABLE [dbo].[Lead] ADD CONSTRAINT [Lead_leadCode_key] UNIQUE NONCLUSTERED ([leadCode]);

-- CreateIndex
ALTER TABLE [dbo].[Product] ADD CONSTRAINT [Product_productCode_key] UNIQUE NONCLUSTERED ([productCode]);

-- CreateIndex
ALTER TABLE [dbo].[Opportunity] ADD CONSTRAINT [Opportunity_opportunityCode_key] UNIQUE NONCLUSTERED ([opportunityCode]);

-- CreateIndex
ALTER TABLE [dbo].[Quotation] ADD CONSTRAINT [Quotation_quotationCode_key] UNIQUE NONCLUSTERED ([quotationCode]);

-- CreateIndex
ALTER TABLE [dbo].[Ticket] ADD CONSTRAINT [Ticket_ticketNumber_key] UNIQUE NONCLUSTERED ([ticketNumber]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

