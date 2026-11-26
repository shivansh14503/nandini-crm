-- Calendar sync: admins connect the company calendars (Calendar Phase 2, P2-2b). Replaces P2-2's per-user OAuth.
-- Google Workspace is reached through one service account with domain-wide delegation, Microsoft 365 through one
-- Entra app with application permissions. No access or refresh token is stored anywhere any more: CalendarConnection
-- becomes per-user sync state (enrolled automatically, no tokens), and CalendarSyncUser holds the admin's per-person
-- choices (provider override, exclusion, P2-8 import switch).
--
-- What this does to existing data (safe even when rows exist; none are expected in production yet):
--   1. Live P2-2 connections (active / reauth_required / error) are stopped with reason 'oauth_retired' and their
--      sealed tokens are cleared before the token columns are dropped. Disconnected rows become 'stopped' (their reason
--      is kept). Stopped rows are kept for link history; an 'oauth_retired' row is never reactivated.
--      Google grants made by test users during P2-2 stay listed in their Google accounts; anyone who cares can remove
--      them at myaccount.google.com › Security › Third-party access (or delete the old OAuth client in Cloud console).
--   2. The Google provider row's stored OAuth client (id + secret) is cleared and the provider switched off: an OAuth
--      client secret is useless for a service account. An admin uploads the service account key instead.
--   3. The Microsoft provider row keeps its client id, secret and tenant (the same Entra app values; only the
--      permission type changes), but is switched off with an empty domain list, so an admin re-tests it and turns it on
--      deliberately.
--   4. Old 'calendar_reconnect' notifications are deleted (the kind is retired; admins get 'calendar_sync_issue').
--   5. UX_Users_email and the Users.email guard from 20261127090000_calendar_connections are unchanged.
--
-- Hand-written (Prisma can't model filtered indexes; named in schema.prisma, keep them out of it):
--   dropped  UX_CalendarConnection_user_kind (username, kind)       WHERE status IN ('active','reauth_required','error')
--   dropped  UX_CalendarConnection_account   (provider, accountId)  WHERE status IN ('active','reauth_required','error')
--   created  UX_CalendarConnection_user      (username)              WHERE status IN ('pending','ok','error')
--   created  UX_CalendarConnection_mailbox   (provider, accountEmail) WHERE status IN ('pending','ok','error')
-- Renamed with sp_rename so their data is kept: connectedAt → enrolledAt, disconnectedAt → stoppedAt,
-- disconnectedBy → stoppedBy (and the default constraint CalendarConnection_connectedAt_df with its column).
-- Statements that touch columns added or renamed in this same batch run through EXEC (SQL Server compiles a batch
-- before running it). String defaults ('pending', 'domain', 'unknown') are plain ASCII.
BEGIN TRY

BEGIN TRAN;

-- ── 1. Retire P2-2's OAuth connections (old column names: they still exist at this point) ──
UPDATE [dbo].[CalendarConnection]
SET [status] = 'stopped', [statusReason] = 'oauth_retired', [disconnectedAt] = SYSUTCDATETIME(), [disconnectedBy] = 'system',
    [accessTokenEnc] = NULL, [accessTokenExpiresAt] = NULL, [refreshTokenEnc] = NULL, [keyId] = NULL, [leaseId] = NULL, [leaseUntil] = NULL
WHERE [status] IN ('active', 'reauth_required', 'error');

UPDATE [dbo].[CalendarConnection]
SET [status] = 'stopped', [accessTokenEnc] = NULL, [accessTokenExpiresAt] = NULL, [refreshTokenEnc] = NULL, [keyId] = NULL
WHERE [status] <> 'stopped';

-- ── 2. Provider rows ──
UPDATE [dbo].[IntegrationProvider]
SET [secretsEnc] = NULL, [keyId] = NULL, [secretHintsJson] = NULL, [clientId] = NULL, [enabled] = 0, [settingsJson] = NULL,
    [clientVersion] = [clientVersion] + 1, [lastTestAt] = NULL, [lastTestOk] = NULL, [lastTestMessage] = NULL, [updatedBy] = 'system'
WHERE [provider] = 'google';

UPDATE [dbo].[IntegrationProvider]
SET [enabled] = 0,
    [settingsJson] = JSON_MODIFY(CASE WHEN ISJSON([settingsJson]) = 1 THEN [settingsJson] ELSE N'{}' END, '$.domains', JSON_QUERY(N'[]')),
    [lastTestAt] = NULL, [lastTestOk] = NULL, [lastTestMessage] = NULL, [updatedBy] = 'system'
WHERE [provider] = 'microsoft';

-- ── 3. Retired notification kind ──
DELETE FROM [dbo].[Notification] WHERE [kind] = 'calendar_reconnect';

-- ── 4. CalendarConnection: drop the OAuth-only indexes and columns ──
DROP INDEX [UX_CalendarConnection_user_kind] ON [dbo].[CalendarConnection];
DROP INDEX [UX_CalendarConnection_account] ON [dbo].[CalendarConnection];
DROP INDEX [CalendarConnection_keyId_idx] ON [dbo].[CalendarConnection];

ALTER TABLE [dbo].[CalendarConnection] DROP CONSTRAINT [CalendarConnection_kind_df];
ALTER TABLE [dbo].[CalendarConnection] DROP CONSTRAINT [CalendarConnection_tokenVersion_df];
ALTER TABLE [dbo].[CalendarConnection] DROP CONSTRAINT [CalendarConnection_importMeetings_df];
ALTER TABLE [dbo].[CalendarConnection] DROP COLUMN [kind], [accountId], [tenantId], [grantedScopes], [clientVersion], [accessTokenEnc],
    [accessTokenExpiresAt], [refreshTokenEnc], [refreshTokenExpiresAt], [keyId], [tokenVersion], [importMeetings];

-- ── 5. Renames (data kept) ──
EXEC sp_rename N'dbo.CalendarConnection.connectedAt', N'enrolledAt', N'COLUMN';
EXEC sp_rename N'dbo.CalendarConnection_connectedAt_df', N'CalendarConnection_enrolledAt_df', N'OBJECT';
EXEC sp_rename N'dbo.CalendarConnection.disconnectedAt', N'stoppedAt', N'COLUMN';
EXEC sp_rename N'dbo.CalendarConnection.disconnectedBy', N'stoppedBy', N'COLUMN';

-- ── 6. New columns and the new status default ──
ALTER TABLE [dbo].[CalendarConnection] ADD [source] NVARCHAR(10) NOT NULL CONSTRAINT [CalendarConnection_source_df] DEFAULT 'domain',
    [lastCheckedAt] DATETIME2,
    [nextCheckAt] DATETIME2,
    [lastErrorMessage] NVARCHAR(300);

ALTER TABLE [dbo].[CalendarConnection] DROP CONSTRAINT [CalendarConnection_status_df];
ALTER TABLE [dbo].[CalendarConnection] ADD CONSTRAINT [CalendarConnection_status_df] DEFAULT 'pending' FOR [status];

-- ── 7. Indexes ──
CREATE NONCLUSTERED INDEX [CalendarConnection_status_nextCheckAt_idx] ON [dbo].[CalendarConnection]([status], [nextCheckAt]);

-- Hand-written: one live row per user, and one live row per provider mailbox.
EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_CalendarConnection_user] ON [dbo].[CalendarConnection]([username])
    WHERE [status] IN (''pending'', ''ok'', ''error'');');
EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [UX_CalendarConnection_mailbox] ON [dbo].[CalendarConnection]([provider], [accountEmail])
    WHERE [status] IN (''pending'', ''ok'', ''error'');');

-- ── 8. CalendarSyncUser (admin choices per person) ──
CREATE TABLE [dbo].[CalendarSyncUser] (
    [username] NVARCHAR(50) NOT NULL,
    [provider] NVARCHAR(30),
    [excluded] BIT NOT NULL CONSTRAINT [CalendarSyncUser_excluded_df] DEFAULT 0,
    [note] NVARCHAR(200),
    [importMeetings] BIT NOT NULL CONSTRAINT [CalendarSyncUser_importMeetings_df] DEFAULT 0,
    [updatedBy] NVARCHAR(50) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CalendarSyncUser_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [CalendarSyncUser_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CalendarSyncUser_pkey] PRIMARY KEY CLUSTERED ([username])
);

-- ── 9. IntegrationProvider: app-level health found while syncing ──
ALTER TABLE [dbo].[IntegrationProvider] ADD [healthStatus] NVARCHAR(10) NOT NULL CONSTRAINT [IntegrationProvider_healthStatus_df] DEFAULT 'unknown',
    [healthCode] NVARCHAR(50),
    [healthAt] DATETIME2;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
