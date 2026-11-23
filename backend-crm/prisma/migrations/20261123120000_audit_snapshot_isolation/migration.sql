-- Admin › Audit Log "Verify integrity" (docs/build-plan.md Phase 11 D): sys.sp_verify_database_ledger reads the ledger
-- under snapshot isolation and refuses to run without it. Snapshot isolation only has to be *allowed*: it costs nothing
-- until a session asks for it (row versions are kept in tempdb only while a snapshot transaction is open), and the
-- default READ COMMITTED behaviour of every other query is unchanged. Already on in Azure SQL Database.
-- ALTER DATABASE can't run inside a transaction, so this migration has no BEGIN TRAN; running it again is harmless.
ALTER DATABASE CURRENT SET ALLOW_SNAPSHOT_ISOLATION ON;
