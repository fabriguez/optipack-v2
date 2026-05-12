import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/LegalPage';

export const metadata: Metadata = {
  title: 'Politique de confidentialite | Transit Soft Services',
  description: 'Comment Transit Soft Services collecte, utilise et protege vos donnees personnelles.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialite" lastUpdated="12 mai 2026">
      <p>
        Transit Soft Services accorde la plus grande importance a la protection de vos
        donnees personnelles. La presente politique decrit quelles donnees
        nous collectons, comment nous les utilisons et quels sont vos droits.
      </p>

      <h2>1. Donnees collectees</h2>
      <p>Nous collectons les categories suivantes :</p>
      <ul>
        <li>
          <strong>Identite</strong> : nom complet, numero de telephone, adresse
          email (optionnelle), piece d&apos;identite (CNI recto / verso),
          photo de profil.
        </li>
        <li>
          <strong>Donnees de colis</strong> : tracking, designation, masse,
          volume, destination, destinataire.
        </li>
        <li>
          <strong>Donnees techniques</strong> : adresse IP, type de
          navigateur, pages visitees, horodatage des connexions.
        </li>
      </ul>

      <h2>2. Finalites</h2>
      <p>Ces donnees sont utilisees pour :</p>
      <ul>
        <li>fournir le service de suivi et de gestion de colis ;</li>
        <li>emettre des factures et tenir la comptabilite ;</li>
        <li>vous envoyer des notifications (SMS, WhatsApp, email) sur
          l&apos;etat de vos envois ;</li>
        <li>assurer la securite de la plateforme (detection de fraude,
          journal d&apos;audit) ;</li>
        <li>respecter nos obligations legales et reglementaires.</li>
      </ul>

      <h2>3. Base legale</h2>
      <p>
        Le traitement repose sur l&apos;execution du contrat (transit de votre
        colis), votre consentement (notifications marketing), et le respect
        d&apos;obligations legales (comptabilite, lutte anti-blanchiment).
      </p>

      <h2>4. Destinataires</h2>
      <p>
        Vos donnees sont accessibles uniquement aux agents de l&apos;agence avec
        laquelle vous traitez et a nos sous-traitants techniques (hebergeur,
        operateurs SMS / WhatsApp / email). Aucune donnee n&apos;est revendue.
      </p>

      <h2>5. Duree de conservation</h2>
      <ul>
        <li>Donnees de compte : tant que le compte est actif, puis 5 ans
          d&apos;archivage legal apres suppression.</li>
        <li>Donnees comptables (factures, paiements) : 10 ans (obligation
          legale OHADA).</li>
        <li>Logs techniques : 12 mois maximum.</li>
      </ul>

      <h2>6. Vos droits</h2>
      <p>Vous disposez des droits suivants sur vos donnees :</p>
      <ul>
        <li>acces et copie ;</li>
        <li>rectification ;</li>
        <li>suppression (sous reserve des obligations legales) ;</li>
        <li>portabilite ;</li>
        <li>opposition au traitement marketing ;</li>
        <li>retrait du consentement a tout moment.</li>
      </ul>
      <p>
        Pour exercer ces droits :{' '}
        <a
          href="mailto:privacy@transitsoftservices.com"
          className="font-semibold underline"
          style={{ color: 'var(--skin-primary)' }}
        >
          privacy@transitsoftservices.com
        </a>
        .
      </p>

      <h2>7. Securite</h2>
      <p>
        Les mots de passe sont stockes sous forme hachee (bcrypt). Les
        echanges entre votre navigateur et nos serveurs sont chiffres
        (HTTPS / TLS 1.3). L&apos;acces aux donnees est limite par un controle
        ABAC (permissions par poste) et journalise.
      </p>

      <h2>8. Cookies</h2>
      <p>
        Le detail des cookies utilises est decrit dans notre page{' '}
        <a
          href="/cookies"
          className="font-semibold underline"
          style={{ color: 'var(--skin-primary)' }}
        >
          Cookies
        </a>
        .
      </p>
    </LegalPage>
  );
}
