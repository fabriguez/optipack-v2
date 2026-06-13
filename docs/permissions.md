# Système de permissions ABAC — Guide développeur

Référence pour toute personne qui ajoute une route, un module ou un champ sensible.
Voir `PERMISSIONS-PLAN.md` pour l'architecture complète et la roadmap.

---

## En bref

| Couche | Fichier principal | Ce qu'elle fait |
|--------|-------------------|-----------------|
| Catalogue | `apps/api/prisma/seed.ts` | 108 clés + 8 positions système |
| Middleware | `authMiddleware.ts` + `policyContext.ts` | JWT → `PolicyContext` (can/canAny/isAdmin) |
| Route guard | `requirePermission('key')` | 403/log selon mode |
| Scope agence | `agencyScope.ts` | Liste filtrée + detail 404 hors scope |
| Field masking | `fieldPolicy.ts` | Masque les champs selon permission |
| Front web | `PermissionGate.tsx` | 404 sans monter les enfants |
| Front desktop | même fichier dans web-desktop | Parité SPA |
| JWT fraîcheur | `pvCache.ts` + `permissionVersion` | 401 si perms changées |

---

## Ajouter une nouvelle route backend

**Checklist obligatoire :**

1. **Clé seedée** — vérifier que la clé existe dans `PERMISSION_KEYS` (`seed.ts`). Si nouvelle, l'ajouter ET l'assigner aux positions concernées.

2. **`requirePermission`** — ajouter sur la route :
   ```ts
   router.get('/ma-route', authenticate, authorize('AGENT', 'ADMIN'), requirePermission('module.read'), handler);
   ```

3. **Scope resolver** — si la ressource est liée à une agence, ajouter un `assert` ou merger un `where` :
   ```ts
   // Dans le controller :
   await maRessourceScope.assert(req.params.id, scopeCtx(req));
   // Ou pour les listes :
   const where = maRessourceScope.where(scopeCtx(req));
   // Merger via andWhere() ou { AND: [where].filter(Boolean) }
   ```
   Si besoin d'un nouveau scope resolver, l'ajouter dans `agencyScope.ts`.

4. **Field policy** — si la réponse contient des références à d'autres entités sensibles (client, employé, prix), déclarer une policy dans `fieldPolicy.ts` et l'appliquer dans le controller :
   ```ts
   import { applyFieldPolicy, MA_RESOURCE_FIELD_POLICY } from '../serializers/fieldPolicy';
   import { getPolicy } from '../middleware/policyContext';
   // ...
   const policy = getPolicy(req)!;
   res.json({ data: applyFieldPolicy(result, MA_RESOURCE_FIELD_POLICY, policy) });
   ```

5. **Test garde-fou** — le test `route-permission-guard.test.ts` valide automatiquement que toute route derrière `authenticate` porte un `requirePermission`. Il échouera si la route est oubliée → CI rouge.

---

## Ajouter une nouvelle page frontend

**Checklist :**

1. Ajouter le prefix dans `ROUTE_PERMISSION_MAP` de `PermissionGate.tsx` (web et web-desktop) :
   ```ts
   { prefix: '/mon-module', keys: ['module.read'] },
   ```

2. Si la page a des sections conditionnelles (boutons d'action, onglets) :
   ```tsx
   <Can permission="module.write">
     <button>Modifier</button>
   </Can>
   ```

3. Si la page affiche des données masquées (`{ id, masked: true }`), utiliser le composant `MaskedValue` (à créer — affiche "Accès restreint" à la place du contenu).

---

## Gérer les permissions d'un employé

### Via poste (cas normal)
- Administrer dans `/admin/personnel/postes` (matrice de permissions par poste).
- Changement de poste → `permissionVersion` incrémenté → JWT périmé au prochain appel → 401 → re-login automatique.

### Via exception individuelle (surcharge)
- Administrer dans `/admin/personnel/exceptions` (accessible avec `permission.manage`).
- Un override `granted=true` ajoute la clé, `granted=false` retire même si le poste l'accorde.
- Déclenche immédiatement un `bumpPermissionVersion` → token invalide au prochain appel.

---

## Mode shadow vs enforce

Contrôlé par `PERMISSIONS_ENFORCE` dans `.env` :

| Valeur | Comportement |
|--------|-------------|
| `log` (défaut) | Refus logués `[PERM-DENY]` / `[SCOPE-DENY]`, accès accordé quand même |
| `enforce` | Refus = 403 (permission) ou 404 (scope agence) |

**Bascule recommandée :**
1. Déployer en `log`, observer les logs quelques jours.
2. Ajuster les matrices de postes si des `[PERM-DENY]` légitimes apparaissent.
3. Passer `PERMISSIONS_ENFORCE=enforce` en beta, puis prod.

---

## JWT `pv` (permission version)

- Chaque `User` a un champ `permissionVersion` (Int, default 0).
- Embarqué comme `pv` dans le JWT à la connexion et au refresh.
- `authMiddleware.authenticate` vérifie `pv` contre la DB (cache 60s).
- Si mismatch → **401** → le client doit faire un refresh ou se re-logger.
- `bumpPermissionVersion(userId)` est appelé automatiquement par `PermissionController` et `PositionController.setPermissions`.

---

## Convention des clés de permission

Format : `<ressource>.<action>` en snake_case anglais.

Exemples :
```
parcel.read          parcel.write         parcel.delete
invoice.read         invoice.void
client.read          client.contact.read  client.write
personnel.read       personnel.write
permission.manage    audit.read
```

Les clés `*.manage` sont réservées aux ADMIN et ne peuvent pas être assignées à un poste (`ADMIN_ONLY_PERMISSION_KEYS`).

---

## Tests

```bash
# Tous les tests (vitest)
pnpm test

# Garde-fou routes (CI bloque si route sans requirePermission)
pnpm test route-permission-guard

# ABAC enforcement (PolicyContext, field masking, scope, shadow/enforce)
pnpm test abac-enforcement
```
