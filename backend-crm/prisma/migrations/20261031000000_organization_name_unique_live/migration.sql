-- Live organization names are unique (SQL Server's default collation compares case-insensitively).
-- A filtered index is used instead of Prisma's @unique so soft-deleted organizations (isDeleted = 1)
-- don't block re-creating the same name. NOTE: Prisma cannot model filtered indexes; keep this index
-- out of schema.prisma and re-check `prisma migrate diff` output after future migrations.
--
-- Fails if live duplicates already exist. Find them with:
--   SELECT organizationName, COUNT(*) FROM [dbo].[Organization]
--   WHERE isDeleted = 0 GROUP BY organizationName HAVING COUNT(*) > 1;
BEGIN TRY

BEGIN TRAN;

CREATE UNIQUE NONCLUSTERED INDEX [Organization_organizationName_live_key]
ON [dbo].[Organization]([organizationName])
WHERE [isDeleted] = 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
