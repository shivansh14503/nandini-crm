-- Calendar connections (Calendar Phase 2, P2-2): each employee's own Google Calendar / Microsoft 365 connection.
-- CalendarConnection holds the OAuth grant (account email and id, granted scopes, sealed access / refresh tokens,
-- status). Tokens are sealed by the app with AES-256-GCM (INTEGRATIONS_ENCRYPTION_KEY, src/services/secretBox.ts)
-- before they reach this table and are nulled on disconnect; rows are kept so a reconnect re-activates them.
-- Nothing is connected by this migration: providers stay off until an admin switches one on (Admin › API
-- Integrations), so nothing changes for users on deploy.
--
-- Users.email (the company email calendar identities are matched on):
--   1. Existing rows are only trimmed and lower-cased; a blank address becomes NULL. No address is changed otherwise.
--   2. A guard stops the migration when two ACTIVE, NON-GROUP users share an address (group / shared logins and
--      inactive users don't count and may reuse one).
--   3. UX_Users_email: unique filtered index on that same rule (database-design §7).
--
-- Before deploying, check for clashes:   npm run calendar:check-emails   (prints the usernames; exit code 1 if any)
-- and fix them on Admin › API Integrations › People. If this migration stops on the guard anyway (THROW 50001),
-- nothing was changed (the transaction rolled back), but Prisma records it as failed and the next deploy stops with
-- P3009. Then fix the users and run, from backend-crm:
--   npx prisma migrate resolve --rolled-back 20261127090000_calendar_connections
-- and deploy again.
--
-- Hand-written (Prisma can't model filtered indexes; named in schema.prisma, keep them out of it):
--   UX_CalendarConnection_user_kind (username, kind)      WHERE status IN ('active','reauth_required','error')
--   UX_CalendarConnection_account   (provider, accountId) WHERE status IN ('active','reauth_required','error')
--   UX_Users_email                  (email)               WHERE email IS NOT NULL AND isActive = 1 AND isGroupUser = 0
-- The default collation compares case-insensitively, so 'A@x' and 'a@x' collide, as intended.
-- String defaults ('calendar', 'active', 'primary') are plain ASCII, so Prisma's literals without N lose nothing.
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[CalendarConnection] (
    [id] NVARCHAR(50) NOT NULL,
    [username] NVARCHAR(50) NOT NULL,
    [provider] NVARCHAR(30) NOT NULL,
    [kind] NVARCHAR(20) NOT NULL CONSTRAINT [CalendarConnection_kind_df] DEFAULT 'calendar',
    [accountEmail] NVARCHAR(254) NOT NULL,
    [accountId] NVARCHAR(200) NOT NULL,
    [tenantId] NVARCHAR(100),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [CalendarConnection_status_df] DEFAULT 'active',
    [statusReason] NVARCHAR(50),
    [grantedScopes] NVARCHAR(1000) NOT NULL,
    [clientVersion] INT NOT NULL,
    [accessTokenEnc] NVARCHAR(max),
    [accessTokenExpiresAt] DATETIME2,
    [refreshTokenEnc] NVARCHAR(max),
    [refreshTokenExpiresAt] DATETIME2,
    [keyId] NVARCHAR(8),
    [tokenVersion] INT NOT NULL CONSTRAINT [CalendarConnection_tokenVersion_df] DEFAULT 0,
    [calendarId] NVARCHAR(200) NOT NULL CONSTRAINT [CalendarConnection_calendarId_df] DEFAULT 'primary',
    [importMeetings] BIT NOT NULL CONSTRAINT [CalendarConnection_importMeetings_df] DEFAULT 0,
    [syncCursor] NVARCHAR(max),
    [syncWindowStart] DATETIME2,
    [syncWindowEnd] DATETIME2,
    [fullSyncAt] DATETIME2,
    [backfilledAt] DATETIME2,
    [backfillCount] INT,
    [lastPulledAt] DATETIME2,
    [lastPushedAt] DATETIME2,
    [lastSuccessAt] DATETIME2,
    [lastErrorAt] DATETIME2,
    [lastErrorCode] NVARCHAR(100),
    [consecutiveFailures] INT NOT NULL CONSTRAINT [CalendarConnection_consecutiveFailures_df] DEFAULT 0,
    [leaseId] NVARCHAR(50),
    [leaseUntil] DATETIME2,
    [connectedAt] DATETIME2 NOT NULL CONSTRAINT [CalendarConnection_connectedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [disconnectedAt] DATETIME2,
    [disconnectedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CalendarConnection_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [CalendarConnection_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CalendarConnection_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CalendarConnection_username_status_idx] ON [dbo].[CalendarConnection]([username], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CalendarConnection_provider_status_idx] ON [dbo].[CalendarConnection]([provider], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CalendarConnection_keyId_idx] ON [dbo].[CalendarConnection]([keyId]);

-- Hand-written: one live connection per user and kind, and per provider account.
CREATE UNIQUE NONCLUSTERED INDEX [UX_CalendarConnection_user_kind] ON [dbo].[CalendarConnection]([username], [kind])
    WHERE [status] IN ('active', 'reauth_required', 'error');

CREATE UNIQUE NONCLUSTERED INDEX [UX_CalendarConnection_account] ON [dbo].[CalendarConnection]([provider], [accountId])
    WHERE [status] IN ('active', 'reauth_required', 'error');

-- Users.email: trim + lower-case, blank → NULL (no other change to existing addresses).
UPDATE [dbo].[Users] SET [email] = NULLIF(LOWER(LTRIM(RTRIM([email]))), '') WHERE [email] IS NOT NULL;

-- Guard: two active, non-group users with one address stop the deploy with a clear message (rolled back below).
IF EXISTS (
    SELECT LOWER([email]) FROM [dbo].[Users]
    WHERE [email] IS NOT NULL AND [isActive] = 1 AND [isGroupUser] = 0
    GROUP BY LOWER([email]) HAVING COUNT(*) > 1
)
    THROW 50001, 'Two active users share an email. Fix them on Admin > API Integrations > People (npm run calendar:check-emails lists them), then run: npx prisma migrate resolve --rolled-back 20261127090000_calendar_connections and deploy again.', 1;

-- Hand-written: company email unique among active, non-group users.
CREATE UNIQUE NONCLUSTERED INDEX [UX_Users_email] ON [dbo].[Users]([email])
    WHERE [email] IS NOT NULL AND [isActive] = 1 AND [isGroupUser] = 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
