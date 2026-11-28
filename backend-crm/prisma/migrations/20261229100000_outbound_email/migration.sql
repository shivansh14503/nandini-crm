-- Admin › Email (CRM-121): the email queue and log (EmailLog gains the queue columns), the Outbound Email settings row
-- and editable email templates. Existing EmailLog rows keep their values; the new columns are nullable.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[EmailLog] ADD
    [templateKey] NVARCHAR(40) NULL,
    [fromEmail] NVARCHAR(120) NULL,
    [provider] NVARCHAR(20) NULL,
    [bodyEnc] NVARCHAR(MAX) NULL,
    [nextAttemptAt] DATETIME2 NULL,
    [lastAttemptAt] DATETIME2 NULL;

CREATE NONCLUSTERED INDEX [EmailLog_status_nextAttemptAt_idx] ON [dbo].[EmailLog]([status], [nextAttemptAt]);

CREATE TABLE [dbo].[OutboundEmailSetting] (
    [id] INT NOT NULL,
    [provider] NVARCHAR(20) NOT NULL CONSTRAINT [OutboundEmailSetting_provider_df] DEFAULT 'gmail',
    [enabled] BIT NOT NULL CONSTRAINT [OutboundEmailSetting_enabled_df] DEFAULT 0,
    [senderEmail] NVARCHAR(120),
    [senderName] NVARCHAR(120),
    [replyTo] NVARCHAR(120),
    [dailyLimit] INT NOT NULL CONSTRAINT [OutboundEmailSetting_dailyLimit_df] DEFAULT 1500,
    [lastTestAt] DATETIME2,
    [lastTestOk] BIT,
    [lastTestMessage] NVARCHAR(300),
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [OutboundEmailSetting_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [OutboundEmailSetting_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE TABLE [dbo].[EmailTemplate] (
    [key] NVARCHAR(40) NOT NULL,
    [subject] NVARCHAR(200) NOT NULL,
    [heading] NVARCHAR(200) NOT NULL,
    [body] NVARCHAR(MAX) NOT NULL,
    [buttonLabel] NVARCHAR(80),
    [afterButton] NVARCHAR(MAX),
    [footer] NVARCHAR(MAX),
    [updatedBy] NVARCHAR(50),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [EmailTemplate_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [EmailTemplate_pkey] PRIMARY KEY CLUSTERED ([key])
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
