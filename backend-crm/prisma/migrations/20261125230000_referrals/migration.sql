-- Referrals module (All › Referrals): the people who refer business. Leads and opportunities whose Lead Source is CA
-- or Reference now pick their Referred By from active referrals; `referredById` is the link and `referredBy` keeps the
-- referral's name (written through on rename), as organizationName / organizationId do.
--
-- Existing free-text Referred By values are kept exactly as they are, with `referredById` NULL: lists, drawers and
-- forms still show them, and an edit keeps such a value until someone picks a referral for the field. The API only
-- accepts a new Referred By that names a referral (see src/modules/shared/referredBy.ts).
--
-- The only string default ('Active') is plain ASCII, so Prisma's literal without the N prefix loses nothing.
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Referral] (
    [id] NVARCHAR(50) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [organizationName] NVARCHAR(200) NOT NULL,
    [organizationId] NVARCHAR(50),
    [mobile] NVARCHAR(20) NOT NULL,
    [officePhone] NVARCHAR(20),
    [assignedTo] NVARCHAR(50) NOT NULL,
    [designation] NVARCHAR(100),
    [department] NVARCHAR(100),
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [Referral_status_df] DEFAULT 'Active',
    [customDataJson] NVARCHAR(max),
    [createdBy] NVARCHAR(50) NOT NULL,
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Referral_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [Referral_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    CONSTRAINT [Referral_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Referral_organizationId_idx] ON [dbo].[Referral]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Referral_mobile_idx] ON [dbo].[Referral]([mobile]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Referral_name_idx] ON [dbo].[Referral]([name]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Referral_assignedTo_idx] ON [dbo].[Referral]([assignedTo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Referral_status_idx] ON [dbo].[Referral]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Referral_isDeleted_createdAt_idx] ON [dbo].[Referral]([isDeleted], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[Referral] ADD CONSTRAINT [Referral_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- A referral's email addresses live in EntityEmail, as a contact's do.
ALTER TABLE [dbo].[EntityEmail] ADD [referralId] NVARCHAR(50);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EntityEmail_referralId_idx] ON [dbo].[EntityEmail]([referralId]);

-- AddForeignKey
ALTER TABLE [dbo].[EntityEmail] ADD CONSTRAINT [EntityEmail_referralId_fkey] FOREIGN KEY ([referralId]) REFERENCES [dbo].[Referral]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- Referred By links to its referral. Existing rows keep their text and get no link.
ALTER TABLE [dbo].[Lead] ADD [referredById] NVARCHAR(50);
ALTER TABLE [dbo].[Opportunity] ADD [referredById] NVARCHAR(50);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Lead_referredById_idx] ON [dbo].[Lead]([referredById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Opportunity_referredById_idx] ON [dbo].[Opportunity]([referredById]);

-- AddForeignKey
ALTER TABLE [dbo].[Lead] ADD CONSTRAINT [Lead_referredById_fkey] FOREIGN KEY ([referredById]) REFERENCES [dbo].[Referral]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Opportunity] ADD CONSTRAINT [Opportunity_referredById_fkey] FOREIGN KEY ([referredById]) REFERENCES [dbo].[Referral]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
