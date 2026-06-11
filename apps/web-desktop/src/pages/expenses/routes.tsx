import ExpensesPage from './ExpensesPage';
import ExpenseDetailPage from './ExpenseDetailPage';

export const routes = [
  { path: 'expenses', element: <ExpensesPage /> },
  { path: 'expenses/:id', element: <ExpenseDetailPage /> },
];
