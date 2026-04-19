-- DropColumn
ALTER TABLE "warehouses" DROP COLUMN "type",
DROP COLUMN "maxCapacity",
DROP COLUMN "currentOccupancy";

-- DropEnum
DROP TYPE "WarehouseType";
