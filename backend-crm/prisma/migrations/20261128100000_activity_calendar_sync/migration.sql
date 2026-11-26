-- Calendar sync, CRM → calendar push (Calendar Phase 2, P2-3b).
-- ActivityExternalLink: one Activity as seen in one connected calendar (the provider's event id, etag, the two-sided
-- base of the last sync) and the durable push outbox (`dirtyAt`, set inside the activity's own transaction, cleared by
-- the push job with compare-and-set). Owned by its activity (ON DELETE CASCADE); NO ACTION to CalendarConnection, whose
-- rows are kept when stopped (their links become 'detached').
-- Activity gains the calendar identity of its event (iCalUid, syncKey = sha256(iCalUid + '|')), the organizer columns
-- of meetings imported from a calendar (used from P2-8) and externalUpdatedAt. Existing rows get NULL / 0: nothing is
-- linked by this migration, and nothing is pushed until an admin switches a provider on and a user's calendar is
-- enrolled (a live CalendarConnection row), so nothing changes for users on deploy.
--
-- Hand-written (Prisma can't model filtered indexes; named in schema.prisma, keep them out of it):
--   UX_ActivityExternalLink_event (connectionId, externalEventKey) WHERE externalEventKey IS NOT NULL
--   UX_Activity_syncKey           (syncKey)                        WHERE syncKey IS NOT NULL  (soft-deleted rows too)
-- Both index sha256 hex keys (64 chars): the raw provider event id / iCalUID can be up to 1,024 characters, and an index
-- on NVARCHAR(1024) would exceed SQL Server's 1,700-byte key limit.
-- String defaults ('organizer', 'pending', 'send') are plain ASCII, so Prisma's literals without N lose nothing.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Activity] ADD [externalOrganizer] BIT NOT NULL CONSTRAINT [Activity_externalOrganizer_df] DEFAULT 0,
[externalUpdatedAt] DATETIME2,
[iCalUid] NVARCHAR(1024),
[organizerEmail] NVARCHAR(254),
[organizerName] NVARCHAR(200),
[syncKey] NVARCHAR(64);

-- CreateTable
CREATE TABLE [dbo].[ActivityExternalLink] (
    [id] NVARCHAR(50) NOT NULL,
    [activityId] NVARCHAR(50) NOT NULL,
    [connectionId] NVARCHAR(50) NOT NULL,
    [provider] NVARCHAR(30) NOT NULL,
    [role] NVARCHAR(10) NOT NULL CONSTRAINT [ActivityExternalLink_role_df] DEFAULT 'organizer',
    [state] NVARCHAR(20) NOT NULL CONSTRAINT [ActivityExternalLink_state_df] DEFAULT 'pending',
    [invites] NVARCHAR(10) NOT NULL CONSTRAINT [ActivityExternalLink_invites_df] DEFAULT 'send',
    [heldAttendeesJson] NVARCHAR(max),
    [generation] INT NOT NULL CONSTRAINT [ActivityExternalLink_generation_df] DEFAULT 0,
    [requestedId] NVARCHAR(64) NOT NULL,
    [externalEventId] NVARCHAR(1024),
    [externalEventKey] NVARCHAR(64),
    [iCalUid] NVARCHAR(1024),
    [etag] NVARCHAR(200),
    [htmlLink] NVARCHAR(2000),
    [providerUpdatedAt] DATETIME2,
    [baseJson] NVARCHAR(max),
    [crmSyncedAt] DATETIME2,
    [dirtyAt] DATETIME2,
    [nextAttemptAt] DATETIME2,
    [attempts] INT NOT NULL CONSTRAINT [ActivityExternalLink_attempts_df] DEFAULT 0,
    [lastErrorCode] NVARCHAR(100),
    [lastErrorMessage] NVARCHAR(300),
    [lastWarning] NVARCHAR(500),
    [lastConflictAt] DATETIME2,
    [lastSyncedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ActivityExternalLink_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ActivityExternalLink_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ActivityExternalLink_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ActivityExternalLink_activityId_connectionId_key] UNIQUE NONCLUSTERED ([activityId],[connectionId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ActivityExternalLink_connectionId_state_idx] ON [dbo].[ActivityExternalLink]([connectionId], [state]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ActivityExternalLink_dirtyAt_nextAttemptAt_idx] ON [dbo].[ActivityExternalLink]([dirtyAt], [nextAttemptAt]);

-- Hand-written: one link per provider event and connection (the key is sha256 of the provider's event id).
CREATE UNIQUE NONCLUSTERED INDEX [UX_ActivityExternalLink_event] ON [dbo].[ActivityExternalLink]([connectionId], [externalEventKey])
    WHERE [externalEventKey] IS NOT NULL;

-- Hand-written: one activity per calendar event identity (soft-deleted rows included, so a meeting removed from the
-- CRM is never imported again). The column is new in this batch, so the index is compiled separately.
EXEC sp_executesql N'
CREATE UNIQUE NONCLUSTERED INDEX [UX_Activity_syncKey] ON [dbo].[Activity]([syncKey])
    WHERE [syncKey] IS NOT NULL;
';

-- AddForeignKey
ALTER TABLE [dbo].[ActivityExternalLink] ADD CONSTRAINT [ActivityExternalLink_activityId_fkey] FOREIGN KEY ([activityId]) REFERENCES [dbo].[Activity]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ActivityExternalLink] ADD CONSTRAINT [ActivityExternalLink_connectionId_fkey] FOREIGN KEY ([connectionId]) REFERENCES [dbo].[CalendarConnection]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
