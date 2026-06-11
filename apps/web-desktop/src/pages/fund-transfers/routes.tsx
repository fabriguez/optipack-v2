import FundTransfersPage from './FundTransfersPage';
import FundTransferDetailPage from './FundTransferDetailPage';

export const routes = [
  { path: 'fund-transfers', element: <FundTransfersPage /> },
  { path: 'fund-transfers/:id', element: <FundTransferDetailPage /> },
];
