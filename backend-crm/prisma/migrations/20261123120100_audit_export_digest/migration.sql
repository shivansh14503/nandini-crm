-- Admin › Audit Log exports and ledger digests (docs/database-design.md §4.16a / §4.16b, docs/build-plan.md Phase 11 D).
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[AuditExport] (
    [id] NVARCHAR(50) NOT NULL,
    [requestedBy] NVARCHAR(50) NOT NULL,
    [format] NVARCHAR(10) NOT NULL,
    [filtersJson] NVARCHAR(max) NOT NULL,
    [status] NVARCHAR(20) NOT NULL,
    [rowCount] INT NOT NULL CONSTRAINT [AuditExport_rowCount_df] DEFAULT 0,
    [truncated] BIT NOT NULL CONSTRAINT [AuditExport_truncated_df] DEFAULT 0,
    [fileName] NVARCHAR(200),
    [fileSize] INT,
    [message] NVARCHAR(500),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditExport_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [finishedAt] DATETIME2,
    CONSTRAINT [AuditExport_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AuditDigest] (
    [id] INT NOT NULL IDENTITY(1,1),
    [blockId] BIGINT NOT NULL,
    [hash] NVARCHAR(100) NOT NULL,
    [lastCommitTime] DATETIME2,
    [digestTime] DATETIME2 NOT NULL,
    [digestJson] NVARCHAR(max) NOT NULL,
    [fileName] NVARCHAR(260) NOT NULL,
    [source] NVARCHAR(10) NOT NULL,
    [createdBy] NVARCHAR(50) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditDigest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AuditDigest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditExport_requestedBy_createdAt_idx] ON [dbo].[AuditExport]([requestedBy], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditExport_createdAt_idx] ON [dbo].[AuditExport]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditDigest_createdAt_idx] ON [dbo].[AuditDigest]([createdAt]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

