import PenaltiesPage from './PenaltiesPage';
import PenaltyDetailPage from './PenaltyDetailPage';

export const routes = [
  { path: 'penalties', element: <PenaltiesPage /> },
  { path: 'penalties/:id', element: <PenaltyDetailPage /> },
];
