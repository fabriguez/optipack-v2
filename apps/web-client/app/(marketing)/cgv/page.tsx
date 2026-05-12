import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/LegalPage';

export const metadata: Metadata = {
  title: 'Conditions Generales de Vente | Transit Soft Services',
  description: 'Conditions generales de vente et d\'utilisation du service Transit Soft Services.',
};

export default function CgvPage() {
  return (
    <LegalPage title="Conditions Generales de Vente" lastUpdated="12 mai 2026">
      <p>
        Les presentes conditions generales de vente (CGV) regissent l&apos;usage
        de la plateforme Transit Soft Services par les clients et les entreprises de
        transit qui en font usage. En creant un compte ou en utilisant
        nos services, vous acceptez sans reserve ces conditions.
      </p>

      <h2>1. Objet</h2>
      <p>
        Transit Soft Services fournit un service de suivi de colis et de gestion logistique
        a destination des transitaires et de leurs clients en Afrique de
        l&apos;Ouest et Centrale. Le service inclut la creation, l&apos;expedition,
        la reception, la facturation et le suivi temps reel des colis.
      </p>

      <h2>2. Acces au service</h2>
      <p>
        L&apos;acces au portail client public est gratuit et nominatif. Chaque
        compte est lie a un numero de telephone unique et a un mot de passe
        personnel. L&apos;utilisateur s&apos;engage a conserver ces identifiants
        confidentiels.
      </p>

      <h2>3. Tarifs</h2>
      <p>
        Les tarifs de transit sont fixes par chaque agence partenaire au
        moment de la creation du colis. Transit Soft Services ne percoit pas de
        commission directe sur l&apos;envoi ; le service de plateforme est
        facture aux transitaires partenaires.
      </p>

      <h2>4. Responsabilite</h2>
      <p>
        Transit Soft Services agit en qualite d&apos;intermediaire technique. La responsabilite
        materielle des colis incombe au transitaire emetteur. En cas de
        litige, le recours s&apos;effectue d&apos;abord aupres de l&apos;agence
        d&apos;envoi ou de reception indiquee sur le bordereau du colis.
      </p>

      <h2>5. Donnees personnelles</h2>
      <p>
        Le traitement de vos donnees est detaille dans notre{' '}
        <a
          href="/privacy"
          className="font-semibold underline"
          style={{ color: 'var(--skin-primary)' }}
        >
          politique de confidentialite
        </a>
        . Vous disposez d&apos;un droit d&apos;acces, de rectification et de
        suppression sur l&apos;ensemble des donnees vous concernant.
      </p>

      <h2>6. Modifications</h2>
      <p>
        Transit Soft Services se reserve le droit de modifier les presentes conditions a
        tout moment. Toute modification substantielle vous sera notifiee
        par email et / ou par notification dans l&apos;application au moins
        30 jours avant son entree en vigueur.
      </p>

      <h2>7. Contact</h2>
      <p>
        Pour toute question relative aux presentes conditions, contactez-nous
        a{' '}
        <a
          href="mailto:support@transitsoftservices.com"
          className="font-semibold underline"
          style={{ color: 'var(--skin-primary)' }}
        >
          support@transitsoftservices.com
        </a>
        .
      </p>
    </LegalPage>
  );
}
