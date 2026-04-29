-- ============================================================
-- Phase 0 — Audit fixes + tenant-ready
-- 1) Statuts conteneur reduits a 5 (ARRIVED/UNLOADING -> RECEIVED)
-- 2) Destination structuree (destinationAgencyId + destinationAddress)
-- 3) ParcelCategory + isFragile + isHazardous + declaredValue
-- 4) Invoice 1:N Parcel (drop unique sur invoiceId)
-- 5) Container.organizationId + @@unique([orgId, designation])
-- 6) Parcel.organizationId
-- 7) Organization branding + modules + slug + supportEmail
-- ============================================================

-- 7. Organization : branding + modules + slug + supportEmail
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "primaryColor" TEXT NOT NULL DEFAULT '#1B5E20',
  ADD COLUMN IF NOT EXISTS "secondaryColor" TEXT NOT NULL DEFAULT '#4CAF50',
  ADD COLUMN IF NOT EXISTS "accentColor" TEXT NOT NULL DEFAULT '#E8F5E9',
  ADD COLUMN IF NOT EXISTS "enabledModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "supportEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "slug" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug") WHERE "slug" IS NOT NULL;

-- 1. ContainerStatus : ARRIVED -> RECEIVED, UNLOADING -> RECEIVED
-- Postgres ne permet pas de retirer une valeur d'enum directement.
-- Strategie : creer un nouvel enum, migrer la colonne, drop l'ancien.

DO $$ BEGIN
  CREATE TYPE "ContainerStatus_new" AS ENUM ('EMPTY', 'LOADING', 'IN_TRANSIT', 'RECEIVED', 'UNLOADED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Migrer les valeurs existantes : ARRIVED -> RECEIVED, UNLOADING -> RECEIVED
ALTER TABLE "containers"
  ALTER COLUMN "status" TYPE TEXT;

UPDATE "containers" SET "status" = 'RECEIVED' WHERE "status" IN ('ARRIVED', 'UNLOADING');

ALTER TABLE "containers"
  ALTER COLUMN "status" TYPE "ContainerStatus_new" USING "status"::"ContainerStatus_new",
  ALTER COLUMN "status" SET DEFAULT 'EMPTY';

-- Renommer
DROP TYPE IF EXISTS "ContainerStatus" CASCADE;
ALTER TYPE "ContainerStatus_new" RENAME TO "ContainerStatus";

-- 5. Container : organizationId + @@unique([orgId, designation])
ALTER TABLE "containers"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

-- Backfill : pour les containers existants, lire l'organizationId depuis l'agence de depart
UPDATE "containers" c
SET "organizationId" = a."organizationId"
FROM "agencies" a
WHERE c."departureAgencyId" = a."id" AND c."organizationId" IS NULL;

-- Si encore des nulls (cas rares), prendre la premiere org
UPDATE "containers"
SET "organizationId" = (SELECT "id" FROM "organizations" LIMIT 1)
WHERE "organizationId" IS NULL;

ALTER TABLE "containers"
  ALTER COLUMN "organizationId" SET NOT NULL;

-- Drop l'ancien unique global sur designation
ALTER TABLE "containers"
  DROP CONSTRAINT IF EXISTS "containers_designation_key";

DROP INDEX IF EXISTS "containers_designation_key";

-- Nouveau unique scoped tenant
CREATE UNIQUE INDEX IF NOT EXISTS "containers_organizationId_designation_key"
  ON "containers"("organizationId", "designation");

CREATE INDEX IF NOT EXISTS "containers_organizationId_idx" ON "containers"("organizationId");

-- 6. Parcel : organizationId + destination structuree + category + flags + declaredValue
-- 4. Drop unique sur invoiceId (1 invoice -> N parcels)
ALTER TABLE "parcels"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "destinationAgencyId" TEXT,
  ADD COLUMN IF NOT EXISTS "destinationAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "isFragile" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isHazardous" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "declaredValue" DECIMAL(15, 2);

DO $$ BEGIN
  CREATE TYPE "ParcelCategory" AS ENUM ('STANDARD', 'DOCUMENT', 'FOOD', 'ELECTRONICS', 'CLOTHING', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "parcels"
  ADD COLUMN IF NOT EXISTS "category" "ParcelCategory" NOT NULL DEFAULT 'STANDARD';

-- Backfill organizationId via le client
UPDATE "parcels" p
SET "organizationId" = c."organizationId"
FROM "clients" c
WHERE p."clientId" = c."id" AND p."organizationId" IS NULL;

UPDATE "parcels"
SET "organizationId" = (SELECT "id" FROM "organizations" LIMIT 1)
WHERE "organizationId" IS NULL;

ALTER TABLE "parcels"
  ALTER COLUMN "organizationId" SET NOT NULL;

-- FK destinationAgencyId
DO $$ BEGIN
  ALTER TABLE "parcels"
    ADD CONSTRAINT "parcels_destinationAgencyId_fkey"
    FOREIGN KEY ("destinationAgencyId") REFERENCES "agencies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Drop unique sur invoiceId pour permettre 1:N
ALTER TABLE "parcels"
  DROP CONSTRAINT IF EXISTS "parcels_invoiceId_key";

DROP INDEX IF EXISTS "parcels_invoiceId_key";

-- Indexes
CREATE INDEX IF NOT EXISTS "parcels_organizationId_idx" ON "parcels"("organizationId");
CREATE INDEX IF NOT EXISTS "parcels_destinationAgencyId_idx" ON "parcels"("destinationAgencyId");
CREATE INDEX IF NOT EXISTS "parcels_invoiceId_idx" ON "parcels"("invoiceId");
CREATE INDEX IF NOT EXISTS "parcels_category_idx" ON "parcels"("category");
