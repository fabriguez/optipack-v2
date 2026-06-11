import EmployeesPage from './EmployeesPage';
import EmployeeDetailPage from './EmployeeDetailPage';

export const routes = [
  { path: 'employees', element: <EmployeesPage /> },
  { path: 'employees/:id', element: <EmployeeDetailPage /> },
];
