-- Notifications (Calendar Phase 1, PR3): the navbar bell's rows, one per event and recipient (activity reminders,
-- assignments, invitations, contract renewal reminders), written by the reminders worker and after activity saves.
-- Personal state: never audited, hard-deleted by the nightly retention job (NOTIFICATION_RETENTION_DAYS).
-- dedupeKey is unique so a retried job or a second worker process can't notify twice.
--
-- EmailLog: one row per outgoing email (the 9 AM morning summary today; quotation emails later). A send claims its
-- row first (status 'sending', unique dedupeKey such as 'morning_summary:2026-11-25:palak'), then marks it 'sent' or
-- 'failed'; a failed send is retried by a later run while attempts < 3. Not audited; rows older than
-- EMAIL_LOG_RETENTION_DAYS are deleted nightly.
--
-- New tables only: no existing table or row is changed.
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Notification] (
    [id] NVARCHAR(50) NOT NULL,
    [username] NVARCHAR(50) NOT NULL,
    [kind] NVARCHAR(40) NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [body] NVARCHAR(500),
    [entityModule] NVARCHAR(30),
    [entityId] NVARCHAR(50),
    [dueAt] DATETIME2,
    [actor] NVARCHAR(50),
    [dedupeKey] NVARCHAR(200) NOT NULL,
    [readAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Notification_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Notification_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Notification_dedupeKey_key] UNIQUE NONCLUSTERED ([dedupeKey])
);

-- CreateTable
CREATE TABLE [dbo].[EmailLog] (
    [id] NVARCHAR(50) NOT NULL,
    [kind] NVARCHAR(40) NOT NULL,
    [toUsername] NVARCHAR(50),
    [toEmail] NVARCHAR(120) NOT NULL,
    [subject] NVARCHAR(200) NOT NULL,
    [dedupeKey] NVARCHAR(200) NOT NULL,
    [status] NVARCHAR(20) NOT NULL,
    [error] NVARCHAR(500),
    [messageId] NVARCHAR(250),
    [attempts] INT NOT NULL CONSTRAINT [EmailLog_attempts_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [EmailLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [sentAt] DATETIME2,
    CONSTRAINT [EmailLog_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EmailLog_dedupeKey_key] UNIQUE NONCLUSTERED ([dedupeKey])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Notification_username_readAt_idx] ON [dbo].[Notification]([username], [readAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Notification_username_createdAt_idx] ON [dbo].[Notification]([username], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Notification_createdAt_idx] ON [dbo].[Notification]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmailLog_createdAt_idx] ON [dbo].[EmailLog]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmailLog_kind_createdAt_idx] ON [dbo].[EmailLog]([kind], [createdAt]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
