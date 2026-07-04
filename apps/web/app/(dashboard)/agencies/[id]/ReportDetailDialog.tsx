'use client';

import { useState, type ReactNode } from 'react';
import { AppDialog } from '@/components/ui/AppDialog';
import { formatAmount, formatDateTime } from '@transitsoftservices/shared';
import { Info } from 'lucide-react';

/**
 * Popup "Voir les details" d'une section du rapport journalier : explique la
 * regle de calcul (fenetre, filtres, formule) et liste les elements qui ont
 * participe au resultat (colis, paiements, conteneurs, depenses...).
 * Les listes viennent de `payload.details` (rapports generes apres la mise a
 * jour) ; a defaut, seule la regle de calcul est affichee.
 */
export interface DetailSpec {
  title: string;
  logic: string[];
  count?: number | null;
  table?: ReactNode | null;
  window?: any;
}

const REASON_LABELS: Record<string, string> = {
  PAYE_APRES_RECEPTION: 'Paye apres reception du colis',
  NON_RECEPTIONNE: 'Colis pas encore receptionne',
  PAYE_AVANT_RECEPTION: 'Paye avant la reception du colis',
};

const EXIT_LABELS: Record<string, string> = {
  REMIS_CLIENT: 'Remis au client',
  PARTI_TRANSIT: 'Parti en transit',
  REMISE_ET_TRANSIT: 'Remis + reparti en transit',
};

const ENTRY_LABELS: Record<string, string> = {
  ENREGISTRE: 'Enregistre (depot client)',
  RECEPTIONNE: 'Receptionne (arrive a destination)',
  MIS_EN_STOCK: 'Mis en stock (dechargement)',
};

// Affichage centralise : le serveur envoie des instants UTC (ISO), le
// navigateur les rend dans SON fuseau via le helper shared.
const dt = (v?: string | null) => (v ? formatDateTime(v) : '-');
const kg = (v: any) => `${Number(v ?? 0).toFixed(2)} kg`;
const m3 = (v: any) => `${Number(v ?? 0).toFixed(3)} m3`;

export function DetailButton({ spec }: { spec?: DetailSpec | null }) {
  const [open, setOpen] = useState(false);
  if (!spec) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary-200 bg-white px-2 py-0.5 text-[11px] font-medium text-primary-700 hover:bg-primary-50"
      >
        <Info className="h-3 w-3" />
        Voir les details
      </button>
      <AppDialog
        open={open}
        onClose={() => setOpen(false)}
        title={spec.title}
        description="Elements pris en compte et regle de calcul"
        size="xl"
      >
        <div className="space-y-4">
          <WindowBanner w={spec.window} />
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Comment ce resultat est calcule
            </p>
            <ul className="list-disc space-y-1 rounded-xl border border-gray-100 bg-gray-50 py-2.5 pl-7 pr-3 text-xs text-gray-700">
              {spec.logic.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Elements pris en compte{spec.count != null ? ` (${spec.count})` : ''}
            </p>
            {spec.table ?? (
              <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Le detail element par element n&apos;est pas disponible pour ce rapport
                (genere avant la mise a jour). Pour un rapport non cloture, cliquez sur
                &laquo; Regenerer &raquo; pour l&apos;obtenir ; un rapport cloture est
                immuable et conserve son contenu d&apos;origine.
              </p>
            )}
          </div>
        </div>
      </AppDialog>
    </>
  );
}

