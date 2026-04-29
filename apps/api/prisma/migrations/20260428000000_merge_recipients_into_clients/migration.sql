-- ============================================================
-- Fusion Recipient -> Client
-- Un client peut maintenant etre a la fois expediteur et destinataire.
-- Les anciens recipients sont migres dans clients (dedup par phone).
-- Parcel.recipientId pointe maintenant vers clients.id.
-- ============================================================

-- 1. Drop l'ancienne FK parcels.recipientId -> recipients
ALTER TABLE "parcels" DROP CONSTRAINT IF EXISTS "parcels_recipientId_fkey";

-- 2. Mapping recipient.id -> client.id (existant ou cree)
CREATE TEMP TABLE "_recipient_client_map" (
  "recipient_id" TEXT PRIMARY KEY,
  "client_id"    TEXT NOT NULL
);

-- 2a. Recipients dont le phone correspond deja a un Client : on reutilise l'id Client
INSERT INTO "_recipient_client_map" ("recipient_id", "client_id")
SELECT r."id", c."id"
FROM "recipients" r
JOIN "clients" c ON c."phone" = r."phone";

-- 2b. Recipients sans Client correspondant : on cree un Client
-- (on essaie d'inferer organizationId via l'agence du recipient)
INSERT INTO "clients" (
  "id", "organizationId", "agencyId", "fullName", "phone", "email", "idNumber",
  "clientType", "loyaltyTier", "loyaltyPoints", "totalSpent", "isActive",
  "isPortalActive", "createdAt", "updatedAt"
)
SELECT
  r."id",
  COALESCE(a."organizationId", '00000000-0000-4000-a000-000000000001'),
  r."agencyId",
  r."fullName",
  r."phone",
  r."email",
  r."idNumber",
  'INDIVIDUAL'::"ClientType",
  'STANDARD'::"LoyaltyTier",
  0,
  0,
  true,
  false,
  r."createdAt",
  r."updatedAt"
FROM "recipients" r
LEFT JOIN "agencies" a ON a."id" = r."agencyId"
WHERE NOT EXISTS (SELECT 1 FROM "_recipient_client_map" m WHERE m."recipient_id" = r."id");

-- 2c. Mapping pour les nouveaux clients (recipient.id == client.id puisqu'on l'a reutilise)
INSERT INTO "_recipient_client_map" ("recipient_id", "client_id")
SELECT r."id", r."id"
FROM "recipients" r
WHERE NOT EXISTS (SELECT 1 FROM "_recipient_client_map" m WHERE m."recipient_id" = r."id");

-- 3. Mettre a jour parcels.recipientId pour pointer vers le nouveau client.id
UPDATE "parcels" p
SET "recipientId" = m."client_id"
FROM "_recipient_client_map" m
WHERE p."recipientId" = m."recipient_id";

-- 4. Drop la table recipients
DROP TABLE IF EXISTS "recipients" CASCADE;

-- 5. Re-creer la FK parcels.recipientId -> clients(id)
ALTER TABLE "parcels"
  ADD CONSTRAINT "parcels_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "clients"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Index utile pour les requetes "parcels ou je suis destinataire"
CREATE INDEX IF NOT EXISTS "parcels_recipientId_idx" ON "parcels"("recipientId");
