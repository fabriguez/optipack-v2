import AccountingPage from './AccountingPage';
import AccountingJournalDetailPage from './AccountingJournalDetailPage';

export const routes = [
  { path: 'accounting', element: <AccountingPage /> },
  { path: 'accounting/journal/:id', element: <AccountingJournalDetailPage /> },
];
