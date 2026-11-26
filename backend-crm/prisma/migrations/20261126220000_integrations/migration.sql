-- Admin › API Integrations (Calendar Phase 2, P2-1): one row per external provider (google, microsoft, zoom) with the
-- company's OAuth client id, its sealed client secret (and, for Zoom, webhook secret), non-secret hints (last 4
-- characters, who changed it and when, expiry date), provider settings, and the last "Test connection" result.
-- Secrets are sealed by the app with AES-256-GCM (INTEGRATIONS_ENCRYPTION_KEY, src/services/secretBox.ts) before they
-- reach this table; nothing here is readable without that key.
--
-- New table only: no existing table or row is changed, and every provider starts switched off (no row = not set up),
-- so nothing changes for users until an admin enables a provider.
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[IntegrationProvider] (
    [provider] NVARCHAR(30) NOT NULL,
    [enabled] BIT NOT NULL CONSTRAINT [IntegrationProvider_enabled_df] DEFAULT 0,
    [clientId] NVARCHAR(200),
    [secretsEnc] NVARCHAR(max),
    [keyId] NVARCHAR(8),
    [secretHintsJson] NVARCHAR(max),
    [settingsJson] NVARCHAR(max),
    [clientVersion] INT NOT NULL CONSTRAINT [IntegrationProvider_clientVersion_df] DEFAULT 1,
    [lastTestAt] DATETIME2,
    [lastTestOk] BIT,
    [lastTestMessage] NVARCHAR(300),
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [IntegrationProvider_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [IntegrationProvider_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [IntegrationProvider_pkey] PRIMARY KEY CLUSTERED ([provider])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

