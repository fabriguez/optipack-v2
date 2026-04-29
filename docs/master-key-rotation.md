# Rotation de `OPS_MASTER_KEY`

`OPS_MASTER_KEY` est la cle AES-256-GCM utilisee par l'orchestrator pour chiffrer
les SSH private keys des VPS dans la table `vps.sshKeyEncrypted`.

**Si tu changes la masterKey sans re-chiffrer les anciennes valeurs, tu perds
l'acces SSH a tous les VPS existants.** Cette doc explique la rotation propre.

## Quand faire une rotation

- Suspicion de fuite de la masterKey actuelle
- Politique annuelle de rotation des secrets
- Apres le depart d'un ops admin ayant eu acces a l'env du control plane

## Procedure

### 1. Generer la nouvelle cle

```bash
NEW_KEY=$(openssl rand -hex 32)
echo "Nouvelle cle : $NEW_KEY"
```

### 2. Mode rotation : double-cle

Le code actuel ne supporte pas nativement le double-key. La rotation se fait en
**arret de service** (~5 min) via un script one-shot.

### 3. Script de rotation

Creer `apps/orchestrator/scripts/rotate-master-key.ts` :

```ts
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'node:crypto';

const OLD = process.env.OPS_MASTER_KEY_OLD;
const NEW = process.env.OPS_MASTER_KEY_NEW;
if (!OLD || !NEW) {
  console.error('Set OPS_MASTER_KEY_OLD et OPS_MASTER_KEY_NEW');
  process.exit(1);
}

function toBuf(k: string): Buffer {
  return /^[0-9a-fA-F]{64}$/.test(k)
    ? Buffer.from(k, 'hex')
    : createHash('sha256').update(k).digest();
}

function decrypt(stored: string, key: Buffer): string {
  const [iv, tag, data] = stored.split(':');
  const dec = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  dec.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([dec.update(Buffer.from(data, 'hex')), dec.final()]).toString('utf8');
}

function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const enc = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([enc.update(plain, 'utf8'), enc.final()]);
  const tag = enc.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

const prisma = new PrismaClient();
async function main() {
  const oldKey = toBuf(OLD);
  const newKey = toBuf(NEW);
  const all = await prisma.vPS.findMany({ select: { id: true, sshKeyEncrypted: true } });
  let ok = 0;
  for (const v of all) {
    try {
      const plain = decrypt(v.sshKeyEncrypted, oldKey);
      const reencrypted = encrypt(plain, newKey);
      await prisma.vPS.update({
        where: { id: v.id },
        data: { sshKeyEncrypted: reencrypted },
      });
      ok++;
    } catch (e) {
      console.error(`Echec rotation pour VPS ${v.id}: ${(e as Error).message}`);
    }
  }
  console.log(`Rotation OK pour ${ok}/${all.length} VPS`);
}
main().finally(() => prisma.$disconnect());
```

### 4. Execution

```bash
# Stop l'orchestrator
docker stop orchestrator

# Run le script avec les deux cles
OPS_MASTER_KEY_OLD="<ancienne>" \
OPS_MASTER_KEY_NEW="<nouvelle>" \
OPS_DATABASE_URL="<url>" \
pnpm --filter @transitsoftservices/orchestrator exec tsx scripts/rotate-master-key.ts

# Mettre a jour l'env de l'orchestrator avec la nouvelle cle
# (docker-compose, secrets manager, etc.)

# Restart
docker start orchestrator
```

### 5. Verification

```bash
# Tester la connexion SSH a chaque VPS depuis le dashboard ops-admin
# (action `/vps/:id/test-connection`)
curl -X POST http://localhost:4020/ops/vps/<id>/test-connection \
  -H "Authorization: Bearer <ops-jwt>"
```

Si tous les test-connection passent, la rotation est OK. Detruire l'ancienne cle.

## En cas d'echec

Si le script crash en cours de route, les VPS deja re-chiffres ont la nouvelle
cle, les autres l'ancienne -> incompatible avec un seul `OPS_MASTER_KEY` actif.

**Recovery** :

1. Restorer le backup BDD pris avant la rotation (cf. `docs/backups`)
2. Repartir avec l'ancienne cle, debugger le script (`try/catch` autour de chaque
   VPS, log de l'id qui plante).

## Pourquoi pas de hot-reload ?

Permettre `OPS_MASTER_KEY_OLD` + `OPS_MASTER_KEY_NEW` simultanement (decrypt avec
l'une OU l'autre) est faisable mais ajoute de la complexite et un risque de
fuite : la cle vit deux fois plus longtemps en RAM, et l'arret du service
n'etant que de quelques minutes, le compromis n'en vaut pas la peine pour
l'instant.

## Tech-debt lie

- #30 — Pas de hot-reload des secrets : workaround documente ici.
