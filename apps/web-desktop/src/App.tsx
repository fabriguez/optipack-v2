import { RouterProvider } from 'react-router-dom';
import { router } from './router';

// Point d'entree applicatif : le routing pilote l'affichage (login / dashboard
// / galerie). Les providers (auth, tenant, query) sont montes dans main.tsx
// au-dessus de App.
export default function App() {
  return <RouterProvider router={router} />;
}
