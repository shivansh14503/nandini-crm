BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Users] DROP CONSTRAINT [DF__Users__Role__5CD6CB2B];
EXEC SP_RENAME N'dbo.PK__Users__3214EC07D4281F91', N'Users_pkey';
ALTER TABLE [dbo].[Users] ALTER COLUMN [Password] NVARCHAR(255) NOT NULL;
ALTER TABLE [dbo].[Users] ADD CONSTRAINT [Users_Role_df] DEFAULT 'Sales Executive' FOR [Role];
ALTER TABLE [dbo].[Users] ADD [createdAt] DATETIME2 NOT NULL CONSTRAINT [Users_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
[department] NVARCHAR(50),
[email] NVARCHAR(120),
[fullName] NVARCHAR(100) NOT NULL CONSTRAINT [Users_fullName_df] DEFAULT '',
[isActive] BIT NOT NULL CONSTRAINT [Users_isActive_df] DEFAULT 1,
[isGroupUser] BIT NOT NULL CONSTRAINT [Users_isGroupUser_df] DEFAULT 0,
[lastLoginAt] DATETIME2,
[onLeave] BIT NOT NULL CONSTRAINT [Users_onLeave_df] DEFAULT 0,
[phone] NVARCHAR(20),
[updatedAt] DATETIME2 NOT NULL CONSTRAINT [Users_updatedAt_df] DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE [dbo].[SequenceCounter] (
    [prefix] NVARCHAR(10) NOT NULL,
    [currentValue] INT NOT NULL CONSTRAINT [SequenceCounter_currentValue_df] DEFAULT 0,
    CONSTRAINT [SequenceCounter_pkey] PRIMARY KEY CLUSTERED ([prefix])
);

-- CreateTable
CREATE TABLE [dbo].[Organization] (
    [id] NVARCHAR(50) NOT NULL,
    [accountCode] NVARCHAR(20) NOT NULL,
    [organizationName] NVARCHAR(200) NOT NULL,
    [mailingName] NVARCHAR(200),
    [tradeName] NVARCHAR(200),
    [natureOfBusiness] NVARCHAR(100),
    [accountStatus] NVARCHAR(20) NOT NULL CONSTRAINT [Organization_accountStatus_df] DEFAULT 'Active',
    [inactivityReason] NVARCHAR(500),
    [typeOfEntity] NVARCHAR(50),
    [customerType] NVARCHAR(50),
    [sapCodeTallyId] NVARCHAR(30),
    [showroomBranchCode] NVARCHAR(30),
    [sourceOfLead] NVARCHAR(50),
    [memberOfParentCorp] NVARCHAR(200),
    [parentOrganizationId] NVARCHAR(50),
    [numberOfEmployees] NVARCHAR(30),
    [annualTurnover] NVARCHAR(30),
    [description] NVARCHAR(1000),
    [accountVerified] BIT NOT NULL CONSTRAINT [Organization_accountVerified_df] DEFAULT 0,
    [verifiedAt] DATETIME2,
    [verifiedBy] NVARCHAR(50),
    [activeAmc] BIT NOT NULL CONSTRAINT [Organization_activeAmc_df] DEFAULT 0,
    [activeCloud] BIT NOT NULL CONSTRAINT [Organization_activeCloud_df] DEFAULT 0,
    [provideSupport] NVARCHAR(3) NOT NULL CONSTRAINT [Organization_provideSupport_df] DEFAULT 'Yes',
    [assignedUser] NVARCHAR(50),
    [billingAddress] NVARCHAR(250),
    [billingStreet] NVARCHAR(250),
    [billingCity] NVARCHAR(80),
    [billingState] NVARCHAR(80),
    [billingPostalCode] NVARCHAR(12),
    [billingCountry] NVARCHAR(80),
    [billingLatitude] NVARCHAR(30),
    [shippingAddress] NVARCHAR(250),
    [shippingStreet] NVARCHAR(250),
    [shippingCity] NVARCHAR(80),
    [shippingState] NVARCHAR(80),
    [shippingPostalCode] NVARCHAR(12),
    [shippingCountry] NVARCHAR(80),
    [shippingLongitude] NVARCHAR(30),
    [copyAddressFromBilling] BIT NOT NULL CONSTRAINT [Organization_copyAddressFromBilling_df] DEFAULT 0,
    [registrationType] NVARCHAR(30),
    [panNumber] NVARCHAR(10),
    [msmeRegnNumber] NVARCHAR(19),
    [accountName] NVARCHAR(200),
    [bankName] NVARCHAR(100),
    [bankIfscCode] NVARCHAR(11),
    [gstNo] NVARCHAR(15),
    [cinNo] NVARCHAR(21),
    [tanNumber] NVARCHAR(10),
    [accountNumber] NVARCHAR(18),
    [typeOfAccount] NVARCHAR(30),
    [bankAddress] NVARCHAR(250),
    [partnerCompaniesJson] NVARCHAR(max),
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Organization_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [Organization_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    CONSTRAINT [Organization_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Organization_accountCode_key] UNIQUE NONCLUSTERED ([accountCode])
);

-- CreateTable
CREATE TABLE [dbo].[EntityEmail] (
    [id] NVARCHAR(50) NOT NULL,
    [email] NVARCHAR(120) NOT NULL,
    [isPrimary] BIT NOT NULL CONSTRAINT [EntityEmail_isPrimary_df] DEFAULT 0,
    [isOptedOut] BIT NOT NULL CONSTRAINT [EntityEmail_isOptedOut_df] DEFAULT 0,
    [isInvalidBounce] BIT NOT NULL CONSTRAINT [EntityEmail_isInvalidBounce_df] DEFAULT 0,
    [sortOrder] INT NOT NULL CONSTRAINT [EntityEmail_sortOrder_df] DEFAULT 0,
    [organizationId] NVARCHAR(50),
    [contactId] NVARCHAR(50),
    [leadId] NVARCHAR(50),
    CONSTRAINT [EntityEmail_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Contact] (
    [id] NVARCHAR(50) NOT NULL,
    [contactCode] NVARCHAR(20) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [organizationName] NVARCHAR(200) NOT NULL,
    [organizationId] NVARCHAR(50),
    [mobile] NVARCHAR(10) NOT NULL,
    [officePhone] NVARCHAR(10),
    [phone3] NVARCHAR(10),
    [phone4] NVARCHAR(10),
    [phone5] NVARCHAR(10),
    [assignedTo] NVARCHAR(50) NOT NULL,
    [isPrimaryContact] BIT NOT NULL CONSTRAINT [Contact_isPrimaryContact_df] DEFAULT 0,
    [designation] NVARCHAR(100),
    [department] NVARCHAR(100),
    [leftJob] NVARCHAR(3) NOT NULL CONSTRAINT [Contact_leftJob_df] DEFAULT 'No',
    [communicationTypeJson] NVARCHAR(max),
    [doNotCall] BIT NOT NULL CONSTRAINT [Contact_doNotCall_df] DEFAULT 0,
    [description] NVARCHAR(2000),
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Contact_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [Contact_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    CONSTRAINT [Contact_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Contact_contactCode_key] UNIQUE NONCLUSTERED ([contactCode])
);

-- CreateTable
CREATE TABLE [dbo].[Lead] (
    [id] NVARCHAR(50) NOT NULL,
    [leadCode] NVARCHAR(20) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [mobile] NVARCHAR(10) NOT NULL,
    [mailingName] NVARCHAR(200),
    [designation] NVARCHAR(100),
    [leadSource] NVARCHAR(50) NOT NULL,
    [productCategoryJson] NVARCHAR(max) NOT NULL,
    [followupType] NVARCHAR(30),
    [addDescription] NVARCHAR(2000) NOT NULL,
    [registrationType] NVARCHAR(30),
    [turnover] NVARCHAR(30),
    [assignedTo] NVARCHAR(50) NOT NULL,
    [otherPhone] NVARCHAR(10),
    [organizationName] NVARCHAR(200),
    [department] NVARCHAR(100),
    [leadType] NVARCHAR(30) NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [Lead_status_df] DEFAULT 'New',
    [nextFollowupDate] DATE NOT NULL,
    [nextFollowupTime] NVARCHAR(20),
    [description] NVARCHAR(2000),
    [noOfEmployee] NVARCHAR(30),
    [referredBy] NVARCHAR(200),
    [primaryAddress] NVARCHAR(250),
    [primaryCity] NVARCHAR(80),
    [primaryState] NVARCHAR(80),
    [primaryPostalCode] NVARCHAR(12),
    [primaryCountry] NVARCHAR(80),
    [primaryLatitude] NVARCHAR(30),
    [otherAddress] NVARCHAR(250),
    [otherCity] NVARCHAR(80),
    [otherState] NVARCHAR(80),
    [otherPostalCode] NVARCHAR(12),
    [otherCountry] NVARCHAR(80),
    [otherLongitude] NVARCHAR(30),
    [copyAddressFromLeft] BIT NOT NULL CONSTRAINT [Lead_copyAddressFromLeft_df] DEFAULT 0,
    [convertedAt] DATETIME2,
    [convertedBy] NVARCHAR(50),
    [convertedOrganizationId] NVARCHAR(50),
    [convertedContactId] NVARCHAR(50),
    [convertedOpportunityId] NVARCHAR(50),
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Lead_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [Lead_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    CONSTRAINT [Lead_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Lead_leadCode_key] UNIQUE NONCLUSTERED ([leadCode])
);

-- CreateTable
CREATE TABLE [dbo].[Product] (
    [id] NVARCHAR(50) NOT NULL,
    [productCode] NVARCHAR(20) NOT NULL,
    [productName] NVARCHAR(200) NOT NULL,
    [hsnCode] NVARCHAR(8),
    [category] NVARCHAR(100),
    [type] NVARCHAR(30),
    [manufacturer] NVARCHAR(100),
    [taxType] NVARCHAR(10) CONSTRAINT [Product_taxType_df] DEFAULT 'GST',
    [taxRate] NVARCHAR(10),
    [discount] DECIMAL(5,2),
    [cost] DECIMAL(18,2),
    [mrp] DECIMAL(18,2),
    [msp] DECIMAL(18,2),
    [contractCreate] NVARCHAR(3) NOT NULL CONSTRAINT [Product_contractCreate_df] DEFAULT 'No',
    [description] NVARCHAR(2000),
    [termsAndConditions] NVARCHAR(2000),
    [isActive] BIT NOT NULL CONSTRAINT [Product_isActive_df] DEFAULT 1,
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Product_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [Product_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    CONSTRAINT [Product_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Product_productCode_key] UNIQUE NONCLUSTERED ([productCode])
);

-- CreateTable
CREATE TABLE [dbo].[Opportunity] (
    [id] NVARCHAR(50) NOT NULL,
    [opportunityCode] NVARCHAR(20) NOT NULL,
    [opportunityName] NVARCHAR(200),
    [productCategoryJson] NVARCHAR(max) NOT NULL,
    [contactName] NVARCHAR(100) NOT NULL,
    [contactId] NVARCHAR(50),
    [organizationName] NVARCHAR(200) NOT NULL,
    [organizationId] NVARCHAR(50),
    [contactNumber] NVARCHAR(10) NOT NULL,
    [emailAddress] NVARCHAR(120),
    [referredBy] NVARCHAR(200),
    [type] NVARCHAR(50) NOT NULL,
    [salesStage] NVARCHAR(50) NOT NULL,
    [leadSource] NVARCHAR(50) NOT NULL,
    [leadGivenBy] NVARCHAR(200) NOT NULL,
    [nextFollowupDate] DATE NOT NULL,
    [nextFollowupTime] NVARCHAR(20),
    [followupType] NVARCHAR(30),
    [addDescription] NVARCHAR(2000) NOT NULL,
    [description] NVARCHAR(2000),
    [assignedTo] NVARCHAR(50) NOT NULL,
    [tallySerialNo] NVARCHAR(30),
    [invoiceNo] NVARCHAR(30),
    [invoiceDate] DATE,
    [commission] NVARCHAR(50) NOT NULL,
    [addDocument] NVARCHAR(3) CONSTRAINT [Opportunity_addDocument_df] DEFAULT 'No',
    [currency] NVARCHAR(30) NOT NULL CONSTRAINT [Opportunity_currency_df] DEFAULT 'Indian Rupee: ₹',
    [groupName] NVARCHAR(80),
    [lumpSumDiscount] DECIMAL(18,2) NOT NULL CONSTRAINT [Opportunity_lumpSumDiscount_df] DEFAULT 0,
    [totalAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [Opportunity_totalAmount_df] DEFAULT 0,
    [totalDiscount] DECIMAL(18,2) NOT NULL CONSTRAINT [Opportunity_totalDiscount_df] DEFAULT 0,
    [subtotal] DECIMAL(18,2) NOT NULL CONSTRAINT [Opportunity_subtotal_df] DEFAULT 0,
    [totalTax] DECIMAL(18,2) NOT NULL CONSTRAINT [Opportunity_totalTax_df] DEFAULT 0,
    [grandTotal] DECIMAL(18,2) NOT NULL CONSTRAINT [Opportunity_grandTotal_df] DEFAULT 0,
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Opportunity_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [Opportunity_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    CONSTRAINT [Opportunity_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Opportunity_opportunityCode_key] UNIQUE NONCLUSTERED ([opportunityCode])
);

-- CreateTable
CREATE TABLE [dbo].[OpportunityLineItem] (
    [id] NVARCHAR(50) NOT NULL,
    [opportunityId] NVARCHAR(50) NOT NULL,
    [productId] NVARCHAR(50),
    [productName] NVARCHAR(200) NOT NULL,
    [quantity] DECIMAL(18,2) NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [discount] DECIMAL(18,2) NOT NULL CONSTRAINT [OpportunityLineItem_discount_df] DEFAULT 0,
    [discountType] NVARCHAR(10) NOT NULL CONSTRAINT [OpportunityLineItem_discountType_df] DEFAULT 'percentage',
    [salePrice] DECIMAL(18,2) NOT NULL CONSTRAINT [OpportunityLineItem_salePrice_df] DEFAULT 0,
    [taxRate] NVARCHAR(20) NOT NULL,
    [taxAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [OpportunityLineItem_taxAmount_df] DEFAULT 0,
    [total] DECIMAL(18,2) NOT NULL CONSTRAINT [OpportunityLineItem_total_df] DEFAULT 0,
    [description] NVARCHAR(2000),
    [note] NVARCHAR(2000),
    [sortOrder] INT NOT NULL CONSTRAINT [OpportunityLineItem_sortOrder_df] DEFAULT 0,
    CONSTRAINT [OpportunityLineItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Quotation] (
    [id] NVARCHAR(50) NOT NULL,
    [quotationCode] NVARCHAR(20) NOT NULL,
    [quotationTitle] NVARCHAR(200) NOT NULL,
    [quoteStage] NVARCHAR(30) NOT NULL CONSTRAINT [Quotation_quoteStage_df] DEFAULT 'Draft',
    [quotationDate] DATE NOT NULL,
    [validUntil] DATE NOT NULL,
    [remarks] NVARCHAR(2000),
    [termsAndCondition] NVARCHAR(100) NOT NULL,
    [termsAndConditionDescription] NVARCHAR(4000),
    [assignedTo] NVARCHAR(50) NOT NULL,
    [opportunityName] NVARCHAR(200) NOT NULL,
    [company] NVARCHAR(100) NOT NULL,
    [validationPeriod] NVARCHAR(30) NOT NULL,
    [otherRef] NVARCHAR(80),
    [paymentTerms] NVARCHAR(100) NOT NULL,
    [paymentTermsDescription] NVARCHAR(4000),
    [preparedFor] NVARCHAR(200) NOT NULL,
    [currency] NVARCHAR(30) NOT NULL CONSTRAINT [Quotation_currency_df] DEFAULT 'Indian Rupee: ₹',
    [groupName] NVARCHAR(80),
    [lumpSumDiscount] DECIMAL(18,2) NOT NULL CONSTRAINT [Quotation_lumpSumDiscount_df] DEFAULT 0,
    [totalAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [Quotation_totalAmount_df] DEFAULT 0,
    [totalDiscount] DECIMAL(18,2) NOT NULL CONSTRAINT [Quotation_totalDiscount_df] DEFAULT 0,
    [subtotal] DECIMAL(18,2) NOT NULL CONSTRAINT [Quotation_subtotal_df] DEFAULT 0,
    [totalTax] DECIMAL(18,2) NOT NULL CONSTRAINT [Quotation_totalTax_df] DEFAULT 0,
    [grandTotal] DECIMAL(18,2) NOT NULL CONSTRAINT [Quotation_grandTotal_df] DEFAULT 0,
    [organizationName] NVARCHAR(200),
    [organizationId] NVARCHAR(50),
    [contactName] NVARCHAR(100) NOT NULL,
    [contactId] NVARCHAR(50),
    [contactMobile] NVARCHAR(10),
    [mailingName] NVARCHAR(200),
    [gstNo] NVARCHAR(15),
    [contactEmail] NVARCHAR(120),
    [billingAddress] NVARCHAR(250) NOT NULL,
    [billingCity] NVARCHAR(80) NOT NULL,
    [billingState] NVARCHAR(80) NOT NULL,
    [billingPostalCode] NVARCHAR(12) NOT NULL,
    [billingCountry] NVARCHAR(80) NOT NULL,
    [shippingAddress] NVARCHAR(250),
    [shippingCity] NVARCHAR(80),
    [shippingState] NVARCHAR(80),
    [shippingPostalCode] NVARCHAR(12),
    [shippingCountry] NVARCHAR(80),
    [copyAddressFromBilling] BIT NOT NULL CONSTRAINT [Quotation_copyAddressFromBilling_df] DEFAULT 1,
    [opportunityId] NVARCHAR(50),
    [status] NVARCHAR(30),
    [quotationSubject] NVARCHAR(200),
    [notes] NVARCHAR(2000),
    [termsAndConditions] NVARCHAR(4000),
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Quotation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [Quotation_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    CONSTRAINT [Quotation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Quotation_quotationCode_key] UNIQUE NONCLUSTERED ([quotationCode])
);

-- CreateTable
CREATE TABLE [dbo].[QuotationLineItem] (
    [id] NVARCHAR(50) NOT NULL,
    [quotationId] NVARCHAR(50) NOT NULL,
    [productId] NVARCHAR(50),
    [productName] NVARCHAR(200) NOT NULL,
    [quantity] DECIMAL(18,2) NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [discount] DECIMAL(18,2) NOT NULL CONSTRAINT [QuotationLineItem_discount_df] DEFAULT 0,
    [discountType] NVARCHAR(10) NOT NULL CONSTRAINT [QuotationLineItem_discountType_df] DEFAULT 'percentage',
    [salePrice] DECIMAL(18,2) NOT NULL CONSTRAINT [QuotationLineItem_salePrice_df] DEFAULT 0,
    [taxRate] NVARCHAR(20) NOT NULL,
    [taxAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [QuotationLineItem_taxAmount_df] DEFAULT 0,
    [total] DECIMAL(18,2) NOT NULL CONSTRAINT [QuotationLineItem_total_df] DEFAULT 0,
    [description] NVARCHAR(2000),
    [note] NVARCHAR(2000),
    [sortOrder] INT NOT NULL CONSTRAINT [QuotationLineItem_sortOrder_df] DEFAULT 0,
    CONSTRAINT [QuotationLineItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Ticket] (
    [id] NVARCHAR(50) NOT NULL,
    [ticketNumber] NVARCHAR(20) NOT NULL,
    [amcFlag] BIT NOT NULL CONSTRAINT [Ticket_amcFlag_df] DEFAULT 0,
    [cloudFlag] BIT NOT NULL CONSTRAINT [Ticket_cloudFlag_df] DEFAULT 0,
    [ticketSubject] NVARCHAR(200),
    [organizationName] NVARCHAR(200) NOT NULL,
    [organizationId] NVARCHAR(50),
    [contactPersonName] NVARCHAR(100) NOT NULL,
    [contactId] NVARCHAR(50),
    [contactNumber] NVARCHAR(10),
    [contactEmail] NVARCHAR(120),
    [ticketPriority] NVARCHAR(20) NOT NULL,
    [source] NVARCHAR(20) NOT NULL CONSTRAINT [Ticket_source_df] DEFAULT 'Call',
    [supportType] NVARCHAR(20) NOT NULL CONSTRAINT [Ticket_supportType_df] DEFAULT 'Free',
    [supportMode] NVARCHAR(50) NOT NULL,
    [natureOfCall] NVARCHAR(100) NOT NULL,
    [ticketStatus] NVARCHAR(30) NOT NULL CONSTRAINT [Ticket_ticketStatus_df] DEFAULT 'New',
    [dueDate] DATETIME2 NOT NULL,
    [problemReported] NVARCHAR(2000) NOT NULL,
    [problemObserved] NVARCHAR(2000),
    [resolution] NVARCHAR(2000),
    [reasonForEscalatedCalls] NVARCHAR(2000),
    [rca] NVARCHAR(2000),
    [addDescription] NVARCHAR(2000),
    [accountAddress] NVARCHAR(250),
    [leftJob] NVARCHAR(3) NOT NULL CONSTRAINT [Ticket_leftJob_df] DEFAULT 'No',
    [assignedTo] NVARCHAR(50) NOT NULL,
    [partnerCompany] NVARCHAR(200),
    [partnerCompanyContact] NVARCHAR(100),
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Ticket_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [Ticket_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    CONSTRAINT [Ticket_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Ticket_ticketNumber_key] UNIQUE NONCLUSTERED ([ticketNumber])
);

-- CreateTable
CREATE TABLE [dbo].[NatureOfCall] (
    [id] NVARCHAR(50) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [priority] NVARCHAR(10) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [NatureOfCall_isActive_df] DEFAULT 1,
    [sortOrder] INT NOT NULL CONSTRAINT [NatureOfCall_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [NatureOfCall_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [NatureOfCall_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [NatureOfCall_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[PartnerCompany] (
    [id] NVARCHAR(50) NOT NULL,
    [companyName] NVARCHAR(200) NOT NULL,
    [natureOfPartner] NVARCHAR(100),
    [phone] NVARCHAR(15),
    [email] NVARCHAR(120),
    [city] NVARCHAR(80),
    [billingCountry] NVARCHAR(80),
    [assignedTo] NVARCHAR(50),
    [isActive] BIT NOT NULL CONSTRAINT [PartnerCompany_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PartnerCompany_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PartnerCompany_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PartnerCompany_companyName_key] UNIQUE NONCLUSTERED ([companyName])
);

-- CreateTable
CREATE TABLE [dbo].[PartnerCompanyContact] (
    [id] NVARCHAR(50) NOT NULL,
    [partnerCompanyId] NVARCHAR(50) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [designation] NVARCHAR(100),
    [mobile] NVARCHAR(15),
    [officePhone] NVARCHAR(15),
    [email] NVARCHAR(120),
    [location] NVARCHAR(80),
    [isActive] BIT NOT NULL CONSTRAINT [PartnerCompanyContact_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PartnerCompanyContact_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PartnerCompanyContact_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Country] (
    [iso2Code] NVARCHAR(2) NOT NULL,
    [iso3Code] NVARCHAR(3) NOT NULL,
    [countryName] NVARCHAR(100) NOT NULL,
    [numericCode] INT NOT NULL,
    CONSTRAINT [Country_pkey] PRIMARY KEY CLUSTERED ([iso2Code])
);

-- CreateTable
CREATE TABLE [dbo].[Subdivision] (
    [subdivisionCode] NVARCHAR(10) NOT NULL,
    [countryIso2] NVARCHAR(2) NOT NULL,
    [subdivisionName] NVARCHAR(150) NOT NULL,
    [subdivisionType] NVARCHAR(60) NOT NULL,
    CONSTRAINT [Subdivision_pkey] PRIMARY KEY CLUSTERED ([subdivisionCode])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLog] (
    [id] NVARCHAR(50) NOT NULL,
    [entityType] NVARCHAR(30) NOT NULL,
    [entityId] NVARCHAR(50) NOT NULL,
    [action] NVARCHAR(30) NOT NULL,
    [changedBy] NVARCHAR(50) NOT NULL,
    [changesJson] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Organization_organizationName_idx] ON [dbo].[Organization]([organizationName]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Organization_accountStatus_idx] ON [dbo].[Organization]([accountStatus]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Organization_assignedUser_idx] ON [dbo].[Organization]([assignedUser]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Organization_gstNo_idx] ON [dbo].[Organization]([gstNo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Organization_isDeleted_createdAt_idx] ON [dbo].[Organization]([isDeleted], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EntityEmail_organizationId_idx] ON [dbo].[EntityEmail]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EntityEmail_contactId_idx] ON [dbo].[EntityEmail]([contactId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EntityEmail_leadId_idx] ON [dbo].[EntityEmail]([leadId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EntityEmail_email_idx] ON [dbo].[EntityEmail]([email]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contact_organizationId_idx] ON [dbo].[Contact]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contact_mobile_idx] ON [dbo].[Contact]([mobile]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contact_name_idx] ON [dbo].[Contact]([name]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contact_assignedTo_idx] ON [dbo].[Contact]([assignedTo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contact_isDeleted_createdAt_idx] ON [dbo].[Contact]([isDeleted], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Lead_status_idx] ON [dbo].[Lead]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Lead_assignedTo_idx] ON [dbo].[Lead]([assignedTo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Lead_mobile_idx] ON [dbo].[Lead]([mobile]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Lead_nextFollowupDate_idx] ON [dbo].[Lead]([nextFollowupDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Lead_isDeleted_createdAt_idx] ON [dbo].[Lead]([isDeleted], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Product_productName_idx] ON [dbo].[Product]([productName]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Product_category_idx] ON [dbo].[Product]([category]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Product_isDeleted_createdAt_idx] ON [dbo].[Product]([isDeleted], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Opportunity_organizationId_idx] ON [dbo].[Opportunity]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Opportunity_contactId_idx] ON [dbo].[Opportunity]([contactId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Opportunity_salesStage_idx] ON [dbo].[Opportunity]([salesStage]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Opportunity_assignedTo_idx] ON [dbo].[Opportunity]([assignedTo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Opportunity_nextFollowupDate_idx] ON [dbo].[Opportunity]([nextFollowupDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Opportunity_isDeleted_createdAt_idx] ON [dbo].[Opportunity]([isDeleted], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OpportunityLineItem_opportunityId_idx] ON [dbo].[OpportunityLineItem]([opportunityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OpportunityLineItem_productId_idx] ON [dbo].[OpportunityLineItem]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Quotation_opportunityId_idx] ON [dbo].[Quotation]([opportunityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Quotation_organizationId_idx] ON [dbo].[Quotation]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Quotation_quoteStage_idx] ON [dbo].[Quotation]([quoteStage]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Quotation_assignedTo_idx] ON [dbo].[Quotation]([assignedTo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Quotation_isDeleted_createdAt_idx] ON [dbo].[Quotation]([isDeleted], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [QuotationLineItem_quotationId_idx] ON [dbo].[QuotationLineItem]([quotationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [QuotationLineItem_productId_idx] ON [dbo].[QuotationLineItem]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Ticket_ticketStatus_idx] ON [dbo].[Ticket]([ticketStatus]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Ticket_ticketPriority_idx] ON [dbo].[Ticket]([ticketPriority]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Ticket_assignedTo_idx] ON [dbo].[Ticket]([assignedTo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Ticket_dueDate_idx] ON [dbo].[Ticket]([dueDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Ticket_organizationId_idx] ON [dbo].[Ticket]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Ticket_isDeleted_createdAt_idx] ON [dbo].[Ticket]([isDeleted], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PartnerCompanyContact_partnerCompanyId_idx] ON [dbo].[PartnerCompanyContact]([partnerCompanyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Subdivision_countryIso2_idx] ON [dbo].[Subdivision]([countryIso2]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_entityType_entityId_createdAt_idx] ON [dbo].[AuditLog]([entityType], [entityId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_changedBy_idx] ON [dbo].[AuditLog]([changedBy]);

-- CreateIndex
ALTER TABLE [dbo].[Users] ADD CONSTRAINT [Users_Username_key] UNIQUE NONCLUSTERED ([Username]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Users_email_idx] ON [dbo].[Users]([email]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Users_isActive_idx] ON [dbo].[Users]([isActive]);

-- AddForeignKey
ALTER TABLE [dbo].[Organization] ADD CONSTRAINT [Organization_parentOrganizationId_fkey] FOREIGN KEY ([parentOrganizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EntityEmail] ADD CONSTRAINT [EntityEmail_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EntityEmail] ADD CONSTRAINT [EntityEmail_contactId_fkey] FOREIGN KEY ([contactId]) REFERENCES [dbo].[Contact]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EntityEmail] ADD CONSTRAINT [EntityEmail_leadId_fkey] FOREIGN KEY ([leadId]) REFERENCES [dbo].[Lead]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Contact] ADD CONSTRAINT [Contact_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Lead] ADD CONSTRAINT [Lead_convertedOrganizationId_fkey] FOREIGN KEY ([convertedOrganizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Lead] ADD CONSTRAINT [Lead_convertedContactId_fkey] FOREIGN KEY ([convertedContactId]) REFERENCES [dbo].[Contact]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Lead] ADD CONSTRAINT [Lead_convertedOpportunityId_fkey] FOREIGN KEY ([convertedOpportunityId]) REFERENCES [dbo].[Opportunity]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Opportunity] ADD CONSTRAINT [Opportunity_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Opportunity] ADD CONSTRAINT [Opportunity_contactId_fkey] FOREIGN KEY ([contactId]) REFERENCES [dbo].[Contact]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OpportunityLineItem] ADD CONSTRAINT [OpportunityLineItem_opportunityId_fkey] FOREIGN KEY ([opportunityId]) REFERENCES [dbo].[Opportunity]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OpportunityLineItem] ADD CONSTRAINT [OpportunityLineItem_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Quotation] ADD CONSTRAINT [Quotation_opportunityId_fkey] FOREIGN KEY ([opportunityId]) REFERENCES [dbo].[Opportunity]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Quotation] ADD CONSTRAINT [Quotation_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Quotation] ADD CONSTRAINT [Quotation_contactId_fkey] FOREIGN KEY ([contactId]) REFERENCES [dbo].[Contact]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[QuotationLineItem] ADD CONSTRAINT [QuotationLineItem_quotationId_fkey] FOREIGN KEY ([quotationId]) REFERENCES [dbo].[Quotation]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[QuotationLineItem] ADD CONSTRAINT [QuotationLineItem_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Ticket] ADD CONSTRAINT [Ticket_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Ticket] ADD CONSTRAINT [Ticket_contactId_fkey] FOREIGN KEY ([contactId]) REFERENCES [dbo].[Contact]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PartnerCompanyContact] ADD CONSTRAINT [PartnerCompanyContact_partnerCompanyId_fkey] FOREIGN KEY ([partnerCompanyId]) REFERENCES [dbo].[PartnerCompany]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Subdivision] ADD CONSTRAINT [Subdivision_countryIso2_fkey] FOREIGN KEY ([countryIso2]) REFERENCES [dbo].[Country]([iso2Code]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
