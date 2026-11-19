BEGIN TRY

BEGIN TRAN;

-- The existing switch colors the record drawer: it becomes drawerViewColor (values kept).
ALTER TABLE [dbo].[ModuleScorecard] DROP CONSTRAINT [ModuleScorecard_detailViewColor_df];
EXEC SP_RENAME N'dbo.ModuleScorecard.detailViewColor', N'drawerViewColor', N'COLUMN';
ALTER TABLE [dbo].[ModuleScorecard] ADD CONSTRAINT [ModuleScorecard_drawerViewColor_df] DEFAULT 0 FOR [drawerViewColor];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
