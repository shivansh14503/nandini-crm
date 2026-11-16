BEGIN TRY

BEGIN TRAN;

-- CreateTable: city suggestions for address forms (addresses keep the city as free text).
CREATE TABLE [dbo].[City] (
    [id] INT NOT NULL IDENTITY(1,1),
    [countryIso2] NVARCHAR(2) NOT NULL,
    [subdivisionCode] NVARCHAR(10),
    [cityName] NVARCHAR(150) NOT NULL,
    [searchName] NVARCHAR(150) NOT NULL,
    CONSTRAINT [City_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [City_countryIso2_searchName_idx] ON [dbo].[City]([countryIso2], [searchName]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [City_subdivisionCode_searchName_idx] ON [dbo].[City]([subdivisionCode], [searchName]);

-- AddForeignKey
ALTER TABLE [dbo].[City] ADD CONSTRAINT [City_countryIso2_fkey] FOREIGN KEY ([countryIso2]) REFERENCES [dbo].[Country]([iso2Code]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[City] ADD CONSTRAINT [City_subdivisionCode_fkey] FOREIGN KEY ([subdivisionCode]) REFERENCES [dbo].[Subdivision]([subdivisionCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