function WindowBanner({ w }: { w?: any }) {
  if (!w?.start) return null;
  return (
    <div className="rounded-xl border border-primary-100 bg-primary-50/60 px-3 py-2 text-xs text-gray-700">
      <p>
        <span className="font-semibold">Periode analysee :</span> du {dt(w.start)} au {dt(w.end)}
      </p>
      {w.scheduleStart && (
        <p className="mt-0.5">
          <span className="font-semibold">Plage horaire de l&apos;agence ce jour :</span> {dt(w.scheduleStart)} - {dt(w.scheduleEnd)}
        </p>
      )}
      {w.timezone && (
        <p className="mt-0.5 text-gray-500">
          Journee calculee par le serveur dans le fuseau de l&apos;agence ({w.timezone}) ; les heures ci-dessous s&apos;affichent dans votre fuseau local.
        </p>
      )}
      {w.source && (
        <p className="mt-0.5 text-gray-500">
          {w.source === 'CASH_SESSION'
            ? "La journee suit le programme de l'agence et la session de caisse : de la cloture de la veille (ou de l'ouverture de la caisse) jusqu'a la cloture du jour, ou jusqu'au moment de la generation si la caisse etait encore ouverte. Tout evenement survenu apres la cloture bascule sur le rapport du prochain jour ouvrable."
            : w.source === 'AGENCY_SCHEDULE'
            ? "Aucune caisse pour ce jour : la journee correspond a la plage horaire configuree de l'agence (ouverture -> fermeture), rattachee a la cloture de la veille pour ne perdre aucun evenement."
            : 'Aucune caisse ni plage horaire configuree pour ce jour : la fenetre correspond au jour calendaire.'}
        </p>
      )}
    </div>
  );
}

function DetailTable({ head, rows, truncatedCount }: { head: string[]; rows: ReactNode[][]; truncatedCount?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 p-2">
      <table className="w-full text-xs">
        <thead className="text-left text-gray-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap py-1 pr-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="py-1.5 pr-3 align-top">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="py-2 text-center text-xs text-gray-400">Aucun element sur cette periode.</p>}
      {truncatedCount ? (
        <p className="mt-1 text-[11px] text-gray-400">... et {truncatedCount} element(s) supplementaires non affiches.</p>
      ) : null}
    </div>
  );
}

const parcelRows = (list: any[]) =>
  list.map((p) => [
    <span key="t" className="font-mono text-[11px]">{p.trackingNumber ?? '-'}</span>,
    `${p.routeName ?? 'Sans route'}${p.routeType ? ` (${p.routeType})` : ''}`,
    p.status ?? '-',
    kg(p.weight),
    m3(p.volume),
    formatAmount(p.price ?? 0),
  ]);

const PARCEL_HEAD = ['Colis', 'Route', 'Statut', 'Poids', 'Volume', 'Prix'];

const shareReason = (s: any) =>
  s.reason === 'NON_RECEPTIONNE' && s.status
    ? `${REASON_LABELS[s.reason]} (statut ${s.status})`
    : REASON_LABELS[s.reason] ?? s.reason ?? '-';

const shareRows = (list: any[]) =>
  list.map((s) => [
    <span key="t" className="font-mono text-[11px]">{s.trackingNumber ?? '-'}</span>,
    s.routeName ?? 'Sans route',
    <span key="r" className="font-mono text-[11px]">{s.paymentRef ?? '-'}</span>,
    s.method ?? '-',
    formatAmount(s.price ?? 0),
    <span key="s" className="font-semibold">{formatAmount(s.share ?? 0)}</span>,
    shareReason(s),
  ]);

const SHARE_HEAD = ['Colis', 'Route', 'Ref paiement', 'Methode', 'Prix colis', 'Part comptee', 'Raison'];

/**
 * Construit les specs de details de chaque section a partir du payload.
 * `payload.details` peut manquer (anciens rapports) : les specs gardent alors
 * la regle de calcul mais sans table d'elements.
 */
