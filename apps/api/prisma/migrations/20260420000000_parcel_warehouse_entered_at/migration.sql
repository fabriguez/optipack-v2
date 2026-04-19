-- AddColumn
ALTER TABLE "parcels" ADD COLUMN "warehouseEnteredAt" TIMESTAMP(3);

-- Backfill existing parcels currently in a warehouse
UPDATE "parcels" SET "warehouseEnteredAt" = "createdAt" WHERE "warehouseId" IS NOT NULL;
