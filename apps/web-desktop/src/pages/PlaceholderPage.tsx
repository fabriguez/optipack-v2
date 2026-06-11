import { Construction } from 'lucide-react';
import { useLocation } from 'react-router-dom';

// Placeholder temporaire pour les routes dont la page n'est pas encore portee
// (Etape 5 : portage des 76 pages verbatim, module par module). Permet de
// valider le routing, la sidebar (item actif) et la chrome du dashboard des
// maintenant. A remplacer une route a la fois.
export default function PlaceholderPage({ title }: { title?: string }) {
  const pathname = useLocation().pathname;
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-50">
          <Construction className="h-6 w-6 text-primary-700" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">
          {title ?? 'Page en cours de portage'}
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          La route <span className="font-mono text-xs text-gray-700">{pathname}</span> sera
          portee verbatim depuis le web a l&apos;étape 5.
        </p>
      </div>
    </div>
  );
}
