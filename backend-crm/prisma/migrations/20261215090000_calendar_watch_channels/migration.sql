-- Calendar sync, webhooks (Calendar Phase 2, P2-7).
-- CalendarWatchChannel: one Google push channel (events.watch) or Microsoft Graph subscription per synced person, so a
-- change made in Google Calendar / Outlook reaches the CRM within seconds instead of at the next poll. Its own table
-- because a Google renewal overlaps two channels for a while (Google has no renew call: a new channel is created, then
-- the old one stopped). No secret column: the Google channel token and the Graph clientState are HMACs derived from
-- INTEGRATIONS_ENCRYPTION_KEY (tokenKeyId names the ring key used). NO ACTION to CalendarConnection (connection rows are
-- never deleted; stopped channels are deleted by the nightly job 30 days after they were created).
-- The table starts empty and nothing creates a channel until PUBLIC_API_URL is https:// and CALENDAR_WEBHOOKS_ENABLED
-- is not false, so nothing changes for users on deploy. No filtered index (nothing hand-written beyond Prisma's output).
-- String default 'active' is plain ASCII, so Prisma's literal without N loses nothing.
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[CalendarWatchChannel] (
    [id] NVARCHAR(64) NOT NULL,
    [connectionId] NVARCHAR(50) NOT NULL,
    [provider] NVARCHAR(30) NOT NULL,
    [externalId] NVARCHAR(200),
    [tokenKeyId] NVARCHAR(8) NOT NULL,
    [generation] INT NOT NULL CONSTRAINT [CalendarWatchChannel_generation_df] DEFAULT 1,
    [expiresAt] DATETIME2 NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [CalendarWatchChannel_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CalendarWatchChannel_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CalendarWatchChannel_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CalendarWatchChannel_connectionId_status_idx] ON [dbo].[CalendarWatchChannel]([connectionId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CalendarWatchChannel_externalId_idx] ON [dbo].[CalendarWatchChannel]([externalId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CalendarWatchChannel_status_expiresAt_idx] ON [dbo].[CalendarWatchChannel]([status], [expiresAt]);

-- AddForeignKey
ALTER TABLE [dbo].[CalendarWatchChannel] ADD CONSTRAINT [CalendarWatchChannel_connectionId_fkey] FOREIGN KEY ([connectionId]) REFERENCES [dbo].[CalendarConnection]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

