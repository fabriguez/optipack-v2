import DisbursementsPage from './DisbursementsPage';
import DisbursementsDetailPage from './DisbursementsDetailPage';

export const routes = [
  { path: 'disbursements', element: <DisbursementsPage /> },
  { path: 'disbursements/:id', element: <DisbursementsDetailPage /> },
];
