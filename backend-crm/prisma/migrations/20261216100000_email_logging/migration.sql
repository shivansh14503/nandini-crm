-- Email logging (Calendar Phase 4): emails between enrolled employees and CRM contacts / leads, read from the
-- employee's company mailbox through the admin-managed Google service account / Microsoft app (email-log module).
--
--   LoggedEmail         one email, stored once per RFC Message-ID (sha256 in messageIdHash): headers and a short
--                       plain-text snippet only (never a body, HTML, an attachment or Bcc).
--   LoggedEmailCopy     one employee mailbox that holds it (unique per mailbox message); CASCADE from LoggedEmail.
--   LoggedEmailLink     the CRM records it shows on (contacts | leads | opportunities); CASCADE from LoggedEmail.
--   LoggedEmailMailbox  per employee: the admin's switch (mode) and the ingestion state (cursor, health, lease).
--
-- Hand-written (Prisma can't model filtered indexes; keep it out of schema.prisma):
--   UX_LoggedEmail_messageIdHash (messageIdHash) WHERE messageIdHash IS NOT NULL
-- Two employees on one thread are logged by two concurrent runs: this index decides which insert wins (D45: the loser
-- catches the unique error outside any transaction and reads the winner's row).
--
-- New tables only; no existing data changes. The company switch lives in ModuleSetting activities/emailLogging (no
-- row = off). Must sort after every earlier migration (20261215100000_activity_conference on main; recurring
-- activities 20261215110000 and P2-8 20261216090000 in open PRs).
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[LoggedEmail] (
    [id] NVARCHAR(50) NOT NULL,
    [messageIdHash] NVARCHAR(64),
    [threadId] NVARCHAR(200),
    [subject] NVARCHAR(300) NOT NULL,
    [fromEmail] NVARCHAR(254) NOT NULL,
    [fromName] NVARCHAR(200),
    [toJson] NVARCHAR(4000) NOT NULL,
    [ccJson] NVARCHAR(4000) NOT NULL,
    [moreRecipients] INT NOT NULL CONSTRAINT [LoggedEmail_moreRecipients_df] DEFAULT 0,
    [sentAt] DATETIME2 NOT NULL,
    [direction] NVARCHAR(3) NOT NULL,
    [snippet] NVARCHAR(500),
    [hasAttachments] BIT NOT NULL CONSTRAINT [LoggedEmail_hasAttachments_df] DEFAULT 0,
    [provider] NVARCHAR(30) NOT NULL,
    [ownerUsername] NVARCHAR(50) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LoggedEmail_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [LoggedEmail_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[LoggedEmailCopy] (
    [id] NVARCHAR(50) NOT NULL,
    [emailId] NVARCHAR(50) NOT NULL,
    [username] NVARCHAR(50) NOT NULL,
    [provider] NVARCHAR(30) NOT NULL,
    [providerMessageId] NVARCHAR(300) NOT NULL,
    [providerThreadId] NVARCHAR(200),
    [webLink] NVARCHAR(1000),
    [direction] NVARCHAR(3) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LoggedEmailCopy_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [LoggedEmailCopy_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [LoggedEmailCopy_username_providerMessageId_key] UNIQUE NONCLUSTERED ([username],[providerMessageId])
);

-- CreateTable
CREATE TABLE [dbo].[LoggedEmailLink] (
    [id] NVARCHAR(50) NOT NULL,
    [emailId] NVARCHAR(50) NOT NULL,
    [module] NVARCHAR(20) NOT NULL,
    [recordId] NVARCHAR(50) NOT NULL,
    [matchedEmail] NVARCHAR(120),
    [sentAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LoggedEmailLink_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [LoggedEmailLink_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [LoggedEmailLink_emailId_module_recordId_key] UNIQUE NONCLUSTERED ([emailId],[module],[recordId])
);

-- CreateTable
CREATE TABLE [dbo].[LoggedEmailMailbox] (
    [username] NVARCHAR(50) NOT NULL,
    [mode] NVARCHAR(10),
    [modeUpdatedBy] NVARCHAR(50),
    [modeUpdatedAt] DATETIME2,
    [provider] NVARCHAR(30),
    [accountEmail] NVARCHAR(254),
    [cursorJson] NVARCHAR(max),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [LoggedEmailMailbox_status_df] DEFAULT 'idle',
    [errorLevel] NVARCHAR(10),
    [lastErrorCode] NVARCHAR(50),
    [lastErrorMessage] NVARCHAR(300),
    [lastErrorAt] DATETIME2,
    [consecutiveFailures] INT NOT NULL CONSTRAINT [LoggedEmailMailbox_consecutiveFailures_df] DEFAULT 0,
    [lastRunAt] DATETIME2,
    [lastSuccessAt] DATETIME2,
    [nextRunAt] DATETIME2,
    [loggedCount] INT NOT NULL CONSTRAINT [LoggedEmailMailbox_loggedCount_df] DEFAULT 0,
    [leaseId] NVARCHAR(50),
    [leaseUntil] DATETIME2,
    [purgedAt] DATETIME2,
    [purgedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LoggedEmailMailbox_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [LoggedEmailMailbox_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [LoggedEmailMailbox_pkey] PRIMARY KEY CLUSTERED ([username])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LoggedEmail_sentAt_idx] ON [dbo].[LoggedEmail]([sentAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LoggedEmail_ownerUsername_idx] ON [dbo].[LoggedEmail]([ownerUsername]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LoggedEmailCopy_emailId_idx] ON [dbo].[LoggedEmailCopy]([emailId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LoggedEmailLink_module_recordId_sentAt_idx] ON [dbo].[LoggedEmailLink]([module], [recordId], [sentAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LoggedEmailMailbox_status_nextRunAt_idx] ON [dbo].[LoggedEmailMailbox]([status], [nextRunAt]);

-- CreateIndex (hand-written, filtered)
EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_LoggedEmail_messageIdHash] ON [dbo].[LoggedEmail]([messageIdHash])
    WHERE [messageIdHash] IS NOT NULL;');

-- AddForeignKey
ALTER TABLE [dbo].[LoggedEmailCopy] ADD CONSTRAINT [LoggedEmailCopy_emailId_fkey] FOREIGN KEY ([emailId]) REFERENCES [dbo].[LoggedEmail]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LoggedEmailLink] ADD CONSTRAINT [LoggedEmailLink_emailId_fkey] FOREIGN KEY ([emailId]) REFERENCES [dbo].[LoggedEmail]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

