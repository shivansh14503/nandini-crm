BEGIN TRY

BEGIN TRAN;

-- Data: spell ā / Ā as a plain a in stored state names (Haryāna → Haryana, Karnātaka → Karnataka), matching the
-- address master the forms now use, and in the Subdivision master itself. Other accents are kept. The binary
-- collation makes REPLACE match only the macron letter, never a plain a.
UPDATE [dbo].[Organization] SET [billingState] = REPLACE(REPLACE([billingState] COLLATE Latin1_General_100_BIN2, N'ā', N'a'), N'Ā', N'A') WHERE [billingState] COLLATE Latin1_General_100_BIN2 LIKE N'%[āĀ]%';
UPDATE [dbo].[Organization] SET [shippingState] = REPLACE(REPLACE([shippingState] COLLATE Latin1_General_100_BIN2, N'ā', N'a'), N'Ā', N'A') WHERE [shippingState] COLLATE Latin1_General_100_BIN2 LIKE N'%[āĀ]%';
UPDATE [dbo].[Lead] SET [primaryState] = REPLACE(REPLACE([primaryState] COLLATE Latin1_General_100_BIN2, N'ā', N'a'), N'Ā', N'A') WHERE [primaryState] COLLATE Latin1_General_100_BIN2 LIKE N'%[āĀ]%';
UPDATE [dbo].[Lead] SET [otherState] = REPLACE(REPLACE([otherState] COLLATE Latin1_General_100_BIN2, N'ā', N'a'), N'Ā', N'A') WHERE [otherState] COLLATE Latin1_General_100_BIN2 LIKE N'%[āĀ]%';
UPDATE [dbo].[Quotation] SET [billingState] = REPLACE(REPLACE([billingState] COLLATE Latin1_General_100_BIN2, N'ā', N'a'), N'Ā', N'A') WHERE [billingState] COLLATE Latin1_General_100_BIN2 LIKE N'%[āĀ]%';
UPDATE [dbo].[Quotation] SET [shippingState] = REPLACE(REPLACE([shippingState] COLLATE Latin1_General_100_BIN2, N'ā', N'a'), N'Ā', N'A') WHERE [shippingState] COLLATE Latin1_General_100_BIN2 LIKE N'%[āĀ]%';
UPDATE [dbo].[PartnerCompany] SET [billingState] = REPLACE(REPLACE([billingState] COLLATE Latin1_General_100_BIN2, N'ā', N'a'), N'Ā', N'A') WHERE [billingState] COLLATE Latin1_General_100_BIN2 LIKE N'%[āĀ]%';
UPDATE [dbo].[PartnerCompany] SET [shippingState] = REPLACE(REPLACE([shippingState] COLLATE Latin1_General_100_BIN2, N'ā', N'a'), N'Ā', N'A') WHERE [shippingState] COLLATE Latin1_General_100_BIN2 LIKE N'%[āĀ]%';
UPDATE [dbo].[Subdivision] SET [subdivisionName] = REPLACE(REPLACE([subdivisionName] COLLATE Latin1_General_100_BIN2, N'ā', N'a'), N'Ā', N'A') WHERE [subdivisionName] COLLATE Latin1_General_100_BIN2 LIKE N'%[āĀ]%';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
