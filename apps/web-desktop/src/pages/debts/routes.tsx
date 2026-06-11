import DebtsPage from './DebtsPage';
import DebtDetailPage from './DebtDetailPage';

export const routes = [
  { path: 'debts', element: <DebtsPage /> },
  { path: 'debts/:id', element: <DebtDetailPage /> },
];
