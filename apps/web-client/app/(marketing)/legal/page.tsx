import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/LegalPage';

export const metadata: Metadata = {
  title: 'Mentions legales | Transit Soft Services',
  description: 'Editeur, hebergeur et informations legales du site Transit Soft Services.',
};

export default function LegalNoticePage() {
  return (
    <LegalPage title="Mentions legales" lastUpdated="12 mai 2026">
      <h2>Editeur du site</h2>
      <p>
        <strong>Transit Soft Services SARL</strong>
        <br />
        Yaounde, Cameroun
        <br />
        Email :{' '}
        <a
          href="mailto:contact@transitsoftservices.com"
          className="font-semibold underline"
          style={{ color: 'var(--skin-primary)' }}
        >
          contact@transitsoftservices.com
        </a>
      </p>

      <h2>Directeur de la publication</h2>
      <p>Le representant legal de Transit Soft Services SARL.</p>

      <h2>Hebergement</h2>
      <p>
        Le site est heberge dans l&apos;Union Europeenne par un prestataire
        cloud conformement aux exigences RGPD et a la reglementation
        applicable. Pour toute question liee a l&apos;hebergement, contactez
        l&apos;editeur.
      </p>

      <h2>Propriete intellectuelle</h2>
      <p>
        L&apos;ensemble du site (textes, images, code source, logo) est protege
        par le droit d&apos;auteur. Toute reproduction sans autorisation
        ecrite prealable est interdite.
      </p>

      <h2>Liens utiles</h2>
      <ul>
        <li>
          <a
            href="/cgv"
            className="font-semibold underline"
            style={{ color: 'var(--skin-primary)' }}
          >
            Conditions generales de vente
          </a>
        </li>
        <li>
          <a
            href="/privacy"
            className="font-semibold underline"
            style={{ color: 'var(--skin-primary)' }}
          >
            Politique de confidentialite
          </a>
        </li>
        <li>
          <a
            href="/cookies"
            className="font-semibold underline"
            style={{ color: 'var(--skin-primary)' }}
          >
            Politique cookies
          </a>
        </li>
      </ul>
    </LegalPage>
  );
}
