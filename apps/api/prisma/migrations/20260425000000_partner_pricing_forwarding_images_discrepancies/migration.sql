-- ============================================================
-- Partenariat tarifaire, conteneurs d'acheminement, galerie d'images,
-- ecarts de bordereau, mass OU volume
-- ============================================================

-- 1. Type client (INDIVIDUAL/COMPANY/PARTNER)
DO $$ BEGIN
  CREATE TYPE "ClientType" AS ENUM ('INDIVIDUAL', 'COMPANY', 'PARTNER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "clientType" "ClientType" NOT NULL DEFAULT 'INDIVIDUAL';

CREATE INDEX IF NOT EXISTS "clients_clientType_idx" ON "clients"("clientType");

-- 2. Tarification partenaire
CREATE TABLE IF NOT EXISTS "partner_pricings" (
  "id" TEXT PRIMARY KEY,
  "clientId" TEXT NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "transitRouteId" TEXT REFERENCES "transit_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "pricePerKg" DECIMAL(15,2) NOT NULL,
  "pricePerVolume" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "partner_pricings_clientId_transitRouteId_key"
  ON "partner_pricings"("clientId", "transitRouteId");
CREATE INDEX IF NOT EXISTS "partner_pricings_clientId_idx" ON "partner_pricings"("clientId");

-- 3. Conteneurs d'acheminement (isForwarding)
ALTER TABLE "containers"
  ADD COLUMN IF NOT EXISTS "isForwarding" BOOLEAN NOT NULL DEFAULT false;

-- 4. Colis : weight nullable (mass OU volume)
ALTER TABLE "parcels"
  ALTER COLUMN "weight" DROP NOT NULL;

-- 5. Galerie d'images de colis
CREATE TABLE IF NOT EXISTS "parcel_images" (
  "id" TEXT PRIMARY KEY,
  "parcelId" TEXT NOT NULL REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "url" TEXT NOT NULL,
  "caption" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "parcel_images_parcelId_idx" ON "parcel_images"("parcelId");

-- 6. ManifestLine : parcelId et weight deviennent nullable
ALTER TABLE "manifest_lines"
  ALTER COLUMN "parcelId" DROP NOT NULL,
  ALTER COLUMN "weight" DROP NOT NULL;

-- 7. Ecarts de bordereau (admin marks discrepancies)
DO $$ BEGIN
  CREATE TYPE "DiscrepancyType" AS ENUM ('MISSING_PHYSICAL', 'EXTRA_PHYSICAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "manifest_discrepancies" (
  "id" TEXT PRIMARY KEY,
  "containerId" TEXT NOT NULL REFERENCES "containers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "parcelId" TEXT REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "type" "DiscrepancyType" NOT NULL,
  "designation" TEXT,
  "trackingNumber" TEXT,
  "weight" DECIMAL(15,3),
  "comment" TEXT,
  "markedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "manifest_discrepancies_containerId_idx" ON "manifest_discrepancies"("containerId");
CREATE INDEX IF NOT EXISTS "manifest_discrepancies_type_idx" ON "manifest_discrepancies"("type");