export function buildDetailSpecs(payload: any): Record<string, DetailSpec> {
  const d = payload?.details;
  const win = d?.window ?? payload?.window ?? null;
  const trunc = d?.truncated ?? {};

  const shares: any[] = (d?.payments ?? []).flatMap((pay: any) =>
    (pay.parcels ?? []).map((s: any) => ({
      ...s,
      paymentRef: pay.reference,
      method: pay.method,
      computation: pay.computation,
    })),
  );
  const recetteShares = shares.filter((s) => s.bucket === 'RECETTE');
  const advanceShares = shares.filter((s) => s.bucket === 'AVANCE');

  const prorataRule =
    "Un paiement est reparti entre ses colis au prorata du prix de chaque colis : part = montant du paiement x (prix du colis / somme des prix des colis payes). Si tous les prix sont a 0, repartition egalitaire.";

  const flowOutDetail: any[] = d?.flowOut ?? [];
  const handedOverDetail = flowOutDetail.filter((p) => p.exitType !== 'PARTI_TRANSIT');
  const toTransitDetail = flowOutDetail.filter((p) => p.exitType !== 'REMIS_CLIENT');

  const containersTable = (containers: any[] | undefined) => {
    if (!containers || containers.length === 0) return d ? <DetailTable head={['Conteneur']} rows={[]} /> : null;
    if (!d?.containerParcels) return null;
    return (
      <div className="space-y-3">
        {containers.map((c: any) => {
          const list: any[] = d.containerParcels[c.id] ?? [];
          return (
            <div key={c.id}>
              <p className="mb-1 text-xs font-semibold text-gray-700">
                {c.designation} - {c.routeName} ({list.length} colis)
              </p>
              <DetailTable
                head={['Colis', 'Route', 'Poids', 'Volume', 'Position actuelle']}
                rows={list.map((p) => [
                  <span key="t" className="font-mono text-[11px]">{p.trackingNumber ?? '-'}</span>,
                  p.routeName ?? 'Sans route',
                  kg(p.weight),
                  m3(p.volume),
                  p.stillLoaded ? 'Encore dans le conteneur' : 'Decharge du conteneur',
                ])}
              />
            </div>
          );
        })}
      </div>
    );
  };

  const transfers = [
    ...(payload?.fundTransfersOut ?? []).map((t: any) => ({ ...t, dir: 'Sortant' })),
    ...(payload?.fundTransfersIn ?? []).map((t: any) => ({ ...t, dir: 'Entrant' })),
  ];

  const expensesList: any[] = payload?.expenses ?? [];
  const disbList: any[] = d?.disbursements ?? [];
  const voidedList: any[] = payload?.voidedPayments ?? [];
  const cr = payload?.cashRegister;

  return {
    entries: {
      title: 'Entrees du jour par mode de transit et de paiement',
      window: win,
      logic: [
        "Tous les paiements non annules encaisses par cette agence pendant la periode analysee (l'agence qui encaisse est celle du paiement, pas forcement celle du colis).",
        "Chaque paiement est classe selon le mode de transit des colis payes : une seule route -> type de cette route ; plusieurs routes differentes -> MIXED ; aucune route -> OTHER.",
        'Les montants sont regroupes par methode de paiement, puis additionnes.',
        'Canal GUICHET = encaisse par un agent (entre dans la caisse physique) ; EN_LIGNE = paye via un operateur (les fonds ne passent pas par la caisse).',
      ],
      count: d ? (d.payments ?? []).length : null,
      table: d ? (
        <DetailTable
          head={['Ref', 'Heure', 'Canal', 'Methode', 'Transit', 'Colis payes', 'Montant']}
          truncatedCount={trunc.payments}
          rows={(d.payments ?? []).map((pay: any) => [
            <span key="r" className="font-mono text-[11px]">{pay.reference}</span>,
            dt(pay.createdAt),
            pay.channel,
            pay.method,
            pay.transitType,
            pay.parcels?.length
              ? pay.parcels.map((s: any) => s.trackingNumber).join(', ')
              : '-',
            <span key="a" className="font-semibold">{formatAmount(pay.amount)}</span>,
          ])}
        />
      ) : null,
    },

    recette: {
      title: 'Recettes',
      window: win,
      logic: [
        prorataRule,
        'La part d\'un colis compte en RECETTE si le colis est actuellement receptionne (statut RECEIVED ou DELIVERED) ET si le paiement a ete effectue apres la date de reception du colis a destination.',
        'Tous les autres cas comptent en paiement en avance.',
        'La somme des parts ci-dessous donne exactement le total Recettes du rapport.',
      ],
      count: d ? recetteShares.length : null,
      table: d ? <DetailTable head={SHARE_HEAD} rows={shareRows(recetteShares)} truncatedCount={trunc.payments} /> : null,
    },

    avances: {
      title: 'Paiements en avance',
      window: win,
      logic: [
        prorataRule,
        "La part d'un colis compte en AVANCE si le colis n'est pas encore receptionne a destination (quel que soit le moment du paiement), ou s'il a ete paye avant sa reception.",
        'Quand le colis arrivera et sera receptionne, les paiements posterieurs a cette reception compteront en recette.',
        'La somme des parts ci-dessous donne exactement le total Avances du rapport.',
      ],
      count: d ? advanceShares.length : null,
      table: d ? <DetailTable head={SHARE_HEAD} rows={shareRows(advanceShares)} truncatedCount={trunc.payments} /> : null,
    },

    flowIn: {
      title: 'Flux du jour - Entrees',
      window: win,
      logic: [
        "Cumul des colis ENTRES dans l'agence pendant la journee du rapport (fenetre = plage horaire de l'agence / session caisse), d'apres l'historique des colis.",
        "Un colis entre quand un evenement le fait atterrir dans un magasin de l'agence : Enregistre (creation en magasin), Receptionne (arrive a destination, statut RECEIVED), Mis en stock (dechargement -> IN_STOCK).",
        "Les transferts inter-magasins internes a l'agence ne comptent pas (le colis n'a jamais quitte l'agence).",
        "Un colis n'est compte qu'une seule fois : premier evenement d'entree de la journee.",
        'Le compteur "colis recus" en tete du rapport correspond a ce nombre.',
      ],
      count: d ? (d.flowIn ?? []).length : payload?.flow?.in?.count ?? null,
      table: d ? (
        <DetailTable
          head={['Colis', 'Route', "Type d'entree", 'Entre le', 'Statut actuel', 'Poids', 'Volume', 'Prix']}
          truncatedCount={trunc.flowIn}
          rows={(d.flowIn ?? []).map((p: any) => [
            <span key="t" className="font-mono text-[11px]">{p.trackingNumber ?? '-'}</span>,
            `${p.routeName ?? 'Sans route'}${p.routeType ? ` (${p.routeType})` : ''}`,
            ENTRY_LABELS[p.entryType] ?? p.entryType ?? '-',
            dt(p.enteredAt),
            p.status ?? '-',
            kg(p.weight),
            m3(p.volume),
            formatAmount(p.price ?? 0),
          ])}
        />
      ) : null,
    },

    flowOut: {
      title: 'Flux du jour - Sorties',
      window: win,
      logic: [
        "Colis sortis de l'agence pendant la periode analysee, d'apres l'historique des colis :",
        "Remis au client : evenement HANDED_OVER (ou remise non tracee UNTRACKED_HANDED_OVER) dans un magasin de l'agence.",
        "Parti en transit : evenement LOADED_INTO_CONTAINER dans un conteneur au depart de l'agence VERS UNE AUTRE AGENCE (transferts inter-agences inclus).",
        "Les transferts inter-magasins internes a l'agence ne comptent PAS : le colis ne sort pas de l'agence.",
        "Un colis n'est compte qu'une seule fois dans le total, meme s'il a plusieurs evenements le meme jour.",
      ],
      count: d ? flowOutDetail.length : payload?.flow?.out?.count ?? null,
      table: d ? (
        <DetailTable
          head={[...PARCEL_HEAD, 'Sorti le', 'Type de sortie']}
          truncatedCount={trunc.flowOut}
          rows={flowOutDetail.map((p) => [...parcelRows([p])[0], dt(p.exitedAt), EXIT_LABELS[p.exitType] ?? p.exitType])}
        />
      ) : null,
    },

    flowOutHandedOver: {
      title: 'Sorties - Remis aux clients',
      window: win,
      logic: [
        'Sous-ensemble des sorties du jour : colis remis a leur destinataire (evenement HANDED_OVER ou UNTRACKED_HANDED_OVER dans un magasin de l\'agence) pendant la periode analysee.',
      ],
      count: d ? handedOverDetail.length : payload?.flow?.out?.byType?.handedOver?.count ?? null,
      table: d ? (
        <DetailTable
          head={[...PARCEL_HEAD, 'Sorti le']}
          rows={handedOverDetail.map((p) => [...parcelRows([p])[0], dt(p.exitedAt)])}
        />
      ) : null,
    },

    flowOutToTransit: {
      title: 'Sorties - Partis en transit',
      window: win,
      logic: [
        "Sous-ensemble des sorties du jour : colis charges dans un conteneur au depart de l'agence vers une AUTRE agence (evenement LOADED_INTO_CONTAINER) pendant la periode analysee.",
        "Les conteneurs internes a l'agence (transfert inter-magasins) ne comptent pas : le colis reste dans l'agence.",
      ],
      count: d ? toTransitDetail.length : payload?.flow?.out?.byType?.toTransit?.count ?? null,
      table: d ? (
        <DetailTable
          head={[...PARCEL_HEAD, 'Sorti le']}
          rows={toTransitDetail.map((p) => [...parcelRows([p])[0], dt(p.exitedAt)])}
        />
      ) : null,
    },

    containersReceived: {
      title: 'Conteneurs recus du jour',
      window: win,
      logic: [
        "Conteneurs dont l'agence d'arrivee est cette agence et dont la date d'arrivee reelle tombe dans la periode analysee.",
        'Colis comptes pour un conteneur = colis dont le conteneur courant OU le dernier conteneur connu est celui-ci : un colis deja decharge reste donc compte (sinon le conteneur afficherait 0 colis apres dechargement).',
        'Un colis decharge puis recharge le meme jour dans un autre conteneur compte dans les deux (recu via le premier, envoye via le second).',
      ],
      count: payload?.receivedContainers?.length ?? 0,
      table: containersTable(payload?.receivedContainers),
    },

    containersSent: {
      title: 'Conteneurs envoyes du jour',
      window: win,
      logic: [
        "Conteneurs dont l'agence de depart est cette agence et dont la date de depart tombe dans la periode analysee.",
        'Colis comptes pour un conteneur = colis dont le conteneur courant OU le dernier conteneur connu est celui-ci.',
      ],
      count: payload?.sentContainers?.length ?? 0,
      table: containersTable(payload?.sentContainers),
    },

    stockIn: {
      title: 'Entrees en stock',
      window: win,
      logic: [
        "Transitions strictes vers le statut IN_STOCK dans un magasin de l'agence pendant la periode analysee (historique des colis : statut avant differant de IN_STOCK -> statut apres = IN_STOCK).",
        'Un colis cree directement en stock compte aussi (statut avant vide).',
      ],
      count: d ? (d.stockIn ?? []).length : payload?.stockIn?.count ?? null,
      table: d ? (
        <DetailTable
          head={['Colis', 'Route', 'Transition', 'Heure', 'Poids', 'Volume']}
          truncatedCount={trunc.stockIn}
          rows={(d.stockIn ?? []).map((p: any) => [
            <span key="t" className="font-mono text-[11px]">{p.trackingNumber ?? '-'}</span>,
            p.routeName ?? 'Sans route',
            `${p.statusBefore ?? 'CREATION'} -> ${p.statusAfter}`,
            dt(p.at),
            kg(p.weight),
            m3(p.volume),
          ])}
        />
      ) : null,
    },

    stockOut: {
      title: 'Sorties de stock',
      window: win,
      logic: [
        "Transitions strictes depuis le statut IN_STOCK dans un magasin de l'agence pendant la periode analysee (statut avant = IN_STOCK -> statut apres differant de IN_STOCK).",
      ],
      count: d ? (d.stockOut ?? []).length : payload?.stockOut?.count ?? null,
      table: d ? (
        <DetailTable
          head={['Colis', 'Route', 'Transition', 'Heure', 'Poids', 'Volume']}
          truncatedCount={trunc.stockOut}
          rows={(d.stockOut ?? []).map((p: any) => [
            <span key="t" className="font-mono text-[11px]">{p.trackingNumber ?? '-'}</span>,
            p.routeName ?? 'Sans route',
            `${p.statusBefore} -> ${p.statusAfter}`,
            dt(p.at),
            kg(p.weight),
            m3(p.volume),
          ])}
        />
      ) : null,
    },

    stockState: {
      title: 'Etat de stock actuel',
      window: win,
      logic: [
        "Photo du stock au moment de la generation du rapport : colis en statut IN_STOCK ou RECEIVED dans les magasins de l'agence.",
        'Valeur totale = somme, pour chaque colis, de sa valeur declaree (ou a defaut de son prix de transport).',
        '"Present depuis" = date de la derniere entree du colis dans son statut actuel (arrivee en stock / reception).',
        'Une fois le rapport cloture, cette photo reste figee meme si le stock evolue ensuite.',
      ],
      count: d ? (d.stockState ?? []).length : payload?.stockState?.count ?? null,
      table: d ? (
        <DetailTable
          head={['Colis', 'Route', 'Statut', 'Enregistre le', 'Present depuis', 'Poids', 'Volume', 'Valeur retenue']}
          truncatedCount={trunc.stockState}
          rows={(d.stockState ?? []).map((p: any) => [
            <span key="t" className="font-mono text-[11px]">{p.trackingNumber ?? '-'}</span>,
            p.routeName ?? 'Sans route',
            p.status ?? '-',
            dt(p.registeredAt),
            dt(p.presentSince),
            kg(p.weight),
            m3(p.volume),
            formatAmount(p.declaredValue ?? p.price ?? 0),
          ])}
        />
      ) : null,
    },

    transfers: {
      title: 'Transferts de fonds',
      window: win,
      logic: [
        'Transferts crees pendant la periode analysee : sortants (agence source = cette agence) et entrants (agence destination = cette agence).',
        'Les statuts PENDING et CONFIRMED sont inclus ; les transferts annules sont exclus.',
      ],
      count: transfers.length,
      table: (
        <DetailTable
          head={['Ref', 'Sens', 'Contrepartie', 'Methode', 'Statut', 'Initie par', 'Confirme par', 'Date', 'Montant']}
          rows={transfers.map((t: any) => [
            <span key="r" className="font-mono text-[11px]">{t.reference}</span>,
            t.dir,
            t.counterpart,
            t.transferMethod,
            t.status,
            t.initiatedBy ?? '-',
            t.confirmedBy ?? '-',
            dt(t.createdAt),
            <span key="a" className={`font-semibold ${t.dir === 'Sortant' ? 'text-red-600' : 'text-green-600'}`}>
              {t.dir === 'Sortant' ? '-' : '+'}
              {formatAmount(t.amount)}
            </span>,
          ])}
        />
      ),
    },

    inventories: {
      title: 'Inventaires du jour',
      window: win,
      logic: [
        "Inventaires des magasins de l'agence demarres ou clotures pendant la periode analysee.",
        'Attendus = colis censes etre presents dans le magasin ; Scannes = colis reellement pointes ; Manquants = attendus non scannes.',
      ],
      count: (payload?.inventories ?? []).length,
      table: (
        <DetailTable
          head={['Magasin', 'Statut', 'Demarre le', 'Cloture le', 'Attendus', 'Scannes', 'Manquants', 'Commentaire']}
          rows={(payload?.inventories ?? []).map((i: any) => [
            i.warehouse,
            i.status,
            dt(i.startedAt),
            dt(i.closedAt),
            i.expected,
            i.scanned,
            <span key="m" className="text-red-600">{i.missing}</span>,
            i.comment ?? '-',
          ])}
        />
      ),
    },

    expenses: {
      title: 'Depenses et decaissements',
      window: win,
      logic: [
        "Depenses creees pendant la periode analysee pour cette agence, plus les bons de decaissement emis sur la caisse.",
        "Un decaissement lie a une depense (paiement d'une depense depuis la caisse) n'est compte qu'une seule fois dans le profit (deduplication).",
        'Profit du jour = recettes - depenses - decaissements purs (non lies a une depense).',
      ],
      count: expensesList.length + disbList.length,
      table: (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold text-gray-700">Depenses ({expensesList.length})</p>
            <DetailTable
              head={['Titre', 'Categorie', 'Motif', 'Heure', 'Montant']}
              rows={expensesList.map((e: any) => [
                e.title,
                e.category,
                e.reason ?? '-',
                dt(e.createdAt),
                <span key="a" className="font-semibold text-red-600">-{formatAmount(e.amount)}</span>,
              ])}
            />
          </div>
          {d && (
            <div>
              <p className="mb-1 text-xs font-semibold text-gray-700">Decaissements ({disbList.length})</p>
              <DetailTable
                head={['Ref', 'Motif', 'Ordonnateur', 'Lie a une depense', 'Heure', 'Montant']}
                rows={disbList.map((b: any) => [
                  <span key="r" className="font-mono text-[11px]">{b.reference}</span>,
                  b.reason,
                  b.orderer,
                  b.linkedToExpense ? 'Oui (dedup profit)' : 'Non',
                  dt(b.createdAt),
                  <span key="a" className={`font-semibold ${b.isVoided ? 'text-gray-400 line-through' : 'text-red-600'}`}>
                    -{formatAmount(b.amount)}
                  </span>,
                ])}
              />
            </div>
          )}
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
            Profit du jour = recettes ({formatAmount(payload?.recetteTotal ?? 0)}) - depenses (
            {formatAmount(payload?.expensesTotal ?? 0)}) - decaissements purs (
            {formatAmount(payload?.disbursementsTotalDedup ?? 0)}) ={' '}
            <span className="font-bold">{formatAmount(payload?.profit ?? 0)}</span>
          </p>
        </div>
      ),
    },

    cash: {
      title: 'Solde caisse',
      window: win,
      logic: [
        'Solde issu de la caisse du jour : solde courant = solde d\'ouverture + entrees - sorties. A la cloture, le solde de cloture fige ce montant.',
        'Entrees = encaissements au guichet et transferts entrants confirmes en caisse. Les paiements en ligne ne passent jamais par la caisse physique (fonds chez l\'operateur), d\'ou un eventuel ecart avec le total des paiements du jour.',
        'Sorties = depenses payees en caisse, bons de decaissement, transferts sortants et regularisations (paiements annules apres encaissement).',
        'Les composantes listees ci-dessous sont indicatives : le detail exact mouvement par mouvement se trouve dans l\'onglet Caisse.',
      ],
      count: null,
      table: cr ? (
        <div className="space-y-3">
          <DetailTable
            head={['Element', 'Montant']}
            rows={[
              ['Solde ouverture', formatAmount(cr.openingBalance ?? 0)],
              [<span key="e" className="text-green-700">Entrees caisse (total)</span>, '+' + formatAmount(cr.totalEntries ?? 0)],
              ['dont encaissements guichet', '+' + formatAmount(payload?.paymentsByChannel?.counter ?? payload?.paymentsTotal ?? 0)],
              ['Paiements en ligne (hors caisse)', formatAmount(payload?.paymentsByChannel?.online ?? 0)],
              ['dont transferts entrants', '+' + formatAmount(payload?.fundTransfersInTotal ?? 0)],
              [<span key="s" className="text-red-700">Sorties caisse (total)</span>, '-' + formatAmount(cr.totalExits ?? 0)],
              ['dont depenses', '-' + formatAmount(payload?.expensesTotal ?? 0)],
              ['dont decaissements', '-' + formatAmount(payload?.disbursementsTotal ?? 0)],
              ['dont transferts sortants', '-' + formatAmount(payload?.fundTransfersOutTotal ?? 0)],
              ['dont regularisations (paiements annules)', '-' + formatAmount(payload?.voidedPaymentsTotal ?? 0)],
              [<span key="c" className="font-bold">Solde courant</span>, <span key="cv" className="font-bold">{formatAmount(cr.currentBalance ?? 0)}</span>],
              ...(cr.closingBalance != null
                ? [[<span key="f" className="font-bold">Solde cloture</span>, <span key="fv" className="font-bold">{formatAmount(cr.closingBalance)}</span>]]
                : []),
            ]}
          />
          {voidedList.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-gray-700">Paiements annules pendant la periode ({voidedList.length})</p>
              <DetailTable
                head={['Ref', 'Methode', 'Encaisse le', 'Annule le', 'Annule par', 'Motif', 'Montant']}
                rows={voidedList.map((v: any) => [
                  <span key="r" className="font-mono text-[11px]">{v.reference}</span>,
                  v.paymentMethod,
                  dt(v.receivedAt),
                  dt(v.voidedAt),
                  v.voidedBy ?? '-',
                  v.reason ?? '-',
                  <span key="a" className="font-semibold text-red-600">-{formatAmount(v.amount)}</span>,
                ])}
              />
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400">Aucune caisse trouvee pour ce jour.</p>
      ),
    },
  };
}
